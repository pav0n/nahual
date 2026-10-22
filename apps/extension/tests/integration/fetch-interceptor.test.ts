import type { Outcome, PausedRequestView } from "@nahual/protocol";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RequestPausedEvent } from "../../src/background/debugger-port.ts";
import {
  createFetchInterceptor,
  type FetchInterceptor,
} from "../../src/background/fetch-interceptor.ts";
import { FakeDebugger } from "../fakes/fake-debugger.ts";

const TAB = 1;
let cdp: FakeDebugger;
let interceptor: FetchInterceptor;
let paused: PausedRequestView[];
let resolved: { pausedId: string; outcome: Outcome; errorKey?: string }[];

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(10_000);
  cdp = new FakeDebugger();
  await cdp.attach(TAB);
  paused = [];
  resolved = [];
  interceptor = createFetchInterceptor({
    debugger: cdp,
    isAttached: (tabId) => cdp.attached.has(tabId),
    onPaused: (_tabId, view) => void paused.push(view),
    onResolved: (_tabId, result) => void resolved.push(result),
  });
});

afterEach(() => {
  vi.useRealTimers();
});

const requestEvent = (id = "r1", extra: Partial<RequestPausedEvent> = {}): RequestPausedEvent => ({
  requestId: id,
  request: { url: "http://api.test/echo", method: "GET", headers: { Accept: "*/*", "X-Old": "1" } },
  resourceType: "Fetch",
  ...extra,
});

const responseEvent = (
  id = "r1",
  status = 200,
  headers = [{ name: "Content-Type", value: "application/json" }],
): RequestPausedEvent => ({
  ...requestEvent(id),
  responseStatusCode: status,
  responseHeaders: headers,
});

async function pause(event: RequestPausedEvent) {
  cdp.emit(TAB, "Fetch.requestPaused", event);
  await vi.advanceTimersByTimeAsync(0);
}

const sentWith = (method: string) => cdp.sent.filter((s) => s.method === method);

describe("patrones", () => {
  it("sin patrones no se llama a Fetch.enable (FR-007)", async () => {
    expect(cdp.sent).toEqual([]);
    expect(await interceptor.setPatterns(TAB, [])).toEqual({ ok: true });
    expect(cdp.sentMethods()).not.toContain("Fetch.enable");
  });

  it("traduce stage a requestStage e ignora duplicados exactos", async () => {
    const result = await interceptor.setPatterns(TAB, [
      { urlPattern: "*api*", stage: "request" },
      { urlPattern: "*api*", stage: "request" },
      { urlPattern: "*api*", stage: "response" },
    ]);
    expect(result).toEqual({ ok: true });
    expect(sentWith("Fetch.enable").at(-1)?.params).toEqual({
      patterns: [
        { urlPattern: "*api*", requestStage: "Request" },
        { urlPattern: "*api*", requestStage: "Response" },
      ],
    });
    expect(interceptor.getConfig(TAB).patterns).toHaveLength(2);
  });

  it("rechaza más de 10 patrones", async () => {
    const patterns = Array.from({ length: 11 }, (_, i) => ({
      urlPattern: `*${i}*`,
      stage: "request" as const,
    }));
    expect(await interceptor.setPatterns(TAB, patterns)).toEqual({
      ok: false,
      code: "pattern_invalid",
    });
    expect(cdp.sent).toEqual([]);
  });

  it("vaciar los patrones tras haberlos ⇒ Fetch.disable", async () => {
    await interceptor.setPatterns(TAB, [{ urlPattern: "*", stage: "request" }]);
    await interceptor.setPatterns(TAB, []);
    expect(cdp.sentMethods()).toEqual(["Fetch.enable", "Fetch.disable"]);
  });

  it("sin debugger adjunto responde not_attached", async () => {
    await cdp.detach(TAB);
    expect(await interceptor.setPatterns(TAB, [{ urlPattern: "*", stage: "request" }])).toEqual({
      ok: false,
      code: "not_attached",
    });
  });
});

describe("pausa y continuar", () => {
  beforeEach(async () => {
    await interceptor.setPatterns(TAB, [{ urlPattern: "*", stage: "request" }]);
  });

  it("requestPaused ⇒ evento paused con expiresAt = pausedAt + timeout", async () => {
    await pause(requestEvent());
    expect(paused).toEqual([
      {
        pausedId: "r1",
        tabId: TAB,
        stage: "request",
        method: "GET",
        url: "http://api.test/echo",
        headers: [
          { name: "Accept", value: "*/*" },
          { name: "X-Old", value: "1" },
        ],
        statusCode: null,
        bodyAvailable: false,
        bodySize: null,
        pausedAt: 10_000,
        expiresAt: 40_000,
      },
    ]);
  });

  it("en Request con body informa su tamaño", async () => {
    await pause(
      requestEvent("r1", {
        request: { url: "http://a", method: "POST", headers: {}, postData: "héllo" },
      } as Partial<RequestPausedEvent>),
    );
    expect(paused[0]).toMatchObject({ bodyAvailable: true, bodySize: 6 });
  });

  it("continue sin cambios en Request ⇒ Fetch.continueRequest { requestId }", async () => {
    await pause(requestEvent());
    expect(await interceptor.continue(TAB, "r1")).toEqual({ ok: true });
    expect(sentWith("Fetch.continueRequest").at(-1)?.params).toEqual({ requestId: "r1" });
    expect(resolved).toEqual([{ pausedId: "r1", outcome: "continued" }]);
  });

  it("continue sin cambios en Response ⇒ Fetch.continueResponse { requestId }", async () => {
    await pause(responseEvent());
    await interceptor.continue(TAB, "r1");
    expect(sentWith("Fetch.continueResponse").at(-1)?.params).toEqual({ requestId: "r1" });
    expect(resolved).toEqual([{ pausedId: "r1", outcome: "continued" }]);
  });

  it("continue con HeaderEdit[] en Request fusiona sin mayúsculas (null elimina)", async () => {
    await pause(requestEvent());
    await interceptor.continue(TAB, "r1", [
      { name: "x-old", value: null },
      { name: "X-Nahual", value: "1" },
      { name: "accept", value: "application/json" },
    ]);
    expect(sentWith("Fetch.continueRequest").at(-1)?.params).toEqual({
      requestId: "r1",
      headers: [
        { name: "X-Nahual", value: "1" },
        { name: "accept", value: "application/json" },
      ],
    });
    expect(resolved).toEqual([{ pausedId: "r1", outcome: "modified" }]);
  });

  it("continue con HeaderEdit[] en Response ⇒ responseHeaders junto con responseCode", async () => {
    // Chrome exige ambos: "Cannot override only status or headers, both should be provided".
    await pause(responseEvent());
    await interceptor.continue(TAB, "r1", [{ name: "X-Nahual-Response", value: "yes" }]);
    expect(sentWith("Fetch.continueResponse").at(-1)?.params).toEqual({
      requestId: "r1",
      responseCode: 200,
      responseHeaders: [
        { name: "Content-Type", value: "application/json" },
        { name: "X-Nahual-Response", value: "yes" },
      ],
    });
    expect(resolved).toEqual([{ pausedId: "r1", outcome: "modified" }]);
  });

  it("Response 3xx: no llama a getResponseBody y bodyAvailable false", async () => {
    await pause(responseEvent("r1", 302, [{ name: "Location", value: "/data" }]));
    expect(cdp.sentMethods()).not.toContain("Fetch.getResponseBody");
    expect(paused[0]).toMatchObject({ statusCode: 302, bodyAvailable: false, bodySize: null });
  });

  it("Response no 3xx: llama una vez a getResponseBody y rellena bodySize", async () => {
    cdp.respond("Fetch.getResponseBody", () => ({ body: "aGVsbG8=", base64Encoded: true }));
    await pause(responseEvent());
    expect(sentWith("Fetch.getResponseBody")).toHaveLength(1);
    expect(paused[0]).toMatchObject({ bodyAvailable: true, bodySize: 5 });

    cdp.respond("Fetch.getResponseBody", () => ({ body: "ñandú", base64Encoded: false }));
    await pause(responseEvent("r2"));
    expect(paused[1]).toMatchObject({ bodyAvailable: true, bodySize: 7 });
  });

  it("Response con Content-Length > 5 MB: no pide el body y usa el header", async () => {
    await pause(responseEvent("r1", 200, [{ name: "content-length", value: "6000000" }]));
    expect(cdp.sentMethods()).not.toContain("Fetch.getResponseBody");
    expect(paused[0]).toMatchObject({ bodyAvailable: true, bodySize: 6_000_000 });
  });

  it("si getResponseBody falla, la pausa sigue con bodyAvailable false", async () => {
    cdp.failSend("Fetch.getResponseBody", "cdp_error");
    await pause(responseEvent());
    expect(paused[0]).toMatchObject({ bodyAvailable: false, bodySize: null });
  });

  it("Response con responseErrorReason continúa de inmediato sin pausar", async () => {
    await pause({ ...requestEvent(), responseErrorReason: "ConnectionRefused" });
    expect(paused).toEqual([]);
    expect(sentWith("Fetch.continueRequest").at(-1)?.params).toEqual({ requestId: "r1" });
  });
});

describe("timeout", () => {
  beforeEach(async () => {
    await interceptor.setPatterns(TAB, [{ urlPattern: "*", stage: "request" }]);
  });

  it("por defecto 30 000 ms ⇒ continúa sin cambios y timed_out", async () => {
    await pause(requestEvent());
    await vi.advanceTimersByTimeAsync(29_999);
    expect(resolved).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(sentWith("Fetch.continueRequest").at(-1)?.params).toEqual({ requestId: "r1" });
    expect(resolved).toEqual([{ pausedId: "r1", outcome: "timed_out" }]);
  });

  it("setPauseTimeout acepta 5–120 s y aplica solo a pausas nuevas", async () => {
    await pause(requestEvent("old"));
    expect(interceptor.setPauseTimeout(TAB, 5)).toEqual({ ok: true });
    expect(interceptor.getConfig(TAB).pauseTimeoutSeconds).toBe(5);
    await pause(requestEvent("new"));
    expect(paused[1]?.expiresAt).toBe(15_000);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(resolved).toEqual([{ pausedId: "new", outcome: "timed_out" }]);
    await vi.advanceTimersByTimeAsync(25_000);
    expect(resolved.map((r) => r.pausedId)).toEqual(["new", "old"]);
  });

  it.each([4, 121, 30.5])("rechaza %s con timeout_out_of_range y conserva el valor", (s) => {
    interceptor.setPauseTimeout(TAB, 60);
    expect(interceptor.setPauseTimeout(TAB, s)).toEqual({
      ok: false,
      code: "timeout_out_of_range",
    });
    expect(interceptor.getConfig(TAB).pauseTimeoutSeconds).toBe(60);
  });
});

describe("errores y resolución única", () => {
  beforeEach(async () => {
    await interceptor.setPatterns(TAB, [{ urlPattern: "*", stage: "request" }]);
  });

  it("si continueRequest con headers falla, reintenta una vez sin cambios ⇒ failed", async () => {
    await pause(requestEvent());
    cdp.failSend("Fetch.continueRequest", "cdp_error");
    await interceptor.continue(TAB, "r1", [{ name: "X-Nahual", value: "1" }]);
    const calls = sentWith("Fetch.continueRequest");
    expect(calls.map((c) => c.params)).toEqual([
      { requestId: "r1", headers: expect.any(Array) },
      { requestId: "r1" },
    ]);
    expect(resolved).toEqual([{ pausedId: "r1", outcome: "failed", errorKey: "error_cdp_error" }]);
  });

  it("interceptación inválida (navegación/cierre) ⇒ abandoned, sin reintento", async () => {
    await pause(requestEvent());
    cdp.failSend("Fetch.continueRequest", "invalid_interception");
    await interceptor.continue(TAB, "r1", [{ name: "X-Nahual", value: "1" }]);
    expect(sentWith("Fetch.continueRequest")).toHaveLength(1);
    expect(resolved).toEqual([{ pausedId: "r1", outcome: "abandoned" }]);
  });

  it("interceptación inválida al vencer el timeout ⇒ abandoned", async () => {
    await pause(requestEvent());
    cdp.failSend("Fetch.continueRequest", "invalid_interception");
    await vi.advanceTimersByTimeAsync(30_000);
    expect(resolved).toEqual([{ pausedId: "r1", outcome: "abandoned" }]);
  });

  it("un segundo continue o un timeout tras resolver no llama a CDP", async () => {
    await pause(requestEvent());
    await interceptor.continue(TAB, "r1");
    const before = cdp.sent.length;
    expect(await interceptor.continue(TAB, "r1")).toEqual({
      ok: false,
      code: "unknown_paused_id",
    });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(cdp.sent.length).toBe(before);
    expect(resolved).toHaveLength(1);
  });

  it("un detach resuelve todas las pausas como abandoned y vacía los patrones", async () => {
    await pause(requestEvent("a"));
    await pause(requestEvent("b"));
    const before = cdp.sent.length;
    interceptor.sessionEnded(TAB);
    expect(resolved).toEqual([
      { pausedId: "a", outcome: "abandoned" },
      { pausedId: "b", outcome: "abandoned" },
    ]);
    expect(interceptor.getConfig(TAB).patterns).toEqual([]);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(cdp.sent.length).toBe(before);
  });

  it("vaciar los patrones continúa sin cambios las pausas pendientes", async () => {
    await pause(requestEvent("a"));
    await interceptor.setPatterns(TAB, []);
    expect(resolved).toEqual([{ pausedId: "a", outcome: "continued" }]);
  });

  it("forget borra la configuración de la pestaña", () => {
    interceptor.setPauseTimeout(TAB, 60);
    interceptor.forget(TAB);
    expect(interceptor.getConfig(TAB)).toEqual({ patterns: [], pauseTimeoutSeconds: 30 });
  });
});
