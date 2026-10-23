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
    expect(received(port).map((m) => m.type)).toEqual([
      "ack",
      "settings",
      "rules",
      "relaxations",
      "state",
    ]);
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

describe("background: comandos CORS (003, contracts/panel-protocol.md)", () => {
  const APP = "http://localhost:3000";
  const API = "https://api-dev.test";
  const relax = (overrides = {}) =>
    makeCommand("relaxCors", {
      appOrigin: APP,
      apiOrigin: API,
      durationMinutes: 480,
      exposeHeaders: [],
      credentials: false,
      ...overrides,
    });
  const fetchPatterns = (tabId: number) =>
    cdp
      .calls<{ patterns?: { urlPattern: string; requestStage: string }[] }>("Fetch.enable", tabId)
      .at(-1)?.patterns;

  async function attached(tabId = 1) {
    cdp.respond("Page.getFrameTree", () => ({
      frameTree: { frame: { id: "main", url: `${APP}/`, securityOrigin: APP } },
    }));
    const port = await openPanel(tabId);
    port.fromPanel(makeCommand("attach", {}));
    await flush();
    return port;
  }

  it("relaxCors válido ⇒ ack, relaxations, Fetch.enable en Response y relaxationCount", async () => {
    const port = await attached();
    port.fromPanel(relax());
    await flush();
    expect(last(port, "ack")).toBeDefined();
    expect(last(port, "relaxations")?.payload.items).toEqual([
      expect.objectContaining({ appOrigin: APP, apiOrigin: API, state: "active" }),
    ]);
    expect(fetchPatterns(1)).toEqual([{ urlPattern: `${API}/*`, requestStage: "Response" }]);
    expect(last(port, "state")?.payload.relaxationCount).toBe(1);
  });

  it.each([
    ["producción", { apiOrigin: "https://api.empresa.com" }, "cors_issue_production_origin"],
    ["origen null", { appOrigin: "null" }, "cors_issue_app_origin_null"],
    ["igual al de la app", { apiOrigin: APP }, "cors_issue_same_origin"],
  ])("relaxCors con %s ⇒ error y ninguna llamada a Fetch.enable", async (_name, overrides, key) => {
    const port = await attached();
    port.fromPanel(makeCommand("updateSettings", { productionOrigins: ["https://*.empresa.com"] }));
    await flush();
    port.fromPanel(relax(overrides));
    await flush();
    expect(last(port, "error")?.payload).toMatchObject({
      code: "relaxation_invalid",
      issues: [expect.objectContaining({ messageKey: key })],
    });
    expect(cdp.calls("Fetch.enable", 1)).toEqual([]);
  });

  it("sin debugger adjunto ⇒ not_attached", async () => {
    const port = await openPanel();
    port.fromPanel(relax());
    await flush();
    expect(last(port, "error")?.payload.code).toBe("not_attached");
  });

  it("desde la pestaña A nunca relaja la B", async () => {
    const a = await attached(1);
    const b = await attached(2);
    a.fromPanel(relax());
    await flush();
    expect(last(b, "relaxations")?.payload.items ?? []).toEqual([]);
    expect(cdp.calls("Fetch.enable", 2)).toEqual([]);
  });

  it("endRelaxation sin id termina todas; con un id ya terminado responde ack", async () => {
    const port = await attached();
    port.fromPanel(relax());
    port.fromPanel(relax({ apiOrigin: "https://b.test" }));
    await flush();
    const firstId = last(port, "relaxations")?.payload.items[0]?.id ?? "";
    port.fromPanel(makeCommand("endRelaxation", { relaxationId: firstId }));
    await flush();
    expect(last(port, "relaxations")?.payload.items).toHaveLength(1);
    port.fromPanel(makeCommand("endRelaxation", {}));
    await flush();
    expect(last(port, "relaxations")?.payload.items).toEqual([]);
    expect(cdp.calls<{ patterns?: unknown }>("Fetch.disable", 1)).not.toHaveLength(0);
    const before = received(port).length;
    port.fromPanel(makeCommand("endRelaxation", { relaxationId: firstId }));
    await flush();
    expect(
      received(port)
        .slice(before)
        .map((m) => m.type),
    ).toContain("ack");
  });

  it("soltar el debugger termina la relajación con aviso", async () => {
    const port = await attached();
    port.fromPanel(relax());
    await flush();
    port.fromPanel(makeCommand("detach", {}));
    await flush();
    expect(last(port, "relaxations")?.payload.items).toEqual([]);
    expect(last(port, "notice")?.payload.messageKey).toBe("cors_ended_detached");
  });

  it("guardar un origen de producción que coincide la termina", async () => {
    const port = await attached();
    port.fromPanel(relax());
    await flush();
    port.fromPanel(makeCommand("updateSettings", { productionOrigins: [API] }));
    await flush();
    expect(last(port, "relaxations")?.payload.items).toEqual([]);
    expect(last(port, "notice")?.payload.messageKey).toBe("cors_ended_production");
  });

  it("pausar Nahual la suspende y quita sus patrones", async () => {
    const port = await attached();
    port.fromPanel(relax());
    await flush();
    port.fromPanel(makeCommand("updateSettings", { globalPaused: true }));
    await flush();
    expect(last(port, "relaxations")?.payload.items[0]?.state).toBe("suspended");
    expect(cdp.sentMethods(1).at(-1)).not.toBe("Fetch.enable");
  });
});
