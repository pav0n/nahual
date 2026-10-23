import { makeCommand, type PanelMessage, type SwMessage } from "@nahual/protocol";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPanelPort, type CommandResult } from "../../src/background/panel-port.ts";
import { EXTENSION_ID, FakeRuntime, PANEL_URL, type FakePort } from "../fakes/fake-runtime.ts";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function setup(result: CommandResult = { ok: true }) {
  const runtime = new FakeRuntime();
  const commands: { tabId: number; command: PanelMessage }[] = [];
  const hellos: number[] = [];
  const closed: number[] = [];
  const logs: string[] = [];
  const port = createPanelPort({
    runtime,
    panelPath: "src/panel/panel.html",
    ready: Promise.resolve(),
    onHello: (tabId) => void hellos.push(tabId),
    onCommand: async (tabId, command) => {
      commands.push({ tabId, command });
      return result;
    },
    onPanelClosed: (tabId) => void closed.push(tabId),
    log: (msg) => void logs.push(msg),
  });
  return { runtime, port, commands, hellos, closed, logs };
}

const types = (p: FakePort) => (p.received as SwMessage[]).map((m) => m.type);

describe("panel-port: verificación del remitente", () => {
  let env: ReturnType<typeof setup>;
  beforeEach(() => {
    env = setup();
  });

  it.each([
    ["nombre distinto", () => env.runtime.connect("otro")],
    [
      "sender.id de otra extensión",
      () => env.runtime.connect("nahual-panel", { id: "otra", url: PANEL_URL }),
    ],
    ["sin sender.id", () => env.runtime.connect("nahual-panel", { url: PANEL_URL })],
    [
      "URL fuera del panel",
      () =>
        env.runtime.connect("nahual-panel", {
          id: EXTENSION_ID,
          url: `chrome-extension://${EXTENSION_ID}/otra.html`,
        }),
    ],
    [
      "URL de una página web",
      () => env.runtime.connect("nahual-panel", { id: EXTENSION_ID, url: "https://evil.test/" }),
    ],
  ])("cierra sin procesar: %s", async (_name, connect) => {
    const p = connect();
    expect(p.disconnected).toBe(true);
    p.fromPanel(makeCommand("hello", { tabId: 1 }));
    await flush();
    expect(env.hellos).toEqual([]);
    expect(p.received).toEqual([]);
  });

  it("acepta el panel con parámetros en la URL", async () => {
    const p = env.runtime.connect("nahual-panel", {
      id: EXTENSION_ID,
      url: `${PANEL_URL}?__nahualTestTabId=3`,
    });
    p.fromPanel(makeCommand("hello", { tabId: 3 }));
    await flush();
    expect(p.disconnected).toBe(false);
    expect(env.hellos).toEqual([3]);
  });
});

describe("panel-port: mensajes", () => {
  let env: ReturnType<typeof setup>;
  let p: FakePort;
  beforeEach(() => {
    env = setup();
    p = env.runtime.connect();
  });

  it("un mensaje antes de hello cierra el puerto", async () => {
    p.fromPanel(makeCommand("attach", {}));
    await flush();
    expect(p.disconnected).toBe(true);
    expect(env.commands).toEqual([]);
  });

  it("hello responde ack con correlationId y notifica onHello", async () => {
    const hello = makeCommand("hello", { tabId: 5 });
    p.fromPanel(hello);
    await flush();
    expect(p.received).toEqual([expect.objectContaining({ type: "ack", correlationId: hello.id })]);
    expect(env.hellos).toEqual([5]);
  });

  it.each([
    ["v ≠ 2 (mensaje de 001)", (m: Record<string, unknown>) => ({ ...m, v: 1 })],
    ["type desconocido", (m: Record<string, unknown>) => ({ ...m, type: "eval" })],
    [
      "payload inválido",
      (m: Record<string, unknown>) => ({ ...m, payload: { pauseTimeoutSeconds: 999 } }),
    ],
  ])("descarta sin responder y registra sin datos: %s", async (_name, mutate) => {
    p.fromPanel(makeCommand("hello", { tabId: 5 }));
    await flush();
    const before = p.received.length;
    const secret = "https://secret.example/token=abc";
    p.fromPanel({
      ...mutate(makeCommand("updateSettings", { pauseTimeoutSeconds: 30 })),
      extra: secret,
    });
    await flush();
    expect(p.received.length).toBe(before);
    expect(env.commands).toEqual([]);
    expect(env.logs).toHaveLength(1);
    expect(env.logs[0]).not.toContain(secret);
  });

  it("cada comando válido recibe exactamente un ack o error con su correlationId", async () => {
    p.fromPanel(makeCommand("hello", { tabId: 5 }));
    await flush();
    const cmd = makeCommand("updateSettings", { pauseTimeoutSeconds: 30 });
    p.fromPanel(cmd);
    await flush();
    const replies = (p.received as SwMessage[]).filter((m) => m.correlationId === cmd.id);
    expect(replies).toEqual([expect.objectContaining({ type: "ack" })]);
    expect(env.commands).toEqual([{ tabId: 5, command: cmd }]);
  });

  it("un CommandResult de error se traduce a error con messageKey", async () => {
    env = setup({ ok: false, code: "not_attached" });
    p = env.runtime.connect();
    p.fromPanel(makeCommand("hello", { tabId: 5 }));
    await flush();
    const cmd = makeCommand("resolvePaused", { pausedId: "x", action: "continueUnchanged" });
    p.fromPanel(cmd);
    await flush();
    expect(p.received.at(-1)).toMatchObject({
      type: "error",
      correlationId: cmd.id,
      payload: { code: "not_attached", messageKey: "error_not_attached" },
    });
  });

  it("un error con issues los incluye en la respuesta", async () => {
    env = setup({
      ok: false,
      code: "rule_invalid",
      issues: [{ path: "prefilter.pattern", messageKey: "rule_error_regex_invalid" }],
    });
    p = env.runtime.connect();
    p.fromPanel(makeCommand("hello", { tabId: 5 }));
    await flush();
    const cmd = makeCommand("saveRule", { rule: { name: "x" } });
    p.fromPanel(cmd);
    await flush();
    expect(p.received.at(-1)).toMatchObject({
      type: "error",
      correlationId: cmd.id,
      payload: {
        code: "rule_invalid",
        issues: [{ path: "prefilter.pattern", messageKey: "rule_error_regex_invalid" }],
      },
    });
  });

  it("un mensaje de más de 6 MB se descarta sin parsear ni responder", async () => {
    p.fromPanel(makeCommand("hello", { tabId: 5 }));
    await flush();
    const before = p.received.length;
    const huge = makeCommand("resolvePaused", {
      pausedId: "p",
      action: "continue",
      edit: { body: "x".repeat(6 * 1024 * 1024 + 1) },
    });
    p.fromPanel(huge);
    await flush();
    expect(p.received.length).toBe(before);
    expect(env.commands).toEqual([]);
    expect(env.logs.at(-1)).toContain("demasiado grande");
  });

  it("si onCommand lanza, responde error cdp_error y el puerto sigue abierto", async () => {
    const runtime = new FakeRuntime();
    createPanelPort({
      runtime,
      panelPath: "src/panel/panel.html",
      ready: Promise.resolve(),
      onHello: () => {},
      onCommand: async () => {
        throw new Error("boom");
      },
      onPanelClosed: () => {},
      log: () => {},
    });
    const q = runtime.connect();
    q.fromPanel(makeCommand("hello", { tabId: 1 }));
    await flush();
    q.fromPanel(makeCommand("attach", {}));
    await flush();
    expect(q.received.at(-1)).toMatchObject({ type: "error", payload: { code: "cdp_error" } });
    expect(q.disconnected).toBe(false);
  });

  it("un segundo hello en el mismo puerto responde error invalid_message", async () => {
    p.fromPanel(makeCommand("hello", { tabId: 5 }));
    await flush();
    p.fromPanel(makeCommand("hello", { tabId: 6 }));
    await flush();
    expect(p.received.at(-1)).toMatchObject({
      type: "error",
      payload: { code: "invalid_message" },
    });
    expect(env.hellos).toEqual([5]);
  });
});

describe("panel-port: dueño del puerto por pestaña", () => {
  it("cerrar el panel emite onPanelClosed(tabId)", async () => {
    const env = setup();
    const p = env.runtime.connect();
    p.fromPanel(makeCommand("hello", { tabId: 9 }));
    await flush();
    p.closeFromPanel();
    expect(env.closed).toEqual([9]);
  });

  it("un segundo hello para la misma pestaña desconecta el puerto anterior sin emitir onPanelClosed", async () => {
    const env = setup();
    const first = env.runtime.connect();
    first.fromPanel(makeCommand("hello", { tabId: 9 }));
    await flush();
    const second = env.runtime.connect();
    second.fromPanel(makeCommand("hello", { tabId: 9 }));
    await flush();
    expect(first.disconnected).toBe(true);
    first.closeFromPanel();
    expect(env.closed).toEqual([]);
    second.closeFromPanel();
    expect(env.closed).toEqual([9]);
  });

  it("send entrega eventos solo al dueño de la pestaña", async () => {
    const env = setup();
    const a = env.runtime.connect();
    const b = env.runtime.connect();
    a.fromPanel(makeCommand("hello", { tabId: 1 }));
    b.fromPanel(makeCommand("hello", { tabId: 2 }));
    await flush();
    env.port.send(2, { v: 2, id: crypto.randomUUID(), type: "ack", payload: {} });
    expect(types(a)).toEqual(["ack"]);
    expect(types(b)).toEqual(["ack", "ack"]);
  });

  it("no procesa mensajes hasta que ready se resuelve", async () => {
    const runtime = new FakeRuntime();
    let release!: () => void;
    const hellos: number[] = [];
    createPanelPort({
      runtime,
      panelPath: "src/panel/panel.html",
      ready: new Promise<void>((resolve) => (release = resolve)),
      onHello: (tabId) => void hellos.push(tabId),
      onCommand: async () => ({ ok: true }),
      onPanelClosed: () => {},
      log: vi.fn(),
    });
    const p = runtime.connect();
    p.fromPanel(makeCommand("hello", { tabId: 4 }));
    await flush();
    expect(hellos).toEqual([]);
    release();
    await flush();
    expect(hellos).toEqual([4]);
  });
});
