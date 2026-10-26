import { DEFAULT_SETTINGS, type Profile, type Rule } from "@nahual/domain";
import { REDACTED_CONFIG, exportConfig } from "@nahual/domain/portable";
import { hashSource } from "@nahual/hook-runtime";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createImportService, type ImportService } from "../../src/background/import-service.ts";
import {
  PROFILES_KEY,
  createProfileStore,
  type ProfileStore,
} from "../../src/background/profile-store.ts";
import { RULES_KEY, createRuleStore, type RuleStore } from "../../src/background/rule-store.ts";
import {
  SETTINGS_KEY,
  createSettingsStore,
  type SettingsStore,
} from "../../src/background/settings-store.ts";
import { FakeStorage } from "../fakes/fake-storage.ts";
import { SITE, draft, rule } from "../fakes/rules.ts";

// 007 T057 (research R10, contracts/portable-config.md, FR-029 a FR-032, FR-026a).

const P = "0b8f8a52-4a0c-4d0e-9f3a-6c1d2e3f4a5b";
const IMPORT = "6f0c2a52-6a1e-4c55-9d0a-2f6a1c1f9a10";
const SOURCE = "export default (ctx) => ctx;";

let storage: FakeStorage;
let rules: RuleStore;
let profiles: ProfileStore;
let settings: SettingsStore;
let service: ImportService;

const sourceConfig = (includeSensitive = false) => {
  const profile: Profile = { id: P, site: SITE, name: "QA", createdAt: 1, updatedAt: 1 };
  const list: Rule[] = [
    rule({
      profileIds: [P],
      conditions: [{ kind: "header", name: "authorization", op: "equals", value: "Bearer s" }],
    }),
    rule({
      id: "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d",
      order: 1,
      stage: "request",
      conditions: [],
      action: {
        kind: "hook",
        source: SOURCE,
        imported: false,
        permissions: { changeDestination: true, readSensitive: true },
        check: { hash: hashSource(SOURCE), ok: true },
      },
    }),
  ];
  return exportConfig(
    list,
    [profile],
    { productionOrigins: ["https://app.example.com"] },
    {
      appVersion: "1.0.0",
      includeSensitive,
      now: 0,
    },
  ).config;
};

async function open() {
  rules = createRuleStore({
    storage,
    onChange: () => {},
    onNotice: () => {},
    profileIdsOf: (site) => profiles.idsOf(site),
  });
  profiles = createProfileStore({ storage, rules, onChange: () => {}, onNotice: () => {} });
  settings = createSettingsStore({ storage, onChange: () => {}, onNotice: () => {} });
  service = createImportService({
    rules,
    profiles,
    settings,
    renamed: (name) => `${name} (imported)`,
  });
  await Promise.all([rules.ready, profiles.ready, settings.ready]);
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  storage = new FakeStorage();
  storage.data.set(SETTINGS_KEY, {
    version: 1,
    settings: { ...DEFAULT_SETTINGS, productionOrigins: ["https://ya.example.com"] },
  });
  await open();
});
afterEach(() => vi.useRealTimers());

const payload = (config: unknown, hookChecks = {}) => ({
  importId: IMPORT,
  config: config as Record<string, unknown>,
  source: "config" as const,
  hookChecks,
});

describe("importConfig", () => {
  it("escribe reglas, perfiles y ajustes en una sola llamada, todo desactivado e importado", async () => {
    const set = vi.spyOn(storage, "set");
    const hookRuleId = sourceConfig().sites[0]?.rules[1]?.id ?? "";
    const result = await service.importConfig(
      payload(sourceConfig(), { [hookRuleId]: { hash: hashSource(SOURCE), ok: true } }),
    );
    expect(result, JSON.stringify(result)).toEqual({ ok: true });
    expect(set).toHaveBeenCalledTimes(1);
    expect(Object.keys(set.mock.calls[0]?.[0] ?? {}).sort()).toEqual(
      [PROFILES_KEY, RULES_KEY, SETTINGS_KEY].sort(),
    );
    expect(rules.all()).toHaveLength(2);
    expect(rules.all().every((r) => !r.enabled && r.importedFrom === "config")).toBe(true);
    const hook = rules.all().find((r) => r.action.kind === "hook");
    expect(hook?.action).toMatchObject({
      imported: true,
      permissions: { changeDestination: false, readSensitive: false },
      check: { ok: true },
    });
    expect(profiles.all().map((p) => p.name)).toEqual(["QA"]);
    expect(settings.get().productionOrigins).toEqual([
      "https://ya.example.com",
      "https://app.example.com",
    ]);
  });

  it("un check con otro hash no vale: el hook queda sin comprobar", async () => {
    const hookRuleId = sourceConfig().sites[0]?.rules[1]?.id ?? "";
    await service.importConfig(payload(sourceConfig(), { [hookRuleId]: { hash: "0", ok: true } }));
    expect(rules.all().find((r) => r.action.kind === "hook")?.action).toMatchObject({
      check: { ok: false },
    });
  });

  it("revalida en el SW: un archivo inválido o fuera de límites no cambia nada", async () => {
    const before = structuredClone([...storage.data]);
    expect(await service.importConfig(payload({ nahual: "config", version: 1 }))).toMatchObject({
      ok: false,
      code: "config_invalid",
    });
    expect(await service.importConfig(payload({ ...sourceConfig(), version: 9 }))).toMatchObject({
      ok: false,
      code: "config_invalid",
      issues: [{ messageKey: "config_error_newer_version" }],
    });
    expect([...storage.data]).toEqual(before);
  });

  it("sin cuota, nada cambia (todo o nada)", async () => {
    storage.failWritesWithQuota();
    expect(await service.importConfig(payload(sourceConfig()))).toEqual({
      ok: false,
      code: "storage_quota",
    });
    expect(rules.all()).toEqual([]);
    expect(profiles.all()).toEqual([]);
    expect(settings.get().productionOrigins).toEqual(["https://ya.example.com"]);
  });

  it("deshacer en 10 s quita solo lo importado y los orígenes añadidos", async () => {
    expect(await rules.save(draft({ name: "Mía" }), SITE)).toEqual({ ok: true });
    await service.importConfig(payload(sourceConfig()));
    expect(rules.all()).toHaveLength(3);
    expect(await service.undoImport(IMPORT)).toEqual({ ok: true });
    expect(rules.all().map((r) => r.name)).toEqual(["Mía"]);
    expect(profiles.all()).toEqual([]);
    expect(settings.get().productionOrigins).toEqual(["https://ya.example.com"]);
  });

  it("después de 10 s ya no se deshace", async () => {
    await service.importConfig(payload(sourceConfig()));
    vi.advanceTimersByTime(10_001);
    expect(await service.undoImport(IMPORT)).toEqual({ ok: false, code: "undo_expired" });
  });

  it("una regla con valores redactados no se activa hasta completarlos (FR-028)", async () => {
    await service.importConfig(payload(sourceConfig()));
    const redacted = rules.all().find((r) => JSON.stringify(r).includes(REDACTED_CONFIG));
    expect(redacted).toBeDefined();
    expect(await rules.setEnabled(redacted?.id ?? "", true)).toEqual({
      ok: false,
      code: "rule_invalid",
      issues: [{ path: "enabled", messageKey: "rule_error_redacted_value" }],
    });
  });
});
