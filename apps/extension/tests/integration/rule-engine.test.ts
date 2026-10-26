import {
  DEFAULT_SETTINGS,
  type CorsRelaxedInfo,
  type PausedItemView,
  type Rule,
  type RuleEffect,
  type Settings,
} from "@nahual/domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createActionExecutor } from "../../src/background/action-executor.ts";
import {
  createCorsRelaxer,
  createRelaxingExecutor,
  type CorsRelaxer,
} from "../../src/background/cors-relaxer.ts";
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
/** Tipo de recurso que la captura de Network conoce por `networkId`. */
let networkTypes: Map<string, string>;
/** 007: perfil activo de la pestaña 1. */
let activeProfile: string | null;

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
  networkTypes = new Map();
  activeProfile = null;
  settings = { ...DEFAULT_SETTINGS };
  effects = [];
  paused = [];
  resolved = [];
  engine = createRuleEngine({
    debugger: cdp,
    rules: () => rules,
    settings: () => settings,
    siteOf: () => SITE,
    activeProfileOf: () => activeProfile,
    capture: {
      exchangeIdOf: (_tab, networkId) => networkId,
      resourceTypeOf: (_tab, networkId) => networkTypes.get(networkId) ?? null,
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

  it("el tipo de recurso es el de Network: la interceptación reporta los fetch() como XHR", async () => {
    networkTypes.set("net-1", "Fetch");
    networkTypes.set("net-2", "XHR");
    rules = [rule({ resourceTypes: ["Fetch"] })];
    await engine.handle(1, { ...response500("fetch-1"), resourceType: "XHR" });
    await engine.handle(1, { ...response500("fetch-2"), resourceType: "XHR" });
    expect(paused.map((p) => p.pausedId)).toEqual(["fetch-1"]);
    expect(cdp.calls("Fetch.continueResponse")).toEqual([{ requestId: "fetch-2" }]);

    // Sin dato de Network se usa el de la interceptación.
    rules = [rule({ resourceTypes: ["XHR"] })];
    await engine.handle(1, { ...response500("fetch-3"), resourceType: "XHR" });
    expect(paused.map((p) => p.pausedId)).toEqual(["fetch-1", "fetch-3"]);
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

describe("RuleEngine + relajación CORS como último paso (003, research R9)", () => {
  const APP = SITE;
  const API = "https://api-dev.test";
  let relaxer: CorsRelaxer;
  let relaxed: { tabId: number; exchangeId: string; info: Omit<CorsRelaxedInfo, never> }[];
  let relaxationId: string;

  const paused = (
    id: string,
    overrides: {
      url?: string;
      method?: string;
      frameId?: string;
      status?: number;
      headers?: { name: string; value: string }[];
      requestHeaders?: Record<string, string>;
    } = {},
  ) =>
    requestPaused(id, {
      networkId: id.replace("fetch", "net"),
      frameId: overrides.frameId ?? "main",
      request: {
        url: overrides.url ?? `${API}/items`,
        method: overrides.method ?? "GET",
        headers: overrides.requestHeaders ?? { accept: "*/*", origin: APP },
      },
      ...(overrides.status !== undefined
        ? { responseStatusCode: overrides.status, responseHeaders: overrides.headers ?? [] }
        : {}),
    });

  const preflight = (
    id: string,
    status: number | undefined,
    headers: { name: string; value: string }[] = [],
  ) =>
    paused(id, {
      method: "OPTIONS",
      ...(status !== undefined ? { status, headers } : {}),
      requestHeaders: {
        origin: APP,
        "access-control-request-method": "PUT",
        "access-control-request-headers": "x-custom",
      },
    });

  const setup = (relaxRules: Rule[] = []) => {
    rules = relaxRules;
    relaxer = createCorsRelaxer({
      settings: () => settings,
      productionListReadable: () => true,
      isAttached: () => true,
      hasFrameOrigin: () => true,
      onChange: () => {},
      onNotice: () => {},
    });
    const created = relaxer.create(1, {
      appOrigin: APP,
      apiOrigin: API,
      durationMinutes: 480,
      exposeHeaders: [],
      credentials: false,
    });
    relaxationId = created.ok ? created.id : "";
    relaxed = [];
    engine = createRuleEngine({
      debugger: cdp,
      rules: () => rules,
      settings: () => settings,
      siteOf: () => SITE,
      capture: {
        exchangeIdOf: (_tab, networkId) => networkId,
        resourceTypeOf: () => null,
        effect: (_tab, exchangeId, effect) => void effects.push({ exchangeId, effect }),
      },
      executor: createRelaxingExecutor({
        base: createActionExecutor({ debugger: cdp }),
        relaxer,
        frameOriginOf: (_tab, frameId) =>
          frameId === "main" ? APP : frameId === "f3" ? "https://third.test" : null,
        onRelaxed: (tabId, exchangeId, info) => void relaxed.push({ tabId, exchangeId, info }),
      }),
      onPaused: () => {},
      onResolved: (_tab, result) => void resolved.push(result),
      onQueueChange: () => {},
    });
  };

  const acao = (headers: { name: string; value: string }[] | undefined) =>
    (headers ?? []).filter((h) => h.name.toLowerCase() === "access-control-allow-origin");

  it("respuesta en el alcance sin regla ⇒ continueResponse con headers relajados y responseCode", async () => {
    setup();
    await engine.handle(
      1,
      paused("fetch-1", {
        status: 200,
        headers: [{ name: "content-type", value: "application/json" }],
      }),
    );
    const [call] = cdp.calls<{
      responseCode: number;
      responseHeaders: { name: string; value: string }[];
    }>("Fetch.continueResponse");
    expect(call?.responseCode).toBe(200);
    expect(acao(call?.responseHeaders)).toEqual([
      { name: "Access-Control-Allow-Origin", value: APP },
    ]);
    expect(relaxed[0]).toMatchObject({
      exchangeId: "net-1",
      info: { relaxationId, preflightReplaced: false, serverStatus: 200, alreadyValid: false },
    });
  });

  it("preflight 401 ⇒ fulfillRequest 204 con los headers pedidos", async () => {
    setup();
    await engine.handle(1, preflight("fetch-2", 401));
    const [call] = cdp.calls<{
      responseCode: number;
      responseHeaders: { name: string; value: string }[];
    }>("Fetch.fulfillRequest");
    expect(call?.responseCode).toBe(204);
    expect(call?.responseHeaders).toEqual(
      expect.arrayContaining([
        { name: "Access-Control-Allow-Origin", value: APP },
        { name: "Access-Control-Allow-Methods", value: "PUT" },
        { name: "Access-Control-Allow-Headers", value: "x-custom" },
        { name: "Access-Control-Max-Age", value: "0" },
      ]),
    );
    expect(relaxed[0]?.info).toMatchObject({ preflightReplaced: true, serverStatus: 401 });
  });

  it("preflight que ya pasa ⇒ continúa sin cambios y marca alreadyValid", async () => {
    setup();
    await engine.handle(
      1,
      preflight("fetch-3", 204, [
        { name: "Access-Control-Allow-Origin", value: APP },
        { name: "Access-Control-Allow-Methods", value: "PUT" },
        { name: "Access-Control-Allow-Headers", value: "x-custom" },
      ]),
    );
    expect(cdp.calls("Fetch.continueResponse")).toEqual([{ requestId: "fetch-3" }]);
    expect(relaxed[0]?.info).toMatchObject({ alreadyValid: true, added: [] });
  });

  it("preflight con 3xx ⇒ aprende la URL; el siguiente OPTIONS se responde en etapa Request (X5)", async () => {
    setup();
    await engine.handle(1, preflight("fetch-4", 302));
    expect(cdp.calls("Fetch.continueResponse")).toEqual([{ requestId: "fetch-4" }]);
    expect(relaxer.patterns(1)).toEqual([{ origin: API, requestStage: true }]);
    await engine.handle(1, preflight("fetch-5", undefined));
    const [call] = cdp.calls<{ responseCode: number }>("Fetch.fulfillRequest");
    expect(call?.responseCode).toBe(204);
    // Los demás requests de la etapa Request continúan sin cambios.
    await engine.handle(1, paused("fetch-6"));
    expect(cdp.calls("Fetch.continueRequest")).toEqual([{ requestId: "fetch-6" }]);
  });

  it("otra pestaña, otro frame u otro origen de API ⇒ sin cambios", async () => {
    setup();
    await cdp.attach(2);
    await engine.handle(2, paused("fetch-7", { status: 200 }));
    await engine.handle(
      1,
      paused("fetch-8", {
        status: 200,
        frameId: "f3",
        requestHeaders: { origin: "https://third.test" },
      }),
    );
    await engine.handle(1, paused("fetch-9", { status: 200, url: "https://tercero.test/items" }));
    expect(cdp.calls("Fetch.continueResponse")).toEqual([
      { requestId: "fetch-7" },
      { requestId: "fetch-8" },
      { requestId: "fetch-9" },
    ]);
    expect(relaxed).toEqual([]);
  });

  it("sin frame conocido usa el header Origin del request", async () => {
    setup();
    await engine.handle(1, paused("fetch-10", { status: 200, frameId: "?" }));
    expect(
      acao(cdp.calls<{ responseHeaders: never }>("Fetch.continueResponse")[0]?.responseHeaders),
    ).toHaveLength(1);
  });

  it("pausa editada con Access-Control-Allow-Origin propio ⇒ se respeta (FR-024)", async () => {
    setup([rule({ prefilter: { kind: "glob", pattern: "*/items" }, conditions: [] })]);
    await engine.handle(1, paused("fetch-11", { status: 200 }));
    await engine.resolve(1, {
      pausedId: "fetch-11",
      action: "continue",
      edit: { headers: [{ name: "Access-Control-Allow-Origin", value: "http://dev.test" }] },
    });
    const [call] = cdp.calls<{ responseHeaders: { name: string; value: string }[] }>(
      "Fetch.continueResponse",
    );
    expect(acao(call?.responseHeaders)).toEqual([
      { name: "Access-Control-Allow-Origin", value: "http://dev.test" },
    ]);
  });

  it("mock ⇒ headers relajados respetando los del dev", async () => {
    setup([
      rule({
        stage: "request",
        prefilter: { kind: "glob", pattern: "*/items" },
        conditions: [],
        action: {
          kind: "mock",
          status: 200,
          headers: [{ name: "x-mock", value: "1" }],
          body: "{}",
          bodyEncoding: "text",
        },
      }),
    ]);
    await engine.handle(1, paused("fetch-12"));
    const [call] = cdp.calls<{ responseHeaders: { name: string; value: string }[] }>(
      "Fetch.fulfillRequest",
    );
    expect(acao(call?.responseHeaders)).toHaveLength(1);
    expect(call?.responseHeaders).toContainEqual({ name: "x-mock", value: "1" });
  });

  it("retraso que termina después de que la relajación terminó ⇒ sin relajar", async () => {
    setup([
      rule({
        prefilter: { kind: "glob", pattern: "*/items" },
        conditions: [],
        action: { kind: "delay", ms: 1000 },
      }),
    ]);
    await engine.handle(1, paused("fetch-13", { status: 200 }));
    relaxer.end(1, null, "user");
    vi.advanceTimersByTime(1000);
    await flush();
    expect(cdp.calls("Fetch.continueResponse")).toEqual([{ requestId: "fetch-13" }]);
  });

  it("suspendida con pausar Nahual ⇒ sin relajar", async () => {
    setup();
    settings = { ...settings, globalPaused: true };
    relaxer.settingsChanged();
    await engine.handle(1, paused("fetch-14", { status: 200 }));
    expect(cdp.calls("Fetch.continueResponse")).toEqual([{ requestId: "fetch-14" }]);
  });

  it("si aplicar falla ⇒ continúa sin modificar y CorsRelaxedInfo con errorKey (FR-027)", async () => {
    setup();
    cdp.failSend("Fetch.continueResponse", "cdp_error");
    await engine.handle(1, paused("fetch-15", { status: 200 }));
    expect(cdp.calls("Fetch.continueResponse").at(-1)).toEqual({ requestId: "fetch-15" });
    expect(relaxed[0]?.info).toMatchObject({ added: [], errorKey: "error_cdp_error" });
  });

  it("CorsRelaxedInfo sin valores sensibles", async () => {
    setup();
    await engine.handle(
      1,
      paused("fetch-16", {
        status: 200,
        headers: [{ name: "Set-Cookie", value: "secret" }],
        requestHeaders: { origin: APP, cookie: "secret", authorization: "Bearer secret" },
      }),
    );
    expect(JSON.stringify(relaxed)).not.toContain("secret");
  });
});

describe("RuleEngine: perfil activo (007, FR-020)", () => {
  const P = "0b8f8a52-4a0c-4d0e-9f3a-6c1d2e3f4a5b";

  it("con un perfil activo, una regla de fuera del perfil no actúa", async () => {
    activeProfile = P;
    await engine.handle(1, response500());
    expect(engine.queueSize(1)).toBe(0);
    expect(cdp.calls("Fetch.continueResponse")).toEqual([{ requestId: "fetch-1" }]);
  });

  it("una regla del perfil activo sí actúa", async () => {
    activeProfile = P;
    rules = [rule({ profileIds: [P] })];
    await engine.handle(1, response500());
    expect(engine.queueSize(1)).toBe(1);
  });
});
