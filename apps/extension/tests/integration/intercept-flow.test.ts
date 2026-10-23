import { makeCommand, type SwMessage } from "@nahual/protocol";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBackground } from "../../src/background/app.ts";
import { frameNavigated, requestPaused } from "../fakes/cdp-events.ts";
import { FakeDebugger } from "../fakes/fake-debugger.ts";
import { FakeRuntime, type FakePort } from "../fakes/fake-runtime.ts";
import { FakeStorage } from "../fakes/fake-storage.ts";
import { draft } from "../fakes/rules.ts";

// Flujo completo con CDP simulado: requestPaused ⇒ regla ⇒ cola ⇒ resolvePaused ⇒ CDP.

const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
  await vi.advanceTimersByTimeAsync(0);
};

let cdp: FakeDebugger;
let port: FakePort;

const events = <T extends SwMessage["type"]>(type: T) =>
  (port.received as SwMessage[]).filter(
    (m): m is Extract<SwMessage, { type: T }> => m.type === type,
  );
const lastState = () => events("state").at(-1)?.payload;

async function send(command: Parameters<FakePort["fromPanel"]>[0]) {
  port.fromPanel(command);
  await flush();
}

beforeEach(async () => {
  vi.useFakeTimers();
  cdp = new FakeDebugger();
  cdp.respond("Target.getTargetInfo", () => ({ targetInfo: { url: "http://localhost:3000/" } }));
  cdp.respond("Fetch.getResponseBody", () => ({ body: '{"error":"boom"}', base64Encoded: false }));
  const runtime = new FakeRuntime();
  const bg = createBackground({
    debugger: cdp,
    runtime,
    sessionStorage: new FakeStorage(),
    localStorage: new FakeStorage(),
  });
  await bg.ready;
  port = runtime.connect();
  await send(makeCommand("hello", { tabId: 1 }));
  await send(makeCommand("attach", {}));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("flujo de intercept con reglas", () => {
  it("sin reglas activas no se habilita Fetch; al guardar una regla, sí", async () => {
    expect(cdp.calls("Fetch.enable")).toEqual([]);
    await send(makeCommand("saveRule", { rule: draft() }));
    expect(cdp.calls("Fetch.enable").at(-1)).toEqual({
      patterns: [{ urlPattern: "*/api/*", requestStage: "Response" }],
    });
    expect(events("rules").at(-1)?.payload.rules).toHaveLength(1);
    expect(lastState()?.activeRuleCount).toBe(1);
  });

  it("desactivar la regla o pausar Nahual deshabilita Fetch", async () => {
    await send(makeCommand("saveRule", { rule: draft() }));
    const ruleId = events("rules").at(-1)?.payload.rules[0]?.id ?? "";
    await send(makeCommand("setRuleEnabled", { ruleId, enabled: false }));
    expect(cdp.sentMethods(1).at(-1)).toBe("Fetch.disable");
    await send(makeCommand("setRuleEnabled", { ruleId, enabled: true }));
    expect(cdp.sentMethods(1).at(-1)).toBe("Fetch.enable");
    await send(makeCommand("updateSettings", { globalPaused: true }));
    expect(cdp.sentMethods(1).at(-1)).toBe("Fetch.disable");
    expect(lastState()?.globalPaused).toBe(true);
  });

  it("navegar a otro sitio cambia las reglas que aplican", async () => {
    await send(makeCommand("saveRule", { rule: draft() }));
    cdp.emit(1, "Page.frameNavigated", frameNavigated("https://otro.test/"));
    await flush();
    expect(cdp.sentMethods(1).at(-1)).toBe("Fetch.disable");
    expect(lastState()?.site).toBe("https://otro.test");
    expect(lastState()?.activeRuleCount).toBe(0);
  });

  it("Response: requestPaused ⇒ cola ⇒ resolvePaused con edición ⇒ CDP", async () => {
    await send(makeCommand("saveRule", { rule: draft() }));
    cdp.emit(
      1,
      "Fetch.requestPaused",
      requestPaused("fetch-1", {
        networkId: "net-1",
        request: { url: "https://api.test/api/items", method: "GET", headers: {} },
        responseStatusCode: 500,
        responseHeaders: [{ name: "content-type", value: "application/json" }],
      }),
    );
    await flush();
    expect(events("paused")).toHaveLength(1);
    expect(lastState()?.queueSize).toBe(1);

    await send(
      makeCommand("resolvePaused", {
        pausedId: "fetch-1",
        action: "continue",
        edit: { status: 200, body: '{"ok":true}' },
      }),
    );
    expect(cdp.calls("Fetch.fulfillRequest")).toEqual([
      expect.objectContaining({ requestId: "fetch-1", responseCode: 200 }),
    ]);
    expect(events("resolved").at(-1)?.payload).toEqual({
      pausedId: "fetch-1",
      outcome: "modified",
    });
    expect(lastState()?.queueSize).toBe(0);
  });

  it("Request: pausa antes de salir a la red y continúa con headers editados", async () => {
    await send(
      makeCommand("saveRule", {
        rule: draft({ stage: "request", conditions: [{ kind: "method", values: ["POST"] }] }),
      }),
    );
    expect(cdp.calls("Fetch.enable").at(-1)).toEqual({
      patterns: [{ urlPattern: "*/api/*", requestStage: "Request" }],
    });
    cdp.emit(
      1,
      "Fetch.requestPaused",
      requestPaused("fetch-2", {
        networkId: "net-2",
        request: { url: "https://api.test/api/echo", method: "POST", headers: { a: "1" } },
      }),
    );
    await flush();
    expect(events("paused").at(-1)?.payload.stage).toBe("request");
    await send(
      makeCommand("resolvePaused", {
        pausedId: "fetch-2",
        action: "continue",
        edit: { headers: [{ name: "x-nahual", value: "1" }] },
      }),
    );
    expect(cdp.calls("Fetch.continueRequest").at(-1)).toEqual({
      requestId: "fetch-2",
      headers: [{ name: "x-nahual", value: "1" }],
    });
  });

  it("una edición inválida responde edit_invalid con issues", async () => {
    await send(makeCommand("saveRule", { rule: draft() }));
    cdp.emit(
      1,
      "Fetch.requestPaused",
      requestPaused("fetch-1", {
        networkId: "net-1",
        request: { url: "https://api.test/api/x" },
        responseStatusCode: 500,
        responseHeaders: [],
      }),
    );
    await flush();
    const cmd = makeCommand("resolvePaused", {
      pausedId: "fetch-1",
      action: "continue",
      edit: { status: 999 },
    });
    await send(cmd);
    expect((port.received as SwMessage[]).find((m) => m.correlationId === cmd.id)).toMatchObject({
      type: "error",
      payload: { code: "edit_invalid", issues: [{ path: "status" }] },
    });
  });

  it("continueAll y soltar el debugger vacían la cola", async () => {
    await send(makeCommand("saveRule", { rule: draft() }));
    for (const id of ["fetch-1", "fetch-2"]) {
      cdp.emit(
        1,
        "Fetch.requestPaused",
        requestPaused(id, {
          networkId: id,
          request: { url: "https://api.test/api/x" },
          responseStatusCode: 500,
          responseHeaders: [],
        }),
      );
    }
    await flush();
    await send(makeCommand("continueAll", {}));
    expect(lastState()?.queueSize).toBe(0);

    cdp.emit(
      1,
      "Fetch.requestPaused",
      requestPaused("fetch-3", {
        networkId: "fetch-3",
        request: { url: "https://api.test/api/x" },
        responseStatusCode: 500,
        responseHeaders: [],
      }),
    );
    await flush();
    await send(makeCommand("detach", {}));
    expect(events("resolved").at(-1)?.payload).toEqual({
      pausedId: "fetch-3",
      outcome: "continued_on_detach",
    });
  });

  it("saveRule con regex inválida devuelve issues y no habilita Fetch", async () => {
    const cmd = makeCommand("saveRule", {
      rule: { ...draft(), prefilter: { kind: "regex", pattern: "([" } },
    });
    await send(cmd);
    expect((port.received as SwMessage[]).find((m) => m.correlationId === cmd.id)).toMatchObject({
      type: "error",
      payload: {
        code: "rule_invalid",
        issues: [{ path: "prefilter.pattern", messageKey: "rule_error_regex_invalid" }],
      },
    });
    expect(cdp.calls("Fetch.enable")).toEqual([]);
  });
});
