import type { Profile, Rule } from "@nahual/domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PROFILES_KEY,
  createProfileStore,
  type ProfileStore,
} from "../../src/background/profile-store.ts";
import { RULES_KEY, createRuleStore, type RuleStore } from "../../src/background/rule-store.ts";
import { FakeStorage } from "../fakes/fake-storage.ts";
import { RULE_ID, RULE_ID2, SITE, rule } from "../fakes/rules.ts";

// 007 T041 (contracts/storage.md, contracts/panel-protocol.md): perfiles por sitio.

const OTHER_SITE = "https://otro.test";
const P = "0b8f8a52-4a0c-4d0e-9f3a-6c1d2e3f4a5b";
const profile = (overrides: Partial<Profile> = {}): Profile => ({
  id: P,
  site: SITE,
  name: "QA staging",
  createdAt: 1,
  updatedAt: 1,
  ...overrides,
});

let storage: FakeStorage;
let notices: string[];
let rules: RuleStore;
let profiles: ProfileStore;
let profileChanges: number;

async function open() {
  profileChanges = 0;
  rules = createRuleStore({
    storage,
    onChange: () => {},
    onNotice: (key) => void notices.push(key),
    profileIdsOf: (site) => profiles.idsOf(site),
  });
  profiles = createProfileStore({
    storage,
    rules,
    onChange: () => void profileChanges++,
    onNotice: (key) => void notices.push(key),
  });
  await Promise.all([rules.ready, profiles.ready]);
}

const storedProfiles = () =>
  (storage.data.get(PROFILES_KEY) as { profiles: Profile[]; lastActive: Record<string, string> })
    ?.profiles ?? [];
const storedRules = () =>
  (storage.data.get(RULES_KEY) as { rules: Rule[] } | undefined)?.rules ?? [];

beforeEach(() => {
  vi.useFakeTimers();
  storage = new FakeStorage();
  notices = [];
});
afterEach(() => vi.useRealTimers());

describe("ProfileStore: lectura", () => {
  it("sin datos: ningún perfil", async () => {
    await open();
    expect(profiles.all()).toEqual([]);
    expect(profiles.lastActive()).toEqual({});
  });

  it("versión desconocida ⇒ aviso y nada cargado", async () => {
    storage.data.set(PROFILES_KEY, { version: 9, profiles: [profile()], lastActive: {} });
    await open();
    expect(profiles.all()).toEqual([]);
    expect(notices).toContain("notice_profiles_version");
  });

  it("descarta perfiles inválidos y recuerdos de perfiles que no existen", async () => {
    storage.data.set(PROFILES_KEY, {
      version: 1,
      profiles: [profile(), { ...profile(), id: "x" }],
      lastActive: { [SITE]: P, [OTHER_SITE]: "1c9f8a52-4a0c-4d0e-9f3a-6c1d2e3f4a5b" },
    });
    await open();
    expect(profiles.all().map((p) => p.id)).toEqual([P]);
    expect(profiles.lastActive()).toEqual({ [SITE]: P });
  });
});

describe("ProfileStore: crear, renombrar, duplicar, eliminar y deshacer", () => {
  it("crea con nombre recortado y valida requerido, largo, duplicado y límite", async () => {
    await open();
    expect(await profiles.save({ name: "  QA  " }, SITE)).toEqual({ ok: true });
    expect(storedProfiles()).toMatchObject([{ site: SITE, name: "QA" }]);
    const issue = async (name: string) => {
      const result = await profiles.save({ name }, SITE);
      return result.ok ? null : result.issues?.[0]?.messageKey;
    };
    expect(await issue(" ")).toBe("profile_error_required");
    expect(await issue("x".repeat(61))).toBe("profile_error_too_long");
    expect(await issue("qa")).toBe("profile_error_duplicate");
    expect((await profiles.save({ name: "QA" }, OTHER_SITE)).ok).toBe(true);
    for (let i = 1; i < 50; i++) await profiles.save({ name: `P${i}` }, SITE);
    expect(await issue("Uno más")).toBe("profile_error_limit");
    expect(await profiles.save({ name: "x" }, null)).toEqual({ ok: false, code: "no_site" });
  });

  it("renombra por id; un id desconocido es profile_not_found", async () => {
    storage.data.set(PROFILES_KEY, { version: 1, profiles: [profile()], lastActive: {} });
    await open();
    expect(await profiles.save({ id: P, name: "Bug 1234" }, SITE)).toEqual({ ok: true });
    expect(profiles.all()[0]?.name).toBe("Bug 1234");
    expect(
      await profiles.save({ id: "1c9f8a52-4a0c-4d0e-9f3a-6c1d2e3f4a5b", name: "x" }, SITE),
    ).toEqual({ ok: false, code: "profile_not_found" });
  });

  it("duplicar copia la pertenencia de sus reglas en una sola escritura", async () => {
    storage.data.set(PROFILES_KEY, { version: 1, profiles: [profile()], lastActive: {} });
    storage.data.set(RULES_KEY, {
      version: 1,
      rules: [rule({ profileIds: [P] }), rule({ id: RULE_ID2, order: 1 })],
    });
    await open();
    const set = vi.spyOn(storage, "set");
    expect(await profiles.duplicate(P, "QA copia")).toEqual({ ok: true });
    expect(set).toHaveBeenCalledTimes(1);
    const copy = profiles.all().find((p) => p.name === "QA copia");
    expect(copy).toBeDefined();
    expect(storedRules().find((r) => r.id === RULE_ID)?.profileIds).toEqual([P, copy?.id]);
    expect(storedRules().find((r) => r.id === RULE_ID2)?.profileIds).toEqual([]);
    expect((await profiles.duplicate(P, "qa copia")).ok).toBe(false);
  });

  it("eliminar quita la pertenencia sin borrar reglas; deshacer en 10 s lo recupera todo", async () => {
    storage.data.set(PROFILES_KEY, {
      version: 1,
      profiles: [profile()],
      lastActive: { [SITE]: P },
    });
    storage.data.set(RULES_KEY, { version: 1, rules: [rule({ profileIds: [P] })] });
    await open();
    expect(await profiles.remove(P)).toEqual({ ok: true });
    expect(profiles.all()).toEqual([]);
    expect(profiles.lastActive()).toEqual({});
    expect(storedRules()).toHaveLength(1);
    expect(storedRules()[0]?.profileIds).toEqual([]);
    expect(await profiles.restore(P)).toEqual({ ok: true });
    expect(profiles.all().map((p) => p.id)).toEqual([P]);
    expect(storedRules()[0]?.profileIds).toEqual([P]);
  });

  it("deshacer después de 10 s ya no es posible", async () => {
    storage.data.set(PROFILES_KEY, { version: 1, profiles: [profile()], lastActive: {} });
    await open();
    await profiles.remove(P);
    vi.advanceTimersByTime(10_001);
    expect(await profiles.restore(P)).toEqual({ ok: false, code: "undo_expired" });
  });
});

describe("ProfileStore: último perfil por sitio (FR-022)", () => {
  it("guarda y borra el recuerdo del sitio", async () => {
    storage.data.set(PROFILES_KEY, { version: 1, profiles: [profile()], lastActive: {} });
    await open();
    await profiles.setLastActive(SITE, P);
    expect(profiles.lastActive()).toEqual({ [SITE]: P });
    await profiles.setLastActive(SITE, null);
    expect(profiles.lastActive()).toEqual({});
    expect(profileChanges).toBeGreaterThan(0);
  });

  it("una escritura externa se recarga y avisa", async () => {
    await open();
    storage.externalWrite(PROFILES_KEY, { version: 1, profiles: [profile()], lastActive: {} });
    expect(profiles.all().map((p) => p.id)).toEqual([P]);
    expect(profileChanges).toBe(1);
  });
});
