import type { Rule } from "@nahual/domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RULES_KEY, createRuleStore, type RuleStore } from "../../src/background/rule-store.ts";
import { hashSource } from "@nahual/hook-runtime";
import { FakeStorage } from "../fakes/fake-storage.ts";
import { RULE_ID, RULE_ID2, SITE, draft, rule } from "../fakes/rules.ts";

let storage: FakeStorage;
let notices: string[];
let changes: number;

async function open(): Promise<RuleStore> {
  const store = createRuleStore({
    storage,
    onChange: () => void changes++,
    onNotice: (key) => void notices.push(key),
  });
  await store.ready;
  return store;
}

const stored = () => (storage.data.get(RULES_KEY) as { rules: Rule[] } | undefined)?.rules ?? [];

beforeEach(() => {
  vi.useFakeTimers();
  storage = new FakeStorage();
  notices = [];
  changes = 0;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("RuleStore: lectura (contracts/storage.md)", () => {
  it("un cambio que llega antes que la lectura inicial no se pisa con el valor viejo", async () => {
    const store = createRuleStore({
      storage,
      onChange: () => void changes++,
      onNotice: (key) => void notices.push(key),
    });
    storage.externalWrite(RULES_KEY, { version: 1, rules: [rule()] });
    await store.ready;
    expect(store.all()).toHaveLength(1);
  });

  it("sin datos no hay reglas ni avisos", async () => {
    const store = await open();
    expect(store.all()).toEqual([]);
    expect(store.discarded()).toEqual([]);
  });

  it("reglas corruptas mezcladas con válidas: se usan las válidas y se cuentan las otras", async () => {
    storage.data.set(RULES_KEY, {
      version: 1,
      rules: [
        rule(),
        { ...rule({ id: RULE_ID2 }), prefilter: { kind: "regex", pattern: "([" } },
        "basura",
      ],
    });
    const store = await open();
    expect(store.all().map((r) => r.id)).toEqual([RULE_ID]);
    expect(store.discarded()).toEqual([{ count: 2, reasonKey: "notice_rules_invalid" }]);
  });

  it("una regla con JSONPath que no compila se descarta al leer", async () => {
    storage.data.set(RULES_KEY, {
      version: 1,
      rules: [rule({ conditions: [{ kind: "jsonPath", path: "$.[", op: "exists" }] })],
    });
    const store = await open();
    expect(store.all()).toEqual([]);
  });

  it("versión desconocida: se ignora sin sobrescribir el disco", async () => {
    const raw = { version: 7, rules: [rule()] };
    storage.data.set(RULES_KEY, raw);
    const store = await open();
    expect(store.all()).toEqual([]);
    expect(notices).toEqual(["notice_rules_version"]);
    expect(storage.data.get(RULES_KEY)).toEqual(raw);
  });

  it("las inválidas no se borran del disco al escribir", async () => {
    const bad = { ...rule({ id: RULE_ID2 }), name: "" };
    storage.data.set(RULES_KEY, { version: 1, rules: [rule(), bad] });
    const store = await open();
    await store.setEnabled(RULE_ID, false);
    expect(stored()).toContainEqual(bad);
  });

  it("un cambio externo se vuelve a validar y notifica", async () => {
    const store = await open();
    storage.externalWrite(RULES_KEY, { version: 1, rules: [rule()] });
    expect(store.all()).toHaveLength(1);
    expect(changes).toBeGreaterThan(0);
  });
});

describe("RuleStore: escritura", () => {
  it("crea una regla en el sitio, al final y con fechas", async () => {
    const store = await open();
    vi.setSystemTime(5_000);
    const first = await store.save(draft(), SITE);
    const second = await store.save(draft({ name: "Otra" }), SITE);
    expect(first.ok && second.ok).toBe(true);
    const rules = store.forSite(SITE);
    expect(rules.map((r) => [r.name, r.order])).toEqual([
      ["Errores de la API", 0],
      ["Otra", 1],
    ]);
    expect(rules[0]).toMatchObject({ site: SITE, createdAt: 5_000, updatedAt: 5_000 });
    expect(stored()).toHaveLength(2);
  });

  it("reemplaza una regla existente conservando sitio, orden y creación", async () => {
    const store = await open();
    await store.save(draft(), SITE);
    const [created] = store.all();
    vi.setSystemTime(9_000);
    const result = await store.save(
      { ...draft({ name: "Renombrada" }), id: created?.id },
      "https://otro.test",
    );
    expect(result).toEqual({ ok: true });
    expect(store.all()).toEqual([
      expect.objectContaining({ name: "Renombrada", site: SITE, order: 0, updatedAt: 9_000 }),
    ]);
  });

  it("valida al guardar: issues por campo y nada escrito", async () => {
    const store = await open();
    const result = await store.save(
      { ...draft(), prefilter: { kind: "regex", pattern: "([a-z" } },
      SITE,
    );
    expect(result).toEqual({
      ok: false,
      code: "rule_invalid",
      issues: [{ path: "prefilter.pattern", messageKey: "rule_error_regex_invalid" }],
    });
    expect(storage.data.has(RULES_KEY)).toBe(false);
  });

  it("sin sitio ⇒ no_site; id desconocido ⇒ unknown_rule", async () => {
    const store = await open();
    expect(await store.save(draft(), null)).toMatchObject({ ok: false, code: "no_site" });
    expect(await store.save({ ...draft(), id: RULE_ID }, SITE)).toMatchObject({
      ok: false,
      code: "unknown_rule",
    });
  });

  it("≤ 500 reglas: la 501 se rechaza con rule_invalid", async () => {
    storage.data.set(RULES_KEY, {
      version: 1,
      rules: Array.from({ length: 500 }, (_, i) =>
        rule({ id: crypto.randomUUID(), order: i, name: `r${i}` }),
      ),
    });
    const store = await open();
    expect(await store.save(draft(), SITE)).toEqual({
      ok: false,
      code: "rule_invalid",
      issues: [{ path: "", messageKey: "rule_error_too_many_rules" }],
    });
  });

  it("cuota llena ⇒ storage_quota sin cambiar la memoria", async () => {
    const store = await open();
    storage.failWritesWithQuota();
    expect(await store.save(draft(), SITE)).toEqual({ ok: false, code: "storage_quota" });
    expect(store.all()).toEqual([]);
  });

  it("escrituras seguidas no se pisan", async () => {
    const store = await open();
    await Promise.all([
      store.save(draft({ name: "a" }), SITE),
      store.save(draft({ name: "b" }), SITE),
    ]);
    expect(
      stored()
        .map((r) => r.name)
        .sort(),
    ).toEqual(["a", "b"]);
  });

  it("eliminar y restaurar en 10 s; después unknown_rule", async () => {
    const store = await open();
    await store.save(draft({ name: "a" }), SITE);
    await store.save(draft({ name: "b" }), SITE);
    const [a] = store.forSite(SITE);
    expect(await store.remove(a?.id ?? "")).toEqual({ ok: true });
    expect(store.forSite(SITE).map((r) => [r.name, r.order])).toEqual([["b", 0]]);
    expect(await store.restore(a?.id ?? "")).toEqual({ ok: true });
    expect(store.forSite(SITE).map((r) => [r.name, r.order])).toEqual([
      ["a", 0],
      ["b", 1],
    ]);
    await store.remove(a?.id ?? "");
    vi.advanceTimersByTime(10_001);
    expect(await store.restore(a?.id ?? "")).toEqual({ ok: false, code: "unknown_rule" });
  });

  it("setEnabled", async () => {
    const store = await open();
    await store.save(draft(), SITE);
    const [created] = store.all();
    expect(await store.setEnabled(created?.id ?? "", false)).toEqual({ ok: true });
    expect(store.all()[0]?.enabled).toBe(false);
    expect(await store.setEnabled(RULE_ID2, true)).toEqual({ ok: false, code: "unknown_rule" });
  });
});

describe("RuleStore: prioridad (FR-016)", () => {
  it("reorderRules exige una permutación exacta del sitio y renumera order", async () => {
    const store = await open();
    for (const name of ["a", "b", "c"]) await store.save(draft({ name }), SITE);
    const ids = store.forSite(SITE).map((r) => r.id);
    const [a, b, c] = ids as [string, string, string];
    expect(await store.reorder(SITE, [c, a, b])).toEqual({ ok: true });
    expect(store.forSite(SITE).map((r) => [r.name, r.order])).toEqual([
      ["c", 0],
      ["a", 1],
      ["b", 2],
    ]);
    expect(await store.reorder(SITE, [a, b])).toEqual({ ok: false, code: "unknown_rule" });
    expect(await store.reorder(SITE, [a, b, RULE_ID2])).toEqual({
      ok: false,
      code: "unknown_rule",
    });
    expect(
      stored()
        .map((r) => r.order)
        .sort(),
    ).toEqual([0, 1, 2]);
  });
});

describe("RuleStore: hooks (006, FR-016, FR-034, research R10)", () => {
  const hookDraft = (source: string, ok = true, enabled = true) =>
    draft({
      enabled,
      stage: "request",
      conditions: [],
      action: {
        kind: "hook",
        source,
        imported: false,
        permissions: { changeDestination: false, readSensitive: false },
        check: { hash: hashSource(source), ok },
      },
    }) as unknown as Record<string, unknown>;

  it("guarda un hook comprobado y activo", async () => {
    const store = await open();
    expect(await store.save(hookDraft("export default (c) => c;"), SITE)).toEqual({ ok: true });
    expect(store.all()[0]?.action).toMatchObject({ kind: "hook", imported: false });
  });

  it("activo sin check válido o con el hash de otro código ⇒ hook_error_not_checked; desactivado se guarda", async () => {
    const store = await open();
    expect(await store.save(hookDraft("x", false), SITE)).toMatchObject({
      ok: false,
      code: "rule_invalid",
      issues: [{ path: "enabled", messageKey: "hook_error_not_checked" }],
    });
    const stale = hookDraft("y");
    (stale.action as { check: { hash: string } }).check.hash = hashSource("otro");
    expect(await store.save(stale, SITE)).toMatchObject({ ok: false, code: "rule_invalid" });
    expect(await store.save(hookDraft("x", false, false), SITE)).toEqual({ ok: true });
    const id = store.all()[0]?.id ?? "";
    expect(await store.setEnabled(id, true)).toMatchObject({
      ok: false,
      issues: [{ messageKey: "hook_error_not_checked" }],
    });
    expect(store.all()[0]?.enabled).toBe(false);
  });

  it("más de 5 MB entre todos los hooks ⇒ hook_error_total_size sin cambiar lo guardado", async () => {
    const store = await open();
    const big = "x".repeat(100 * 1024);
    for (let i = 0; i < 51; i++) {
      expect(await store.save(hookDraft(`// ${i}\n${big}`.slice(0, 100 * 1024)), SITE)).toEqual({
        ok: true,
      });
    }
    const before = stored().length;
    expect(await store.save(hookDraft(big), SITE)).toMatchObject({
      ok: false,
      code: "rule_invalid",
      issues: [{ path: "action.source", messageKey: "hook_error_total_size" }],
    });
    expect(stored()).toHaveLength(before);
  }, 20_000);
});

describe("RuleStore: importar un hook (006, FR-036, FR-037)", () => {
  const config = {
    name: "Importado",
    stage: "response",
    prefilter: { kind: "glob", pattern: "*/api/*" },
    resourceTypes: ["Fetch"],
    conditions: [],
  };

  it("crea siempre una regla nueva, desactivada, importada, sin permisos y sin comprobar", async () => {
    const store = await open();
    expect(
      await store.importHook({ config, source: "export default (c) => c;" }, SITE, "Hook"),
    ).toEqual({ ok: true });
    const [rule] = store.all();
    expect(rule).toMatchObject({
      name: "Importado",
      site: SITE,
      enabled: false,
      stage: "response",
      prefilter: { kind: "glob", pattern: "*/api/*" },
      action: {
        kind: "hook",
        imported: true,
        permissions: { changeDestination: false, readSensitive: false },
        check: { ok: false },
      },
    });
  });

  it("sin configuración: nombre por defecto y prefiltro de todo el sitio, para configurarla", async () => {
    const store = await open();
    expect(await store.importHook({ config: null, source: "x" }, SITE, "Hook importado")).toEqual({
      ok: true,
    });
    expect(store.all()[0]).toMatchObject({
      name: "Hook importado",
      enabled: false,
      stage: "request",
    });
  });

  it("configuración inválida, código de más de 100 KB o sin sitio ⇒ error sin escribir nada", async () => {
    const store = await open();
    expect(
      await store.importHook({ config: { ...config, stage: "otra" }, source: "x" }, SITE, "H"),
    ).toMatchObject({
      ok: false,
      code: "rule_invalid",
    });
    expect(
      await store.importHook({ config, source: "x".repeat(102_401) }, SITE, "H"),
    ).toMatchObject({ ok: false, code: "rule_invalid" });
    expect(await store.importHook({ config, source: "x" }, null, "H")).toMatchObject({
      ok: false,
      code: "no_site",
    });
    expect(stored()).toEqual([]);
  });
});

describe("RuleStore: perfiles (007, FR-019, research R13)", () => {
  const P = "0b8f8a52-4a0c-4d0e-9f3a-6c1d2e3f4a5b";
  const OTHER = "1c9f8a52-4a0c-4d0e-9f3a-6c1d2e3f4a5b";

  async function openWithProfiles() {
    const store = createRuleStore({
      storage,
      onChange: () => void changes++,
      onNotice: (key) => void notices.push(key),
      profileIdsOf: (site) => new Set(site === SITE ? [P] : [OTHER]),
    });
    await store.ready;
    return store;
  }

  it("editar una regla sin mandar profileIds conserva sus perfiles e importedFrom", async () => {
    storage.data.set(RULES_KEY, {
      version: 1,
      rules: [rule({ profileIds: [P], importedFrom: "requestly" })],
    });
    const store = await openWithProfiles();
    const withoutProfiles = Object.fromEntries(
      Object.entries(draft({ name: "Editada" })).filter(([key]) => key !== "profileIds"),
    );
    expect(await store.save({ id: RULE_ID, ...withoutProfiles }, SITE)).toEqual({ ok: true });
    expect(store.all()[0]).toMatchObject({
      name: "Editada",
      profileIds: [P],
      importedFrom: "requestly",
    });
  });

  it("rechaza perfiles que no son del sitio de la regla", async () => {
    const store = await openWithProfiles();
    expect(await store.save(draft({ profileIds: [OTHER] }), SITE)).toEqual({
      ok: false,
      code: "rule_invalid",
      issues: [{ path: "profileIds", messageKey: "profile_not_found" }],
    });
    expect(await store.save(draft({ profileIds: [P] }), SITE)).toEqual({ ok: true });
  });

  it("setProfiles cambia solo la pertenencia y valida sitio y límite", async () => {
    storage.data.set(RULES_KEY, { version: 1, rules: [rule()] });
    const store = await openWithProfiles();
    expect(await store.setProfiles(RULE_ID, [P])).toEqual({ ok: true });
    expect(store.all()[0]?.profileIds).toEqual([P]);
    expect((await store.setProfiles(RULE_ID, [OTHER])).ok).toBe(false);
    expect(await store.setProfiles(RULE_ID2, [P])).toEqual({ ok: false, code: "unknown_rule" });
  });

  it("transaction escribe reglas y otras claves en una sola llamada; sin reglas nuevas no las reescribe", async () => {
    storage.data.set(RULES_KEY, { version: 1, rules: [rule({ profileIds: [P] })] });
    const store = await openWithProfiles();
    const set = vi.spyOn(storage, "set");
    const result = await store.transaction((current) => ({
      rules: current.map((r) => ({ ...r, profileIds: [] })),
      extra: { "nahual.profiles.v1": { version: 1, profiles: [], lastActive: {} } },
    }));
    expect(result).toEqual({ ok: true });
    expect(set).toHaveBeenCalledTimes(1);
    expect(Object.keys(set.mock.calls[0]?.[0] ?? {}).sort()).toEqual([
      "nahual.profiles.v1",
      RULES_KEY,
    ]);
    expect(store.all()[0]?.profileIds).toEqual([]);
    const before = changes;
    await store.transaction(() => ({ extra: { other: 1 } }));
    expect(Object.keys(set.mock.calls[1]?.[0] ?? {})).toEqual(["other"]);
    expect(changes).toBe(before);
  });

  it("si la escritura falla por cuota, ni las reglas ni lo demás cambian", async () => {
    storage.data.set(RULES_KEY, { version: 1, rules: [rule({ profileIds: [P] })] });
    const store = await openWithProfiles();
    storage.failWritesWithQuota();
    const after = vi.fn();
    expect(await store.transaction(() => ({ rules: [], extra: { x: 1 }, after }))).toEqual({
      ok: false,
      code: "storage_quota",
    });
    expect(store.all()).toHaveLength(1);
    expect(after).not.toHaveBeenCalled();
  });
});
