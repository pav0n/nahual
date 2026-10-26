import { DEFAULT_SETTINGS, type Rule, type RuleEffect, type Settings } from "@nahual/domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createActionExecutor } from "../../src/background/action-executor.ts";
import { createCorsRelaxer, createRelaxingExecutor } from "../../src/background/cors-relaxer.ts";
import {
  createHookRunner,
  type HookResult,
  type HookRunEvent,
  type HookRunner,
} from "../../src/background/hook-runner.ts";
import { createRuleEngine, type RuleEngine } from "../../src/background/rule-engine.ts";
import { requestPaused } from "../fakes/cdp-events.ts";
import { FakeDebugger } from "../fakes/fake-debugger.ts";
import { RULE_ID, RULE_ID2, SITE, rule } from "../fakes/rules.ts";

// 006 (T027, contracts/panel-protocol.md): el SW manda la cadena al panel, vuelve a validar y aplica.

const API = "https://api-dev.test";
const hookAction = (permissions = { changeDestination: false, readSensitive: false }) => ({
  kind: "hook" as const,
  source: "export default (ctx) => ctx;",
  imported: false,
  permissions,
  check: { hash: "00", ok: true },
});
const hookRule = (overrides: Partial<Rule> = {}) =>
  rule({ action: hookAction(), conditions: [], stage: "request", name: "Hook", ...overrides });

let cdp: FakeDebugger;
let engine: RuleEngine;
let runner: HookRunner;
let rules: Rule[];
let settings: Settings;
let effects: RuleEffect[];
let sent: HookRunEvent[];
let connected: boolean;

const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

function build(relaxed = false) {
  const base = createActionExecutor({ debugger: cdp });
  let executor = base;
  if (relaxed) {
    const relaxer = createCorsRelaxer({
      settings: () => settings,
      productionListReadable: () => true,
      isAttached: () => true,
      hasFrameOrigin: () => true,
      onChange: () => {},
      onNotice: () => {},
    });
    relaxer.create(1, {
      appOrigin: SITE,
      apiOrigin: API,
      durationMinutes: 480,
      exposeHeaders: [],
      credentials: false,
    });
    executor = createRelaxingExecutor({
      base,
      relaxer,
      frameOriginOf: () => SITE,
      onRelaxed: () => {},
    });
  }
  runner = createHookRunner({
    executor,
    siteOf: () => SITE,
    send: (_tab, event) => {
      if (!connected) return false;
      sent.push(event);
      return true;
    },
    effect: (_tab, _ex, effect) => void effects.push(effect),
    uuid: () => `11111111-1111-4111-8111-${String(sent.length).padStart(12, "0")}`,
  });
  engine = createRuleEngine({
    debugger: cdp,
    rules: () => rules,
    settings: () => settings,
    siteOf: () => SITE,
    capture: {
      exchangeIdOf: (_tab, networkId) => networkId,
      resourceTypeOf: () => "Fetch",
      effect: (_tab, _ex, effect) => void effects.push(effect),
    },
    executor,
    hooks: runner,
    onPaused: () => {},
    onResolved: () => {},
    onQueueChange: () => {},
  });
}

const request = (
  id = "fetch-1",
  headers: Record<string, string> = { accept: "*/*", authorization: "Bearer real" },
) =>
  requestPaused(id, {
    networkId: id.replace("fetch", "net"),
    frameId: "main",
    request: { url: `${API}/api/items`, method: "GET", headers },
  });

const response = (id = "fetch-1") =>
  requestPaused(id, {
    networkId: id.replace("fetch", "net"),
    frameId: "main",
    request: { url: `${API}/api/items`, method: "GET", headers: { origin: SITE } },
    responseStatusCode: 200,
    responseHeaders: [
      { name: "Content-Type", value: "application/json" },
      { name: "Access-Control-Allow-Origin", value: SITE },
    ],
  });

const result = (
  final: HookResult["final"],
  executions: HookResult["executions"] = [{ ruleId: RULE_ID, result: "hooked", durationMs: 3 }],
): HookResult => ({
  runId: sent.at(-1)?.runId ?? "",
  final,
  executions,
});

beforeEach(async () => {
  vi.useFakeTimers();
  cdp = new FakeDebugger();
  await cdp.attach(1);
  cdp.respond("Fetch.getResponseBody", () => ({ body: '{"items":[1]}', base64Encoded: false }));
  settings = { ...DEFAULT_SETTINGS };
  effects = [];
  sent = [];
  connected = true;
  rules = [hookRule()];
  build();
});

afterEach(() => vi.useRealTimers());

describe("hook-runner", () => {
  it("manda la cadena con el contexto sin enmascarar y aplica una edición del request", async () => {
    const handled = engine.handle(1, request());
    await flush();
    expect(sent[0]).toMatchObject({
      exchangeId: "net-1",
      stage: "request",
      chain: [{ ruleId: RULE_ID, ruleName: "Hook" }],
      context: { request: { headers: { authorization: "Bearer real" } } },
    });
    expect(cdp.calls("Fetch.continueRequest")).toEqual([]);
    await runner.onResult(
      1,
      result({
        kind: "edit",
        request: {
          method: "GET",
          url: `${API}/api/items`,
          headers: { accept: "*/*", authorization: "Bearer real", "x-debug": "1" },
        },
      }),
    );
    await handled;
    expect(cdp.calls("Fetch.continueRequest")).toEqual([
      {
        requestId: "fetch-1",
        method: "GET",
        url: `${API}/api/items`,
        headers: [
          { name: "accept", value: "*/*" },
          { name: "authorization", value: "Bearer real" },
          { name: "x-debug", value: "1" },
        ],
      },
    ]);
    expect(effects).toEqual([
      expect.objectContaining({ result: "hooked", durationMs: 3, ruleName: "Hook" }),
    ]);
  });

  it("etapa Response: status y body nuevos ⇒ fulfillRequest", async () => {
    rules = [hookRule({ stage: "response" })];
    const handled = engine.handle(1, response());
    await flush();
    expect(sent[0]?.context.response?.body).toMatchObject({ kind: "text", text: '{"items":[1]}' });
    await runner.onResult(
      1,
      result({
        kind: "edit",
        response: { status: 503, headers: { "content-type": "application/json" }, body: "{}" },
      }),
    );
    await handled;
    expect(cdp.calls("Fetch.fulfillRequest")).toMatchObject([
      { requestId: "fetch-1", responseCode: 503 },
    ]);
  });

  it("respond en etapa Request ⇒ fulfillRequest con el ACAO de un mock local", async () => {
    const handled = engine.handle(1, request());
    await flush();
    await runner.onResult(
      1,
      result(
        {
          kind: "respond",
          status: 200,
          headers: { "content-type": "application/json" },
          body: '{"id":1}',
        },
        [{ ruleId: RULE_ID, result: "hook_responded", durationMs: 1 }],
      ),
    );
    await handled;
    const [call] = cdp.calls<{
      responseCode: number;
      responseHeaders: { name: string; value: string }[];
    }>("Fetch.fulfillRequest");
    expect(call?.responseCode).toBe(200);
    expect(call?.responseHeaders).toContainEqual({
      name: "access-control-allow-origin",
      value: SITE,
    });
    expect(cdp.calls("Fetch.continueRequest")).toEqual([]);
  });

  it("sin respuesta del panel en 2 s × hooks + 3 s ⇒ sin cambios y hook_failed", async () => {
    rules = [hookRule(), hookRule({ id: RULE_ID2, order: 1 })];
    const handled = engine.handle(1, request());
    await flush();
    await vi.advanceTimersByTimeAsync(6_999);
    expect(cdp.calls("Fetch.continueRequest")).toEqual([]);
    await vi.advanceTimersByTimeAsync(2);
    await handled;
    expect(cdp.calls("Fetch.continueRequest")).toEqual([{ requestId: "fetch-1" }]);
    expect(effects.map((e) => [e.result, e.errorKey])).toEqual([
      ["hook_failed", "hook_error_timeout"],
      ["hook_failed", "hook_error_timeout"],
    ]);
  });

  it("sin panel conectado ⇒ sin cambios al instante", async () => {
    connected = false;
    await engine.handle(1, request());
    expect(cdp.calls("Fetch.continueRequest")).toEqual([{ requestId: "fetch-1" }]);
    expect(effects[0]).toMatchObject({ result: "hook_failed", errorKey: "hook_error_no_panel" });
  });

  it("un hookResult falsificado que cambia el origen sin permiso se rechaza (SC-010)", async () => {
    const handled = engine.handle(1, request());
    await flush();
    await runner.onResult(
      1,
      result({ kind: "edit", request: { method: "GET", url: "https://evil.test/x", headers: {} } }),
    );
    await handled;
    expect(cdp.calls("Fetch.continueRequest")).toEqual([{ requestId: "fetch-1" }]);
    expect(effects[0]).toMatchObject({ result: "hook_failed", errorKey: "hook_error_destination" });
  });

  it("con el permiso, el request va al nuevo destino y el efecto lo registra", async () => {
    rules = [hookRule({ action: hookAction({ changeDestination: true, readSensitive: false }) })];
    const handled = engine.handle(1, request());
    await flush();
    await runner.onResult(
      1,
      result({
        kind: "edit",
        request: {
          method: "GET",
          url: "http://127.0.0.1:4312/api/items",
          headers: { accept: "*/*" },
        },
      }),
    );
    await handled;
    expect(cdp.calls("Fetch.continueRequest")).toMatchObject([
      { url: "http://127.0.0.1:4312/api/items" },
    ]);
    expect(effects[0]?.destination).toEqual({
      from: `${API}/api/items`,
      to: "http://127.0.0.1:4312/api/items",
    });
  });

  it("un runId desconocido o de otra pestaña se descarta", async () => {
    const handled = engine.handle(1, request());
    await flush();
    expect(
      await runner.onResult(1, {
        ...result({ kind: "unchanged" }),
        runId: "22222222-2222-4222-8222-222222222222",
      }),
    ).toEqual({ ok: false, code: "invalid_message" });
    expect(await runner.onResult(2, result({ kind: "unchanged" }))).toEqual({
      ok: false,
      code: "invalid_message",
    });
    await runner.onResult(
      1,
      result({ kind: "unchanged" }, [{ ruleId: RULE_ID, result: "hook_unchanged", durationMs: 1 }]),
    );
    await handled;
    expect(effects).toEqual([expect.objectContaining({ result: "hook_unchanged" })]);
  });

  it("los preflight no pasan por hooks (FR-013)", async () => {
    await engine.handle(
      1,
      requestPaused("fetch-1", {
        networkId: "net-1",
        request: {
          url: `${API}/api/items`,
          method: "OPTIONS",
          headers: { origin: SITE, "access-control-request-method": "PUT" },
        },
      }),
    );
    expect(sent).toEqual([]);
    expect(cdp.calls("Fetch.continueRequest")).toEqual([{ requestId: "fetch-1" }]);
  });

  it("con la relajación CORS activa, su ACAO prevalece sobre el que quita un hook (FR-013)", async () => {
    build(true);
    rules = [hookRule({ stage: "response" })];
    const handled = engine.handle(1, response());
    await flush();
    await runner.onResult(
      1,
      result({
        kind: "edit",
        response: { status: 200, headers: { "content-type": "application/json" } },
      }),
    );
    await handled;
    const [call] = cdp.calls<{ responseHeaders: { name: string; value: string }[] }>(
      "Fetch.continueResponse",
    );
    expect(
      call?.responseHeaders.filter((h) => h.name.toLowerCase() === "access-control-allow-origin"),
    ).toEqual([{ name: "Access-Control-Allow-Origin", value: SITE }]);
  });

  it("al terminar la sesión, lo pendiente se descarta sin llamar a CDP", async () => {
    const handled = engine.handle(1, request());
    await flush();
    runner.sessionEnded(1);
    await handled;
    expect(cdp.calls("Fetch.continueRequest")).toEqual([]);
    expect(runner.pendingCount()).toBe(0);
  });

  it("'pausar Nahual' no ejecuta hooks", async () => {
    settings = { ...settings, globalPaused: true };
    await engine.handle(1, request());
    expect(sent).toEqual([]);
  });
});
