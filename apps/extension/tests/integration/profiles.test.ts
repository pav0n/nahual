import { makeCommand, type SwMessage } from "@nahual/protocol";
import { beforeEach, describe, expect, it } from "vitest";
import { createBackground } from "../../src/background/app.ts";
import { PROFILES_KEY } from "../../src/background/profile-store.ts";
import { RULES_KEY } from "../../src/background/rule-store.ts";
import { frameNavigated } from "../fakes/cdp-events.ts";
import { FakeDebugger } from "../fakes/fake-debugger.ts";
import { FakeRuntime, type FakePort } from "../fakes/fake-runtime.ts";
import { FakeStorage } from "../fakes/fake-storage.ts";
import { SITE, rule } from "../fakes/rules.ts";

// 007 T044 (contracts/panel-protocol.md v6): perfiles de punta a punta en el SW.

const flush = async () => {
  for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0));
};
const P = "0b8f8a52-4a0c-4d0e-9f3a-6c1d2e3f4a5b";

let cdp: FakeDebugger;
let runtime: FakeRuntime;
let local: FakeStorage;

const received = (port: FakePort) => port.received as SwMessage[];
const last = <T extends SwMessage["type"]>(port: FakePort, type: T) =>
  received(port)
    .filter((m): m is Extract<SwMessage, { type: T }> => m.type === type)
    .at(-1);
const reply = (port: FakePort) => received(port).at(-1);

async function start(seed: { rules?: unknown[]; profiles?: unknown } = {}) {
  cdp = new FakeDebugger();
  runtime = new FakeRuntime();
  local = new FakeStorage();
  if (seed.rules) local.data.set(RULES_KEY, { version: 1, rules: seed.rules });
  if (seed.profiles) local.data.set(PROFILES_KEY, seed.profiles);
  cdp.respond("Target.getTargetInfo", () => ({ targetInfo: { url: `${SITE}/` } }));
  const bg = createBackground({
    debugger: cdp,
    runtime,
    sessionStorage: new FakeStorage(),
    localStorage: local,
  });
  await bg.ready;
}

async function attached(tabId = 1) {
  const port = runtime.connect();
  port.fromPanel(makeCommand("hello", { tabId }));
  await flush();
  port.fromPanel(makeCommand("attach", {}));
  await flush();
  return port;
}

const profileState = (lastActive: Record<string, string> = {}) => ({
  version: 1,
  profiles: [{ id: P, site: SITE, name: "QA", createdAt: 1, updatedAt: 1 }],
  lastActive,
});

describe("perfiles en el SW", () => {
  beforeEach(async () => {
    await start({ rules: [rule()], profiles: profileState() });
  });

  it("hello manda profiles; state lleva activeProfileId null y cuenta las reglas que actúan", async () => {
    const port = await attached();
    expect(last(port, "profiles")?.payload).toEqual({
      profiles: [expect.objectContaining({ id: P })],
      lastActive: {},
    });
    expect(last(port, "state")?.payload).toMatchObject({
      activeProfileId: null,
      activeRuleCount: 1,
    });
  });

  it("setActiveProfile cambia el estado, el recuerdo del sitio y deja sin efecto las reglas de fuera", async () => {
    const port = await attached();
    port.fromPanel(makeCommand("setActiveProfile", { profileId: P }));
    await flush();
    expect(last(port, "state")?.payload).toMatchObject({ activeProfileId: P, activeRuleCount: 0 });
    expect((local.data.get(PROFILES_KEY) as { lastActive: unknown }).lastActive).toEqual({
      [SITE]: P,
    });
    cdp.emit(1, "Fetch.requestPaused", {
      requestId: "fetch-1",
      resourceType: "Fetch",
      request: { url: "https://api.test/api/items", method: "GET", headers: {} },
      responseStatusCode: 500,
      responseHeaders: [],
    });
    await flush();
    expect(cdp.calls("Fetch.continueResponse", 1)).toEqual([{ requestId: "fetch-1" }]);
  });

  it("dos pestañas del mismo sitio con perfiles distintos", async () => {
    const a = await attached(1);
    const b = await attached(2);
    a.fromPanel(makeCommand("setActiveProfile", { profileId: P }));
    await flush();
    expect(last(a, "state")?.payload.activeProfileId).toBe(P);
    expect(last(b, "state")?.payload.activeProfileId).toBeNull();
  });

  it("setActiveProfile de un perfil desconocido responde profile_not_found", async () => {
    const port = await attached();
    port.fromPanel(
      makeCommand("setActiveProfile", { profileId: "1c9f8a52-4a0c-4d0e-9f3a-6c1d2e3f4a5b" }),
    );
    await flush();
    expect(reply(port)).toMatchObject({ type: "error", payload: { code: "profile_not_found" } });
  });

  it("saveProfile, duplicateProfile y setRuleProfiles difunden profiles y rules", async () => {
    const port = await attached();
    port.fromPanel(makeCommand("saveProfile", { name: "Bug 1234" }));
    await flush();
    expect(last(port, "profiles")?.payload.profiles.map((p) => p.name)).toEqual(["QA", "Bug 1234"]);
    const ruleId = last(port, "rules")?.payload.rules[0]?.id ?? "";
    port.fromPanel(makeCommand("setRuleProfiles", { ruleId, profileIds: [P] }));
    await flush();
    expect(last(port, "rules")?.payload.rules[0]?.profileIds).toEqual([P]);
    port.fromPanel(makeCommand("duplicateProfile", { id: P, name: "QA 2" }));
    await flush();
    const copy = last(port, "profiles")?.payload.profiles.find((p) => p.name === "QA 2");
    expect(last(port, "rules")?.payload.rules[0]?.profileIds).toEqual([P, copy?.id]);
  });

  it("borrar el perfil activo avisa a la pestaña y la deja en todas las reglas; deshacer recupera el perfil", async () => {
    const a = await attached(1);
    a.fromPanel(makeCommand("setActiveProfile", { profileId: P }));
    await flush();
    a.fromPanel(makeCommand("deleteProfile", { id: P }));
    await flush();
    expect(last(a, "state")?.payload.activeProfileId).toBeNull();
    expect(last(a, "notice")?.payload.messageKey).toBe("notice_profile_deleted_active");
    a.fromPanel(makeCommand("restoreProfile", { id: P }));
    await flush();
    expect(last(a, "profiles")?.payload.profiles.map((p) => p.id)).toEqual([P]);
    expect(last(a, "state")?.payload.activeProfileId).toBeNull();
  });

  it("con un perfil activo sin reglas, una relajación CORS sigue aplicándose (FR-025)", async () => {
    const port = await attached();
    port.fromPanel(makeCommand("setActiveProfile", { profileId: P }));
    await flush();
    port.fromPanel(
      makeCommand("relaxCors", {
        appOrigin: SITE,
        apiOrigin: "https://api.test",
        durationMinutes: 60,
        exposeHeaders: [],
        credentials: false,
      }),
    );
    await flush();
    expect(last(port, "state")?.payload).toMatchObject({ relaxationCount: 1, activeProfileId: P });
    expect(cdp.sentMethods(1)).toContain("Fetch.enable");
  });
});

describe("recuerdo por sitio y reinicio del SW (FR-022)", () => {
  it("al abrir el panel en una pestaña del sitio se restaura el último perfil", async () => {
    await start({ rules: [rule()], profiles: profileState({ [SITE]: P }) });
    const port = await attached(7);
    expect(last(port, "state")?.payload.activeProfileId).toBe(P);
  });

  it("al navegar a otro sitio pasa a todas las reglas y al volver recupera el que tenía", async () => {
    await start({ rules: [rule()], profiles: profileState({ [SITE]: P }) });
    const port = await attached();
    cdp.emit(1, "Page.frameNavigated", frameNavigated("https://otro.test/"));
    await flush();
    expect(last(port, "state")?.payload.activeProfileId).toBeNull();
    cdp.emit(1, "Page.frameNavigated", frameNavigated(`${SITE}/vuelta`));
    await flush();
    expect(last(port, "state")?.payload.activeProfileId).toBe(P);
  });
});
