import type { Rule } from "@nahual/domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RULES_KEY, createRuleStore, type RuleStore } from "../../src/background/rule-store.ts";
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
