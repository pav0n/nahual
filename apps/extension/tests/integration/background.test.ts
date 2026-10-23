import { makeCommand, type SwMessage } from "@nahual/protocol";
import { beforeEach, describe, expect, it } from "vitest";
import { createBackground } from "../../src/background/app.ts";
import { SETTINGS_KEY } from "../../src/background/settings-store.ts";
import { FakeDebugger } from "../fakes/fake-debugger.ts";
import { FakeRuntime, type FakePort } from "../fakes/fake-runtime.ts";
import { FakeStorage } from "../fakes/fake-storage.ts";

const flush = async () => {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
};

let cdp: FakeDebugger;
let runtime: FakeRuntime;
let local: FakeStorage;

const received = (port: FakePort) => port.received as SwMessage[];
const last = <T extends SwMessage["type"]>(port: FakePort, type: T) =>
  received(port)
    .filter((m): m is Extract<SwMessage, { type: T }> => m.type === type)
    .at(-1);

async function openPanel(tabId = 1) {
  const port = runtime.connect();
  port.fromPanel(makeCommand("hello", { tabId }));
  await flush();
  return port;
}

beforeEach(async () => {
  cdp = new FakeDebugger();
  runtime = new FakeRuntime();
  local = new FakeStorage();
  cdp.respond("Target.getTargetInfo", () => ({ targetInfo: { url: "http://localhost:3000/" } }));
  const bg = createBackground({
    debugger: cdp,
    runtime,
    sessionStorage: new FakeStorage(),
    localStorage: local,
  });
  await bg.ready;
});

describe("background: arranque y hello", () => {
  it("hello responde ack, settings, rules y state", async () => {
    const port = await openPanel();
    expect(received(port).map((m) => m.type)).toEqual(["ack", "settings", "rules", "state"]);
    expect(last(port, "state")?.payload).toMatchObject({
      status: "detached",
      site: null,
      activeRuleCount: 0,
      queueSize: 0,
      globalPaused: false,
    });
  });

  it("al adjuntar, state lleva el sitio y Fetch queda sin habilitar (sin reglas)", async () => {
    const port = await openPanel();
    port.fromPanel(makeCommand("attach", {}));
    await flush();
    expect(last(port, "state")?.payload).toMatchObject({
      status: "attached",
      site: "http://localhost:3000",
    });
    expect(cdp.sentMethods(1)).not.toContain("Fetch.enable");
  });

  it("attach { consent: true } guarda attachConsent (FR-027a)", async () => {
    const port = await openPanel();
    port.fromPanel(makeCommand("attach", { consent: true }));
    await flush();
    expect(local.data.get(SETTINGS_KEY)).toMatchObject({ settings: { attachConsent: true } });
    expect(last(port, "settings")?.payload.attachConsent).toBe(true);
  });

  it("attach sin consentimiento no lo guarda", async () => {
    const port = await openPanel();
    port.fromPanel(makeCommand("attach", {}));
    await flush();
    expect(local.data.has(SETTINGS_KEY)).toBe(false);
  });

  it("updateSettings se difunde a todos los paneles abiertos", async () => {
    const a = await openPanel(1);
    const b = await openPanel(2);
    a.fromPanel(makeCommand("updateSettings", { globalPaused: true }));
    await flush();
    expect(last(b, "settings")?.payload.globalPaused).toBe(true);
    expect(last(b, "state")?.payload.globalPaused).toBe(true);
  });

  it("un request pausado sin reglas continúa sin cambios", async () => {
    const port = await openPanel();
    port.fromPanel(makeCommand("attach", {}));
    await flush();
    cdp.emit(1, "Fetch.requestPaused", {
      requestId: "fetch-1",
      resourceType: "Fetch",
      request: { url: "https://api.test/x", method: "GET", headers: {} },
    });
    await flush();
    expect(cdp.calls("Fetch.continueRequest", 1)).toEqual([{ requestId: "fetch-1" }]);
  });

  it("cerrar el panel suelta el debugger", async () => {
    const port = await openPanel();
    port.fromPanel(makeCommand("attach", {}));
    await flush();
    port.closeFromPanel();
    await flush();
    expect(cdp.attached.has(1)).toBe(false);
  });
});
