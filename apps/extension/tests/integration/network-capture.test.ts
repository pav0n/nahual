import type { ExchangeUpdate } from "@nahual/domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createNetworkCapture, type NetworkCapture } from "../../src/background/network-capture.ts";
import {
  corsFailed,
  loadingFailed,
  loadingFinished,
  requestWillBeSent,
  requestWillBeSentExtraInfo,
  responseReceived,
} from "../fakes/cdp-events.ts";
import { FakeDebugger } from "../fakes/fake-debugger.ts";

let cdp: FakeDebugger;
let capture: NetworkCapture;
let batches: ExchangeUpdate[][];

const all = () => batches.flat();
const of = (id: string) => all().filter((u) => u.id === id);

beforeEach(async () => {
  vi.useFakeTimers();
  cdp = new FakeDebugger();
  await cdp.attach(1);
  batches = [];
  capture = createNetworkCapture({
    debugger: cdp,
    onUpdates: (tabId, updates) => {
      if (tabId === 1) batches.push(updates);
    },
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("NetworkCapture: eventos ⇒ ExchangeUpdate (research R1, R2)", () => {
  it("requestWillBeSent ⇒ start con método, URL, tipo, headers y orden", () => {
    cdp.emit(
      1,
      "Network.requestWillBeSent",
      requestWillBeSent("r1", { method: "POST", postData: '{"a":1}' }),
    );
    cdp.emit(1, "Network.requestWillBeSent", requestWillBeSent("r2"));
    vi.advanceTimersByTime(50);
    const [start] = of("r1");
    expect(start).toMatchObject({
      kind: "start",
      fields: {
        seq: 0,
        method: "POST",
        url: "https://api.test/items",
        urlTruncated: false,
        resourceType: "Fetch",
        isPreflight: false,
        state: "pending",
        status: null,
        requestHeaders: [{ name: "accept", value: "application/json" }],
        requestBody: { available: true, size: 7 },
      },
    });
    expect(of("r2")[0]?.fields.seq).toBe(1);
  });

  it("responseReceived y loadingFinished completan status, tamaño y duración", () => {
    cdp.emit(1, "Network.requestWillBeSent", requestWillBeSent("r1", { timestamp: 10 }));
    cdp.emit(1, "Network.responseReceived", responseReceived("r1", { status: 404 }));
    cdp.emit(1, "Network.dataReceived", {
      requestId: "r1",
      dataLength: 300,
      encodedDataLength: 120,
    });
    cdp.emit(1, "Network.loadingFinished", loadingFinished("r1", 150, 10.25));
    vi.advanceTimersByTime(50);
    expect(of("r1").map((u) => u.kind)).toEqual(["start", "response", "finish"]);
    expect(of("r1")[1]?.fields).toMatchObject({ status: 404, mimeType: "application/json" });
    expect(of("r1")[2]?.fields).toMatchObject({
      state: "complete",
      encodedSize: 150,
      decodedSize: 300,
      durationMs: 250,
      responseBody: { available: true, size: 300 },
    });
  });

  it("loadingFailed ⇒ fail con el texto del error", () => {
    cdp.emit(1, "Network.requestWillBeSent", requestWillBeSent("r1"));
    cdp.emit(1, "Network.loadingFailed", loadingFailed("r1", "net::ERR_CONNECTION_REFUSED"));
    vi.advanceTimersByTime(50);
    expect(of("r1")[1]).toMatchObject({
      kind: "fail",
      fields: { state: "failed", errorText: "net::ERR_CONNECTION_REFUSED" },
    });
  });

  it("los headers de ExtraInfo prevalecen, lleguen antes o después", () => {
    cdp.emit(1, "Network.requestWillBeSentExtraInfo", {
      requestId: "r1",
      headers: { cookie: "sid=1", accept: "application/json" },
    });
    cdp.emit(1, "Network.requestWillBeSent", requestWillBeSent("r1"));
    cdp.emit(1, "Network.responseReceived", responseReceived("r1"));
    cdp.emit(1, "Network.responseReceivedExtraInfo", {
      requestId: "r1",
      statusCode: 200,
      headers: { "set-cookie": "sid=2", "content-type": "application/json" },
    });
    vi.advanceTimersByTime(50);
    expect(of("r1")[0]?.fields.requestHeaders).toEqual([
      { name: "cookie", value: "sid=1" },
      { name: "accept", value: "application/json" },
    ]);
    expect(of("r1").at(-1)).toMatchObject({
      kind: "headers",
      fields: {
        responseHeaders: [
          { name: "set-cookie", value: "sid=2" },
          { name: "content-type", value: "application/json" },
        ],
      },
    });
  });

  it("OPTIONS con Access-Control-Request-Method ⇒ isPreflight", () => {
    cdp.emit(
      1,
      "Network.requestWillBeSent",
      requestWillBeSent("r1", {
        method: "OPTIONS",
        headers: { "Access-Control-Request-Method": "PUT" },
      }),
    );
    vi.advanceTimersByTime(50);
    expect(of("r1")[0]?.fields.isPreflight).toBe(true);
  });

  it("redirección: cierra la entrada como 3xx sin body y abre otra con #n", () => {
    cdp.emit(
      1,
      "Network.requestWillBeSent",
      requestWillBeSent("r1", { url: "https://api.test/redirect" }),
    );
    cdp.emit(
      1,
      "Network.requestWillBeSent",
      requestWillBeSent("r1", {
        url: "https://api.test/data",
        redirectResponse: {
          url: "https://api.test/redirect",
          status: 302,
          headers: { location: "/data" },
        },
      }),
    );
    cdp.emit(1, "Network.responseReceived", responseReceived("r1"));
    vi.advanceTimersByTime(50);
    expect(of("r1").map((u) => u.kind)).toEqual(["start", "response", "finish"]);
    expect(of("r1")[1]?.fields.status).toBe(302);
    expect(of("r1")[2]?.fields.responseBody).toEqual({
      available: false,
      size: null,
      reason: "redirect",
    });
    expect(of("r1#1")[0]).toMatchObject({
      kind: "start",
      fields: { url: "https://api.test/data" },
    });
    expect(of("r1#1")[1]?.kind).toBe("response");
    expect(capture.exchangeIdOf(1, "r1")).toBe("r1#1");
  });

  it("URL de más de 8 KB se recorta y se marca", () => {
    const url = `https://api.test/${"a".repeat(9000)}`;
    cdp.emit(1, "Network.requestWillBeSent", requestWillBeSent("r1", { url }));
    vi.advanceTimersByTime(50);
    expect(of("r1")[0]?.fields.urlTruncated).toBe(true);
    expect(of("r1")[0]?.fields.url?.length).toBeLessThanOrEqual(8193);
  });

  it("body binario o > 5 MB solo con metadatos", () => {
    cdp.emit(1, "Network.requestWillBeSent", requestWillBeSent("img"));
    cdp.emit(1, "Network.responseReceived", responseReceived("img", { mimeType: "image/png" }));
    cdp.emit(1, "Network.loadingFinished", loadingFinished("img", 68));
    cdp.emit(1, "Network.requestWillBeSent", requestWillBeSent("big"));
    cdp.emit(1, "Network.responseReceived", responseReceived("big"));
    cdp.emit(1, "Network.dataReceived", {
      requestId: "big",
      dataLength: 6 * 1024 * 1024,
      encodedDataLength: 0,
    });
    cdp.emit(1, "Network.loadingFinished", loadingFinished("big", 100));
    vi.advanceTimersByTime(50);
    expect(of("img").at(-1)?.fields.responseBody).toEqual({
      available: false,
      size: 68,
      reason: "binary",
    });
    expect(of("big").at(-1)?.fields.responseBody).toEqual({
      available: false,
      size: 6 * 1024 * 1024,
      reason: "tooLarge",
    });
  });
});

describe("NetworkCapture: lotes (research R11)", () => {
  it("agrupa cada 50 ms", () => {
    cdp.emit(1, "Network.requestWillBeSent", requestWillBeSent("r1"));
    cdp.emit(1, "Network.requestWillBeSent", requestWillBeSent("r2"));
    expect(batches).toEqual([]);
    vi.advanceTimersByTime(49);
    expect(batches).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(2);
  });

  it("con 200 updates pendientes envía el lote sin esperar", () => {
    for (let i = 0; i < 201; i++)
      cdp.emit(1, "Network.requestWillBeSent", requestWillBeSent(`r${i}`));
    expect(batches[0]).toHaveLength(200);
    vi.advanceTimersByTime(50);
    expect(batches[1]).toHaveLength(1);
  });

  it("los updates nunca contienen bodies", () => {
    cdp.emit(
      1,
      "Network.requestWillBeSent",
      requestWillBeSent("r1", { method: "POST", postData: "SECRETO" }),
    );
    vi.advanceTimersByTime(50);
    expect(JSON.stringify(batches)).not.toContain("SECRETO");
  });

  it("effect añade el efecto de una regla al lote", () => {
    cdp.emit(1, "Network.requestWillBeSent", requestWillBeSent("r1"));
    capture.effect(1, "r1", {
      stage: "response",
      ruleId: "3f1c2b4a-8d9e-4f60-a1b2-c3d4e5f60718",
      ruleName: "Errores",
      result: "paused",
    });
    vi.advanceTimersByTime(50);
    expect(of("r1")[1]).toMatchObject({ kind: "effect", effect: { result: "paused" } });
  });

  it("al terminar la sesión se envía lo pendiente y se olvida la pestaña", () => {
    cdp.emit(1, "Network.requestWillBeSent", requestWillBeSent("r1"));
    capture.sessionEnded(1);
    expect(batches).toHaveLength(1);
    expect(capture.exchangeIdOf(1, "r1")).toBeNull();
  });
});

describe("NetworkCapture: getBody bajo demanda", () => {
  const finished = (id: string, mimeType = "application/json") => {
    cdp.emit(
      1,
      "Network.requestWillBeSent",
      requestWillBeSent(id, { method: "POST", hasPostData: true }),
    );
    cdp.emit(
      1,
      "Network.responseReceived",
      responseReceived(id, { mimeType, headers: { "content-type": mimeType } }),
    );
    cdp.emit(1, "Network.loadingFinished", loadingFinished(id));
  };

  it("response textual ⇒ texto (descomprimido por Chrome)", async () => {
    finished("r1");
    cdp.respond("Network.getResponseBody", () => ({ body: '{"ok":true}', base64Encoded: false }));
    expect(await capture.getBody(1, "r1", "response")).toEqual({
      ok: true,
      encoding: "text",
      content: '{"ok":true}',
      size: 11,
    });
    expect(cdp.calls("Network.getResponseBody")).toEqual([{ requestId: "r1" }]);
  });

  it("request ⇒ Network.getRequestPostData", async () => {
    finished("r1");
    cdp.respond("Network.getRequestPostData", () => ({ postData: "a=1" }));
    expect(await capture.getBody(1, "r1", "request")).toMatchObject({ ok: true, content: "a=1" });
  });

  it("binario, desalojado, redirección o desconocido ⇒ motivo", async () => {
    finished("img", "image/png");
    cdp.respond("Network.getResponseBody", () => ({ body: btoa("\x89PNG"), base64Encoded: true }));
    expect(await capture.getBody(1, "img", "response")).toEqual({ ok: false, reason: "binary" });

    finished("gone");
    cdp.failSend("Network.getResponseBody", "cdp_error");
    expect(await capture.getBody(1, "gone", "response")).toEqual({ ok: false, reason: "evicted" });

    expect(await capture.getBody(1, "nope", "response")).toEqual({ ok: false, reason: "unknown" });
  });

  it("una entrada de redirección no tiene body", async () => {
    cdp.emit(1, "Network.requestWillBeSent", requestWillBeSent("r1"));
    cdp.emit(
      1,
      "Network.requestWillBeSent",
      requestWillBeSent("r1", { redirectResponse: { url: "x", status: 301, headers: {} } }),
    );
    expect(await capture.getBody(1, "r1", "response")).toEqual({ ok: false, reason: "redirect" });
  });
});

describe("NetworkCapture: diagnóstico CORS (003, research R3, R6)", () => {
  const APP = "http://localhost:3000";
  const API = "https://api.test";
  let frameOrigins: Map<string, string>;
  let corsFailures: { tabId: number; exchangeId: string; cause: string }[];

  beforeEach(async () => {
    // CDP propio: el de la suite ya tiene otra captura escuchando.
    cdp = new FakeDebugger();
    await cdp.attach(1);
    frameOrigins = new Map([["main", APP]]);
    corsFailures = [];
    capture = createNetworkCapture({
      debugger: cdp,
      onUpdates: (tabId, updates) => {
        if (tabId === 1) batches.push(updates);
      },
      frameOriginOf: (_tabId, frameId) => (frameId ? (frameOrigins.get(frameId) ?? null) : null),
      onCorsFailure: (tabId, exchangeId, diagnosis) =>
        corsFailures.push({ tabId, exchangeId, cause: diagnosis.cause }),
    });
  });

  const corsOf = (id: string) => of(id).find((u) => u.kind === "cors")?.cors;

  it("start lleva el origen de la app del frame", () => {
    cdp.emit(1, "Network.requestWillBeSent", requestWillBeSent("r1", { frameId: "main" }));
    vi.runAllTimers();
    expect(of("r1")[0]?.fields.appOrigin).toBe(APP);
  });

  it("loadingFailed con corsErrorStatus ⇒ update cors con el diagnóstico", () => {
    cdp.emit(
      1,
      "Network.requestWillBeSent",
      requestWillBeSent("r1", { url: `${API}/items?token=secret`, frameId: "main" }),
    );
    cdp.emit(
      1,
      "Network.requestWillBeSentExtraInfo",
      requestWillBeSentExtraInfo("r1", {
        Cookie: "session=secret",
        Authorization: "Bearer secret",
        "X-Custom": "1",
      }),
    );
    cdp.emit(
      1,
      "Network.responseReceived",
      responseReceived("r1", {
        status: 200,
        headers: { "access-control-allow-origin": "https://otro.test" },
      }),
    );
    cdp.emit(1, "Network.loadingFailed", corsFailed("r1", "AllowOriginMismatch"));
    vi.runAllTimers();
    const diagnosis = corsOf("r1")?.diagnosis;
    expect(diagnosis).toMatchObject({
      cause: "origin_mismatch",
      appOrigin: APP,
      apiOrigin: API,
      method: "GET",
      requestedHeaders: ["authorization", "x-custom"],
      credentials: "yes",
      responseStatus: 200,
      serverCorsHeaders: [{ name: "access-control-allow-origin", value: "https://otro.test" }],
      relaxable: true,
    });
    expect(JSON.stringify(diagnosis)).not.toMatch(/secret/);
    expect(corsFailures).toEqual([{ tabId: 1, exchangeId: "r1", cause: "origin_mismatch" }]);
  });

  it("respuesta bloqueada sin responseReceived: status y headers salen de ExtraInfo", () => {
    cdp.emit(1, "Network.requestWillBeSent", requestWillBeSent("r1", { frameId: "main" }));
    cdp.emit(1, "Network.responseReceivedExtraInfo", {
      requestId: "r1",
      statusCode: 200,
      headers: { "Access-Control-Allow-Origin": "https://otro.example" },
    });
    cdp.emit(1, "Network.loadingFailed", corsFailed("r1", "AllowOriginMismatch"));
    vi.runAllTimers();
    expect(corsOf("r1")?.diagnosis).toMatchObject({
      responseStatus: 200,
      serverCorsHeaders: [{ name: "Access-Control-Allow-Origin", value: "https://otro.example" }],
    });
  });

  it("si la respuesta del preflight llega después del bloqueo, el diagnóstico la espera", () => {
    cdp.emit(
      1,
      "Network.requestWillBeSent",
      requestWillBeSent("r1", { method: "PUT", url: `${API}/items`, frameId: "main" }),
    );
    cdp.emit(
      1,
      "Network.requestWillBeSent",
      requestWillBeSent("p1", {
        method: "OPTIONS",
        url: `${API}/items`,
        frameId: "main",
        headers: { "Access-Control-Request-Method": "PUT" },
        initiator: { type: "preflight", requestId: "r1" },
      }),
    );
    cdp.emit(1, "Network.loadingFailed", corsFailed("r1", "PreflightMissingAllowOriginHeader"));
    vi.advanceTimersByTime(20);
    cdp.emit(1, "Network.responseReceived", responseReceived("p1", { status: 401, headers: {} }));
    vi.runAllTimers();
    expect(corsOf("r1")?.diagnosis).toMatchObject({
      cause: "preflight_status",
      preflightStatus: 401,
    });
  });

  it("el preflight puede llegar antes que su request: se relacionan igual", () => {
    cdp.emit(
      1,
      "Network.requestWillBeSent",
      requestWillBeSent("p1", {
        method: "OPTIONS",
        url: `${API}/items`,
        headers: { "Access-Control-Request-Method": "PUT" },
        initiator: { type: "preflight", requestId: "r1" },
      }),
    );
    cdp.emit(
      1,
      "Network.requestWillBeSent",
      requestWillBeSent("r1", { method: "PUT", url: `${API}/items`, frameId: "main" }),
    );
    cdp.emit(1, "Network.responseReceived", responseReceived("p1", { status: 401, headers: {} }));
    cdp.emit(1, "Network.loadingFailed", corsFailed("r1", "PreflightMissingAllowOriginHeader"));
    vi.runAllTimers();
    expect(of("p1").some((u) => u.fields.preflightFor === "r1")).toBe(true);
    expect(corsOf("r1")?.diagnosis).toMatchObject({
      cause: "preflight_status",
      preflightExchangeId: "p1",
    });
  });

  it("el bloqueo de preflight puede llegar antes que el propio preflight: lo espera", () => {
    cdp.emit(
      1,
      "Network.requestWillBeSent",
      requestWillBeSent("r1", { method: "PUT", url: `${API}/items`, frameId: "main" }),
    );
    cdp.emit(1, "Network.loadingFailed", corsFailed("r1", "PreflightMissingAllowOriginHeader"));
    vi.advanceTimersByTime(30);
    cdp.emit(
      1,
      "Network.requestWillBeSent",
      requestWillBeSent("p1", {
        method: "OPTIONS",
        url: `${API}/items`,
        headers: { "Access-Control-Request-Method": "PUT" },
        initiator: { type: "preflight", requestId: "r1" },
      }),
    );
    cdp.emit(1, "Network.responseReceived", responseReceived("p1", { status: 401, headers: {} }));
    vi.runAllTimers();
    expect(corsOf("r1")?.diagnosis).toMatchObject({
      cause: "preflight_status",
      preflightStatus: 401,
    });
  });

  it("un bloqueo que no es de preflight no espera", () => {
    cdp.emit(1, "Network.requestWillBeSent", requestWillBeSent("r1", { frameId: "main" }));
    cdp.emit(1, "Network.loadingFailed", corsFailed("r1", "MissingAllowOriginHeader"));
    vi.advanceTimersByTime(60);
    expect(corsOf("r1")?.diagnosis?.cause).toBe("missing_allow_origin");
  });

  it("si la respuesta del preflight no llega, diagnostica igual tras la espera", () => {
    cdp.emit(
      1,
      "Network.requestWillBeSent",
      requestWillBeSent("r1", { method: "PUT", url: `${API}/items`, frameId: "main" }),
    );
    cdp.emit(
      1,
      "Network.requestWillBeSent",
      requestWillBeSent("p1", {
        method: "OPTIONS",
        url: `${API}/items`,
        headers: { "Access-Control-Request-Method": "PUT" },
        initiator: { type: "preflight", requestId: "r1" },
      }),
    );
    cdp.emit(1, "Network.loadingFailed", corsFailed("r1", "PreflightMissingAllowOriginHeader"));
    vi.runAllTimers();
    expect(corsOf("r1")?.diagnosis).toMatchObject({
      cause: "missing_allow_origin",
      preflightStatus: null,
    });
  });

  it("loadingFailed sin corsErrorStatus o solo con blockedReason ⇒ sin cors", () => {
    cdp.emit(1, "Network.requestWillBeSent", requestWillBeSent("r1", { frameId: "main" }));
    cdp.emit(1, "Network.loadingFailed", loadingFailed("r1"));
    cdp.emit(1, "Network.requestWillBeSent", requestWillBeSent("r2", { frameId: "main" }));
    cdp.emit(
      1,
      "Network.loadingFailed",
      loadingFailed("r2", "net::ERR_BLOCKED_BY_CLIENT", 3, { blockedReason: "inspector" }),
    );
    vi.runAllTimers();
    expect(corsOf("r1")).toBeUndefined();
    expect(corsOf("r2")).toBeUndefined();
    expect(corsFailures).toEqual([]);
  });

  it("sin frame conocido usa el header Origin crudo; sin él, null y no relajable", () => {
    cdp.emit(1, "Network.requestWillBeSent", requestWillBeSent("r1", { frameId: "unknown" }));
    cdp.emit(
      1,
      "Network.requestWillBeSentExtraInfo",
      requestWillBeSentExtraInfo("r1", { Origin: "http://localhost:3000" }),
    );
    cdp.emit(1, "Network.loadingFailed", corsFailed("r1", "MissingAllowOriginHeader"));
    cdp.emit(1, "Network.requestWillBeSent", requestWillBeSent("r2"));
    cdp.emit(1, "Network.loadingFailed", corsFailed("r2", "MissingAllowOriginHeader"));
    vi.runAllTimers();
    expect(corsOf("r1")?.diagnosis?.appOrigin).toBe(APP);
    expect(corsOf("r2")?.diagnosis).toMatchObject({
      appOrigin: null,
      relaxable: false,
      notRelaxableReason: "null_origin",
    });
  });

  it("preflight por Network: se relaciona por initiator y aporta su status (X2)", () => {
    cdp.emit(
      1,
      "Network.requestWillBeSent",
      requestWillBeSent("r1", { method: "PUT", url: `${API}/items`, frameId: "main" }),
    );
    cdp.emit(
      1,
      "Network.requestWillBeSent",
      requestWillBeSent("p1", {
        method: "OPTIONS",
        url: `${API}/items`,
        type: "Other",
        frameId: "main",
        headers: {
          "Access-Control-Request-Method": "PUT",
          "Access-Control-Request-Headers": "x-custom",
        },
        initiator: { type: "preflight", requestId: "r1" },
      }),
    );
    cdp.emit(1, "Network.responseReceived", responseReceived("p1", { status: 401, headers: {} }));
    cdp.emit(1, "Network.loadingFailed", corsFailed("r1", "PreflightMissingAllowOriginHeader"));
    vi.runAllTimers();
    expect(of("p1")[0]?.fields).toMatchObject({ isPreflight: true, preflightFor: "r1" });
    expect(corsOf("r1")?.diagnosis).toMatchObject({
      cause: "preflight_status",
      preflightStatus: 401,
      preflightExchangeId: "p1",
      requestedHeaders: ["x-custom"],
      atPreflight: true,
    });
  });
});
