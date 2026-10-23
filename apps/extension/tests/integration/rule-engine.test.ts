import {
  DEFAULT_SETTINGS,
  type PausedItemView,
  type Rule,
  type RuleEffect,
  type Settings,
} from "@nahual/domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createActionExecutor } from "../../src/background/action-executor.ts";
import { createFetchInterceptor } from "../../src/background/fetch-interceptor.ts";
import { createRuleEngine, type RuleEngine } from "../../src/background/rule-engine.ts";
import { requestPaused } from "../fakes/cdp-events.ts";
import { FakeDebugger } from "../fakes/fake-debugger.ts";
import { RULE_ID2, SITE, rule } from "../fakes/rules.ts";

let cdp: FakeDebugger;
let engine: RuleEngine;
let rules: Rule[];
let settings: Settings;
let effects: { exchangeId: string; effect: RuleEffect }[];
let paused: PausedItemView[];
let resolved: { pausedId: string; outcome: string; errorKey?: string }[];

const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

const response500 = (
  id = "fetch-1",
  headers = [{ name: "content-type", value: "application/json" }],
) =>
  requestPaused(id, {
    networkId: id.replace("fetch", "net"),
    request: { url: "https://api.test/api/items", method: "GET", headers: { accept: "*/*" } },
    responseStatusCode: 500,
    responseHeaders: headers,
  });

beforeEach(async () => {
  vi.useFakeTimers();
  cdp = new FakeDebugger();
  await cdp.attach(1);
  cdp.respond("Fetch.getResponseBody", () => ({ body: '{"items":[]}', base64Encoded: false }));
  rules = [rule()];
  settings = { ...DEFAULT_SETTINGS };
  effects = [];
  paused = [];
  resolved = [];
  engine = createRuleEngine({
    debugger: cdp,
    rules: () => rules,
    settings: () => settings,
    siteOf: () => SITE,
    capture: {
      exchangeIdOf: (_tab, networkId) => networkId,
      effect: (_tab, exchangeId, effect) => void effects.push({ exchangeId, effect }),
    },
    executor: createActionExecutor({ debugger: cdp }),
    onPaused: (_tab, view) => void paused.push(view),
    onResolved: (_tab, result) => void resolved.push(result),
    onQueueChange: () => {},
  });
});

afterEach(() => {
  vi.useRealTimers();
  (globalThis as { __nahualFaults?: Set<string> }).__nahualFaults?.clear();
});

describe("RuleEngine: requestPaused ⇒ acción", () => {
  it("sin regla que coincida ⇒ continúa al instante y sin efecto", async () => {
    await engine.handle(1, { ...response500(), responseStatusCode: 200 });
    expect(cdp.calls("Fetch.continueResponse")).toEqual([{ requestId: "fetch-1" }]);
    expect(effects).toEqual([]);
    expect(engine.queueSize(1)).toBe(0);
  });

  it("regla Pausar ⇒ entra en la cola con el body y emite paused + effect", async () => {
    await engine.handle(1, response500());
    expect(engine.queueSize(1)).toBe(1);
    expect(paused[0]).toMatchObject({
      pausedId: "fetch-1",
      exchangeId: "net-1",
      stage: "response",
      ruleName: "Errores de la API",
      response: { status: 500, body: '{"items":[]}' },
    });
    expect(paused[0]?.expiresAt).toBe((paused[0]?.pausedAt ?? 0) + 60_000);
    expect(effects).toEqual([
      { exchangeId: "net-1", effect: expect.objectContaining({ result: "paused" }) },
    ]);
    expect(cdp.calls("Fetch.continueResponse")).toEqual([]);
  });

  it("pide el body una sola vez y solo si una regla lo necesita", async () => {
    rules = [
      rule({ conditions: [{ kind: "jsonPath", path: "$.items", op: "notEmpty" }] }),
      rule({
        id: RULE_ID2,
        order: 1,
        conditions: [{ kind: "jsonPath", path: "$.items", op: "empty" }],
      }),
    ];
    await engine.handle(1, response500());
    expect(cdp.calls("Fetch.getResponseBody")).toHaveLength(1);
    expect(paused[0]?.ruleId).toBe(RULE_ID2);

    rules = [rule()];
    await engine.handle(1, { ...response500("fetch-9"), responseStatusCode: 200 });
    expect(cdp.calls("Fetch.getResponseBody")).toHaveLength(1);
  });

  it("Content-Length > 5 MB ⇒ no se pide el body; no evaluable y continúa", async () => {
    rules = [rule({ conditions: [{ kind: "jsonPath", path: "$.items", op: "empty" }] })];
    await engine.handle(
      1,
      response500("fetch-1", [{ name: "content-length", value: String(6 * 1024 * 1024) }]),
    );
    expect(cdp.calls("Fetch.getResponseBody")).toEqual([]);
    expect(cdp.calls("Fetch.continueResponse")).toEqual([{ requestId: "fetch-1" }]);
    expect(effects[0]?.effect).toMatchObject({ result: "unevaluable", reason: "too_large" });
  });

  it("etapa Request: el body sale de postData o de Network.getRequestPostData", async () => {
    rules = [
      rule({ stage: "request", conditions: [{ kind: "jsonPath", path: "$.a", op: "exists" }] }),
    ];
    cdp.respond("Network.getRequestPostData", () => ({ postData: '{"a":1}' }));
    await engine.handle(
      1,
      requestPaused("fetch-1", {
        networkId: "net-1",
        request: { url: "https://api.test/api/x", method: "POST", headers: {}, hasPostData: true },
      }),
    );
    expect(cdp.calls("Network.getRequestPostData")).toEqual([{ requestId: "net-1" }]);
    expect(paused[0]?.request.body).toBe('{"a":1}');
  });

  it("una respuesta con error de red continúa tal cual", async () => {
    await engine.handle(1, requestPaused("fetch-1", { responseErrorReason: "Failed" }));
    expect(cdp.calls("Fetch.continueRequest")).toEqual([{ requestId: "fetch-1" }]);
  });

  it("excepción del motor ⇒ el interceptor continúa sin cambios (principio II)", async () => {
    createFetchInterceptor({
      debugger: cdp,
      onRequestPaused: (tab, event) => engine.handle(tab, event),
    });
    (globalThis as { __nahualFaults?: Set<string> }).__nahualFaults?.add("engine");
    cdp.emit(1, "Fetch.requestPaused", response500());
    await flush();
    expect(cdp.calls("Fetch.continueResponse")).toEqual([{ requestId: "fetch-1" }]);
    expect(engine.queueSize(1)).toBe(0);
  });

  it("cola llena ⇒ continúa sin cambios con queue_full", async () => {
    for (let i = 0; i < 100; i++) await engine.handle(1, response500(`fetch-${i}`));
    await engine.handle(1, response500("fetch-100"));
    expect(engine.queueSize(1)).toBe(100);
    expect(cdp.calls("Fetch.continueResponse")).toEqual([{ requestId: "fetch-100" }]);
    expect(effects.at(-1)?.effect.result).toBe("queue_full");
  });
});

describe("RuleEngine: resolver la cola", () => {
  beforeEach(async () => {
    await engine.handle(1, response500());
  });

  it("continue con edición ⇒ modified", async () => {
    expect(
      await engine.resolve(1, { pausedId: "fetch-1", action: "continue", edit: { status: 200 } }),
    ).toEqual({
      ok: true,
    });
    expect(cdp.calls("Fetch.continueResponse")[0]).toMatchObject({ responseCode: 200 });
    expect(resolved).toEqual([{ pausedId: "fetch-1", outcome: "modified" }]);
    expect(effects.at(-1)?.effect.result).toBe("modified");
  });

  it("continue sin edición, continueUnchanged, mock y abort", async () => {
    await engine.handle(1, response500("fetch-2"));
    await engine.handle(1, response500("fetch-3"));
    await engine.handle(1, response500("fetch-4"));
    await engine.resolve(1, { pausedId: "fetch-1", action: "continue" });
    await engine.resolve(1, { pausedId: "fetch-2", action: "continueUnchanged" });
    await engine.resolve(1, {
      pausedId: "fetch-3",
      action: "mock",
      mock: { kind: "mock", status: 200, headers: [], body: "{}", bodyEncoding: "text" },
    });
    await engine.resolve(1, { pausedId: "fetch-4", action: "abort" });
    expect(resolved.map((r) => r.outcome)).toEqual(["continued", "continued", "mocked", "aborted"]);
  });

  it("edición inválida ⇒ edit_invalid con issues y el item sigue en la cola", async () => {
    expect(
      await engine.resolve(1, { pausedId: "fetch-1", action: "continue", edit: { status: 700 } }),
    ).toEqual({
      ok: false,
      code: "edit_invalid",
      issues: [{ path: "status", messageKey: "rule_error_status" }],
    });
    expect(engine.queueSize(1)).toBe(1);
  });

  it("un item ya resuelto ⇒ unknown_paused_id sin llamar a CDP", async () => {
    await engine.resolve(1, { pausedId: "fetch-1", action: "continue" });
    const before = cdp.sent.length;
    expect(await engine.resolve(1, { pausedId: "fetch-1", action: "continue" })).toEqual({
      ok: false,
      code: "unknown_paused_id",
    });
    expect(cdp.sent.length).toBe(before);
  });

  it("timeout ⇒ continúa sin cambios y se registra timed_out", async () => {
    vi.advanceTimersByTime(60_000);
    await flush();
    expect(cdp.calls("Fetch.continueResponse")).toEqual([{ requestId: "fetch-1" }]);
    expect(resolved).toEqual([{ pausedId: "fetch-1", outcome: "timed_out" }]);
  });

  it("continueAll continúa toda la cola sin cambios", async () => {
    await engine.handle(1, response500("fetch-2"));
    await engine.continueAll(1);
    expect(engine.queueSize(1)).toBe(0);
    expect(resolved.map((r) => r.outcome)).toEqual(["continued", "continued"]);
  });

  it("navegación: los pausados antes del commit ⇒ discarded_navigation", async () => {
    vi.advanceTimersByTime(10);
    engine.navigated(1);
    await flush();
    expect(resolved).toEqual([{ pausedId: "fetch-1", outcome: "discarded_navigation" }]);
    expect(engine.queueSize(1)).toBe(0);
  });

  it("detach ⇒ continued_on_detach sin llamar a CDP", async () => {
    const before = cdp.sent.length;
    engine.sessionEnded(1);
    expect(resolved).toEqual([{ pausedId: "fetch-1", outcome: "continued_on_detach" }]);
    expect(cdp.sent.length).toBe(before);
  });
});

describe("RuleEngine: acciones automáticas (historia 4)", () => {
  const request = (id: string) =>
    requestPaused(id, {
      networkId: id,
      request: { url: "https://api.test/api/items", method: "GET", headers: {} },
    });

  it("Mock en etapa Request ⇒ fulfillRequest y el request no sale", async () => {
    rules = [
      rule({
        stage: "request",
        conditions: [],
        action: {
          kind: "mock",
          status: 503,
          headers: [{ name: "content-type", value: "application/json" }],
          body: "{}",
          bodyEncoding: "text",
        },
      }),
    ];
    await engine.handle(1, request("fetch-1"));
    expect(cdp.calls("Fetch.fulfillRequest")).toEqual([
      expect.objectContaining({ requestId: "fetch-1", responseCode: 503 }),
    ]);
    expect(cdp.calls("Fetch.continueRequest")).toEqual([]);
    expect(effects.at(-1)?.effect.result).toBe("mocked");
  });

  it("un mock a otro origen lleva ACAO con el origen exacto de la página (research R21)", async () => {
    rules = [
      rule({
        stage: "request",
        conditions: [],
        action: { kind: "mock", status: 503, headers: [], body: "{}", bodyEncoding: "text" },
      }),
    ];
    await engine.handle(1, request("fetch-1"));
    expect(cdp.calls("Fetch.fulfillRequest")[0]).toMatchObject({
      responseHeaders: [
        { name: "access-control-allow-origin", value: SITE },
        { name: "access-control-allow-credentials", value: "true" },
      ],
    });
  });

  it("un preflight no se responde con el mock: continúa sin cambios", async () => {
    rules = [
      rule({
        stage: "request",
        conditions: [],
        action: { kind: "mock", status: 503, headers: [], body: "{}", bodyEncoding: "text" },
      }),
    ];
    await engine.handle(
      1,
      requestPaused("fetch-1", {
        request: {
          url: "https://api.test/api/items",
          method: "OPTIONS",
          headers: { "Access-Control-Request-Method": "PUT" },
        },
      }),
    );
    expect(cdp.calls("Fetch.fulfillRequest")).toEqual([]);
    expect(cdp.calls("Fetch.continueRequest")).toEqual([{ requestId: "fetch-1" }]);
  });

  it("Mock en etapa Response ⇒ reemplaza la respuesta recibida", async () => {
    rules = [
      rule({
        action: { kind: "mock", status: 200, headers: [], body: "ok", bodyEncoding: "text" },
      }),
    ];
    await engine.handle(1, response500());
    expect(cdp.calls("Fetch.fulfillRequest")[0]).toMatchObject({
      requestId: "fetch-1",
      responseCode: 200,
    });
    expect(effects.at(-1)?.effect.result).toBe("mocked");
  });

  it.each([
    ["failed", "Failed"],
    ["aborted", "Aborted"],
    ["timedOut", "TimedOut"],
    ["connectionRefused", "ConnectionRefused"],
    ["nameNotResolved", "NameNotResolved"],
    ["accessDenied", "AccessDenied"],
    ["internetDisconnected", "InternetDisconnected"],
  ] as const)("Fallar %s ⇒ failRequest %s", async (errorReason, cdpReason) => {
    rules = [rule({ stage: "request", conditions: [], action: { kind: "fail", errorReason } })];
    await engine.handle(1, request("fetch-1"));
    expect(cdp.calls("Fetch.failRequest")).toEqual([
      { requestId: "fetch-1", errorReason: cdpReason },
    ]);
    expect(effects.at(-1)?.effect.result).toBe("failed");
  });

  it("Retrasar ⇒ continúa tras ≥ N ms sin bloquear otros intercambios", async () => {
    rules = [
      rule({
        stage: "request",
        conditions: [],
        prefilter: { kind: "glob", pattern: "*/slow*" },
        action: { kind: "delay", ms: 3000 },
      }),
    ];
    await engine.handle(
      1,
      requestPaused("fetch-slow", { networkId: "s", request: { url: "https://api.test/slow" } }),
    );
    await engine.handle(1, request("fetch-fast"));
    expect(cdp.calls("Fetch.continueRequest")).toEqual([{ requestId: "fetch-fast" }]);
    vi.advanceTimersByTime(2_999);
    expect(cdp.calls("Fetch.continueRequest")).toHaveLength(1);
    vi.advanceTimersByTime(1);
    await flush();
    expect(cdp.calls("Fetch.continueRequest").at(-1)).toEqual({ requestId: "fetch-slow" });
    expect(effects.at(-1)?.effect.result).toBe("delayed");
  });

  it("navegación y detach cancelan los retrasos", async () => {
    rules = [rule({ stage: "request", conditions: [], action: { kind: "delay", ms: 60_000 } })];
    await engine.handle(1, request("fetch-1"));
    vi.advanceTimersByTime(10);
    engine.navigated(1);
    await flush();
    expect(cdp.calls("Fetch.continueRequest")).toEqual([{ requestId: "fetch-1" }]);
    await engine.handle(1, request("fetch-2"));
    engine.sessionEnded(1);
    vi.advanceTimersByTime(120_000);
    await flush();
    expect(cdp.calls("Fetch.continueRequest")).toEqual([{ requestId: "fetch-1" }]);
  });

  it("Solo registrar ⇒ continúa sin cambios y marca la entrada", async () => {
    rules = [rule({ action: { kind: "log" } })];
    await engine.handle(1, response500());
    expect(cdp.calls("Fetch.continueResponse")).toEqual([{ requestId: "fetch-1" }]);
    expect(effects.at(-1)?.effect).toMatchObject({
      result: "logged",
      ruleName: "Errores de la API",
    });
  });
});
