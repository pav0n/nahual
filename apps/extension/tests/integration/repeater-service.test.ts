import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BodyResult, ExchangeSnapshot } from "../../src/background/network-capture.ts";
import type { PageSender } from "../../src/background/repeater/page-send.ts";
import type {
  PageSendArgument,
  PageSendResult,
} from "../../src/background/repeater/page-template.ts";
import type { CleanSendResult } from "../../src/background/repeater/clean-send.ts";
import {
  createRepeaterService,
  type RepeaterResultPayload,
  type RepeaterService,
} from "../../src/background/repeater/repeater-service.ts";

// 005 (research R2–R5, R15; FR-010 a FR-017): validación, modo efectivo, cola por pestaña,
// cancelación, contexto perdido, timeout y armado del resultado.

const ID1 = "3f1c2b4a-8d9e-4f60-a1b2-c3d4e5f60718";
const ID2 = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";

const request = (overrides: Record<string, unknown> = {}) => ({
  method: "GET",
  url: "https://api.test/items",
  headers: [
    { name: "accept", value: "*/*", enabled: true },
    { name: "cookie", value: "a=1", enabled: true },
    { name: "x-off", value: "1", enabled: false },
  ],
  body: { kind: "none" },
  ...overrides,
});

const snapshot = (overrides: Partial<ExchangeSnapshot> = {}): ExchangeSnapshot => ({
  state: "complete",
  status: 200,
  responseHeaders: [{ name: "content-type", value: "application/json" }],
  mimeType: "application/json",
  errorText: null,
  effects: [],
  diagnosis: null,
  relaxed: false,
  preflight: null,
  durationMs: 12,
  decodedSize: 2,
  ...overrides,
});

let results: { tabId: number; result: RepeaterResultPayload }[];
let attached: boolean;
let pageCalls: { tabId: number; argument: PageSendArgument }[];
let pageReplies: ((value: PageSendResult) => void)[];
let aborts: string[];
let snapshots: Map<string, ExchangeSnapshot>;
let bodies: Map<string, BodyResult>;
let cleanReply: (signal: AbortSignal) => Promise<CleanSendResult>;
let service: RepeaterService;

const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

beforeEach(() => {
  vi.useFakeTimers();
  results = [];
  attached = true;
  pageCalls = [];
  pageReplies = [];
  aborts = [];
  snapshots = new Map();
  bodies = new Map();
  cleanReply = async () => ({
    ok: true,
    response: {
      status: 201,
      headers: [],
      body: { encoding: "text", text: "{}" },
      mimeType: "application/json",
    },
    size: 2,
  });
  const pageSender: PageSender = {
    send: (tabId, argument) =>
      new Promise((resolve) => {
        pageCalls.push({ tabId, argument });
        pageReplies.push(resolve);
      }),
    abort: async (_tabId, sendId) => {
      aborts.push(sendId);
    },
    invalidate: () => {},
  };
  service = createRepeaterService({
    pageSender,
    cleanSender: { send: (_argument, signal) => cleanReply(signal) },
    isAttached: () => attached,
    capture: {
      snapshot: (_tab, exchangeId) => snapshots.get(exchangeId) ?? null,
      getBody: async (_tab, exchangeId) =>
        bodies.get(exchangeId) ?? { ok: false, reason: "evicted" },
    },
    onResult: (tabId, result) => results.push({ tabId, result }),
  });
});

afterEach(() => {
  vi.useRealTimers();
});

/** Simula la captura: el request de la plantilla empieza y termina. */
function captured(sendId: string, exchangeId: string, snap = snapshot(), body?: BodyResult) {
  snapshots.set(exchangeId, snap);
  if (body) bodies.set(exchangeId, body);
  service.onRepeaterRequest(1, sendId, exchangeId);
  service.onRepeaterSettled(1, sendId, exchangeId);
}

describe("RepeaterService: validación y modo", () => {
  it("request inválido ⇒ invalid_request con las rutas y sin enviar", async () => {
    service.send(1, { sendId: ID1, mode: "page", request: request({ url: "nope" }) });
    await flush();
    expect(pageCalls).toEqual([]);
    expect(results[0]?.result).toMatchObject({
      sendId: ID1,
      state: "failed",
      error: { code: "invalid_request", params: ["url"] },
    });
  });

  it("contexto de página sin debugger adjunto ⇒ not_attached", async () => {
    attached = false;
    service.send(1, { sendId: ID1, mode: "page", request: request() });
    await flush();
    expect(pageCalls).toEqual([]);
    expect(results[0]?.result.error?.code).toBe("not_attached");
  });

  it("solo los headers activos viajan, y los prohibidos se informan", async () => {
    service.send(1, { sendId: ID1, mode: "page", request: request() });
    await flush();
    expect(pageCalls[0]?.argument).toEqual({
      sendId: ID1,
      method: "GET",
      url: "https://api.test/items",
      headers: [
        ["accept", "*/*"],
        ["cookie", "a=1"],
      ],
      body: { kind: "none" },
    });
    captured(ID1, "net-1", snapshot(), { ok: true, encoding: "text", content: '{"a":1}', size: 7 });
    pageReplies[0]?.({ ok: true, status: 200 });
    await flush();
    expect(results[0]?.result.notSentHeaders).toEqual(["cookie"]);
  });

  it("un sendId repetido mientras está pendiente ⇒ invalid_request", async () => {
    service.send(1, { sendId: ID1, mode: "page", request: request() });
    service.send(1, { sendId: ID1, mode: "page", request: request() });
    await flush();
    expect(pageCalls).toHaveLength(1);
    expect(results[0]?.result).toMatchObject({
      state: "failed",
      error: { code: "invalid_request" },
    });
  });
});

describe("RepeaterService: contexto de página", () => {
  it("arma el resultado con la respuesta de la captura, reglas, relajación y preflight", async () => {
    service.send(1, { sendId: ID1, mode: "page", request: request() });
    await flush();
    expect(service.currentPageSend(1)).toBe(ID1);
    const effect = {
      stage: "response" as const,
      ruleId: ID2,
      ruleName: "Errores",
      result: "paused" as const,
    };
    captured(
      ID1,
      "net-1",
      snapshot({ effects: [effect], relaxed: true, preflight: { status: 204 } }),
      { ok: true, encoding: "text", content: '{"a":1}', size: 7 },
    );
    pageReplies[0]?.({ ok: true, status: 200 });
    await flush();
    expect(results[0]?.result).toEqual({
      sendId: ID1,
      state: "done",
      response: {
        status: 200,
        headers: [{ name: "content-type", value: "application/json" }],
        body: { encoding: "text", text: '{"a":1}' },
        mimeType: "application/json",
      },
      error: null,
      durationMs: 12,
      size: 7,
      preflight: { status: 204, blocked: false },
      ruleEffects: [effect],
      relaxed: true,
      cors: null,
      notSentHeaders: ["cookie"],
      exchangeId: "net-1",
    });
    expect(service.currentPageSend(1)).toBeNull();
  });

  it("espera a que la captura termine aunque la plantilla responda antes", async () => {
    service.send(1, { sendId: ID1, mode: "page", request: request() });
    await flush();
    snapshots.set("net-1", snapshot());
    service.onRepeaterRequest(1, ID1, "net-1");
    pageReplies[0]?.({ ok: true, status: 200 });
    await flush();
    expect(results).toEqual([]);
    service.onRepeaterSettled(1, ID1, "net-1");
    await flush();
    expect(results[0]?.result.state).toBe("done");
  });

  it("body no disponible ⇒ solo metadatos", async () => {
    service.send(1, { sendId: ID1, mode: "page", request: request() });
    await flush();
    captured(ID1, "net-1", snapshot({ decodedSize: 40 }), { ok: false, reason: "binary" });
    pageReplies[0]?.({ ok: true, status: 200 });
    await flush();
    expect(results[0]?.result.response?.body).toEqual({
      encoding: "none",
      info: { available: false, size: 40, reason: "binary" },
    });
  });

  it("bloqueo CORS ⇒ cors_blocked con el diagnóstico y lo que vio la captura", async () => {
    service.send(1, { sendId: ID1, mode: "page", request: request() });
    await flush();
    const diagnosis = { cause: "missing_allow_origin" } as unknown as ExchangeSnapshot["diagnosis"];
    captured(
      ID1,
      "net-1",
      snapshot({ state: "failed", status: 200, diagnosis, preflight: { status: 401 } }),
    );
    pageReplies[0]?.({ ok: false, errorName: "TypeError", message: "Failed to fetch" });
    await flush();
    expect(results[0]?.result).toMatchObject({
      state: "failed",
      error: { code: "cors_blocked" },
      cors: diagnosis,
      preflight: { status: 401, blocked: true },
      response: { status: 200, body: { encoding: "none" } },
    });
  });

  it("fallo de red ⇒ network con el mensaje", async () => {
    service.send(1, { sendId: ID1, mode: "page", request: request() });
    await flush();
    captured(
      ID1,
      "net-1",
      snapshot({ state: "failed", status: null, errorText: "net::ERR_CONNECTION_REFUSED" }),
    );
    pageReplies[0]?.({ ok: false, errorName: "TypeError", message: "Failed to fetch" });
    await flush();
    expect(results[0]?.result).toMatchObject({
      state: "failed",
      response: null,
      error: { code: "network", params: ["net::ERR_CONNECTION_REFUSED"] },
    });
  });

  it("los envíos de una pestaña salen de uno en uno y en orden", async () => {
    service.send(1, { sendId: ID1, mode: "page", request: request() });
    service.send(1, { sendId: ID2, mode: "page", request: request({ url: "https://api.test/b" }) });
    await flush();
    expect(pageCalls.map((c) => c.argument.sendId)).toEqual([ID1]);
    captured(ID1, "net-1");
    pageReplies[0]?.({ ok: true, status: 200 });
    await flush();
    expect(pageCalls.map((c) => c.argument.sendId)).toEqual([ID1, ID2]);
    expect(service.currentPageSend(1)).toBe(ID2);
  });

  it("cancelar el envío en curso aborta en la página; uno en cola sale de la cola", async () => {
    service.send(1, { sendId: ID1, mode: "page", request: request() });
    service.send(1, { sendId: ID2, mode: "page", request: request() });
    await flush();
    service.cancel(1, ID2);
    service.cancel(1, ID1);
    await flush();
    expect(aborts).toEqual([ID1]);
    pageReplies[0]?.({ ok: false, errorName: "AbortError", message: "aborted" });
    await flush();
    expect(results.map((r) => [r.result.sendId, r.result.state])).toEqual([
      [ID2, "cancelled"],
      [ID1, "cancelled"],
    ]);
    expect(pageCalls).toHaveLength(1);
    service.cancel(1, ID1);
    expect(results).toHaveLength(2);
  });

  it("contexto perdido (navegación, detach o cierre) termina los pendientes", async () => {
    service.send(1, { sendId: ID1, mode: "page", request: request() });
    service.send(1, { sendId: ID2, mode: "page", request: request() });
    await flush();
    service.contextLost(1);
    await flush();
    expect(results.map((r) => [r.result.sendId, r.result.error?.code])).toEqual([
      [ID1, "context_lost"],
      [ID2, "context_lost"],
    ]);
    pageReplies[0]?.({ ok: true, status: 200 });
    await flush();
    expect(results).toHaveLength(2);
  });

  it("la plantilla sin contexto ⇒ context_lost", async () => {
    service.send(1, { sendId: ID1, mode: "page", request: request() });
    await flush();
    pageReplies[0]?.({ ok: false, errorName: "ContextLost", message: "x" });
    await flush();
    expect(results[0]?.result.error?.code).toBe("context_lost");
  });

  it("5 minutos sin terminar ⇒ timeout y el siguiente de la cola sale", async () => {
    service.send(1, { sendId: ID1, mode: "page", request: request() });
    service.send(1, { sendId: ID2, mode: "page", request: request() });
    await flush();
    vi.advanceTimersByTime(300_000);
    await flush();
    expect(results[0]?.result).toMatchObject({
      sendId: ID1,
      state: "failed",
      error: { code: "timeout" },
    });
    expect(aborts).toEqual([ID1]);
    expect(pageCalls).toHaveLength(2);
  });
});

describe("RepeaterService: contexto limpio", () => {
  it("devuelve la respuesta del SW sin reglas ni captura", async () => {
    attached = false;
    service.send(1, { sendId: ID1, mode: "clean", request: request() });
    await flush();
    expect(pageCalls).toEqual([]);
    expect(results[0]?.result).toMatchObject({
      sendId: ID1,
      state: "done",
      response: { status: 201 },
      ruleEffects: [],
      exchangeId: null,
      size: 2,
    });
  });

  it("permiso pendiente ⇒ failed con el código del SW", async () => {
    cleanReply = async () => ({
      ok: false,
      error: {
        code: "permission_required",
        messageKey: "repeater_error_permission_required",
        params: ["https://api.test"],
      },
    });
    service.send(1, { sendId: ID1, mode: "clean", request: request() });
    await flush();
    expect(results[0]?.result).toMatchObject({
      state: "failed",
      error: { code: "permission_required" },
    });
  });

  it("cancelar y el timeout abortan el fetch", async () => {
    let signal = null as AbortSignal | null;
    cleanReply = (s) =>
      new Promise((resolve) => {
        signal = s;
        s.addEventListener("abort", () =>
          resolve({
            ok: false,
            error: { code: "cancelled", messageKey: "repeater_error_cancelled" },
          }),
        );
      });
    service.send(1, { sendId: ID1, mode: "clean", request: request() });
    await flush();
    service.cancel(1, ID1);
    await flush();
    expect(signal?.aborted).toBe(true);
    expect(results[0]?.result.state).toBe("cancelled");

    service.send(1, { sendId: ID2, mode: "clean", request: request() });
    await flush();
    vi.advanceTimersByTime(300_000);
    await flush();
    expect(results[1]?.result).toMatchObject({ state: "failed", error: { code: "timeout" } });
  });
});
