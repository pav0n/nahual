import { describe, expect, it } from "vitest";
import { applyImport } from "../../src/portable/apply.ts";
import { REDACTED_CONFIG, exportConfig, exportSummary } from "../../src/portable/export.ts";
import { CONFIG_VERSION, migrateConfig } from "../../src/portable/migrate.ts";
import { parseConfig } from "../../src/portable/parse.ts";
import { PortableConfigV1Schema } from "../../src/portable/schema.ts";
import { DEFAULT_SETTINGS } from "../../src/schemas/settings.ts";
import { SITE } from "../fixtures.ts";
import { nth } from "../export/helpers.ts";
import { OTHER, P1, R1, R2, R3, existingRules, profile } from "./fixtures.ts";

type Mutable = {
  sites: { site: string; rules: Record<string, unknown>[]; profiles: Record<string, unknown>[] }[];
};
const siteOf = (c: Mutable, i: number) => nth(c.sites, i);
const ruleOf = (c: Mutable, i: number, j: number) => nth(siteOf(c, i).rules, j);

// 007 US4 (contracts/portable-config.md, research R9/R10, FR-026 a FR-033).

const settings = { ...DEFAULT_SETTINGS, productionOrigins: ["https://app.example.com"] };
const NOW = Date.UTC(2026, 9, 26, 12);
const exported = (includeSensitive = false) =>
  exportConfig(existingRules(), [profile()], settings, {
    appVersion: "1.0.0",
    includeSensitive,
    now: NOW,
  });
const empty = { rules: [], profiles: [], productionOrigins: [] };

describe("T052 schema v1", () => {
  it("valida la exportación y rechaza claves extra, __proto__ y orígenes inválidos", () => {
    const config = exported().config;
    expect(PortableConfigV1Schema.safeParse(config).success).toBe(true);
    expect(PortableConfigV1Schema.safeParse({ ...config, extra: 1 }).success).toBe(false);
    const proto = JSON.parse(
      JSON.stringify(config).replace('"nahual":"config"', '"__proto__":{"x":1},"nahual":"config"'),
    );
    expect(PortableConfigV1Schema.safeParse(proto).success).toBe(false);
    expect(
      PortableConfigV1Schema.safeParse({ ...config, productionOrigins: ["nope"] }).success,
    ).toBe(false);
    const hook = config.sites.find((s) => s.site === OTHER)?.rules[0];
    expect(hook?.action).toEqual({ kind: "hook", source: "export default (ctx) => ctx;" });
  });
});

describe("T053 migraciones", () => {
  it("v1 pasa intacta; una versión más nueva se rechaza; 0 o no entera, inválida", () => {
    const config = exported().config;
    expect(migrateConfig(config)).toEqual({ ok: true, value: config, migratedFrom: null });
    expect(migrateConfig({ ...config, version: 2 })).toMatchObject({
      ok: false,
      errorKey: "config_error_newer_version",
    });
    expect(migrateConfig({ ...config, version: 0 })).toMatchObject({
      ok: false,
      errorKey: "config_error_invalid",
    });
    expect(migrateConfig({ ...config, version: "1" })).toMatchObject({
      ok: false,
      errorKey: "config_error_invalid",
    });
  });

  it("encadena migraciones e informa de dónde venía", () => {
    const fake = { 1: (raw: Record<string, unknown>) => ({ ...raw, version: 2, migrated: true }) };
    expect(migrateConfig({ nahual: "config", version: 1 }, fake, 2)).toEqual({
      ok: true,
      value: { nahual: "config", version: 2, migrated: true },
      migratedFrom: 1,
    });
    expect(CONFIG_VERSION).toBe(1);
  });
});

describe("T054 exportar", () => {
  it("agrupa por sitio, quita permisos y estado de los hooks y redacta valores sensibles", () => {
    const { config, text } = exported();
    expect(Object.keys(config)).toEqual([
      "nahual",
      "version",
      "app",
      "exportedAt",
      "redacted",
      "productionOrigins",
      "sites",
    ]);
    expect(config.exportedAt).toBe("2026-10-26T12:00:00.000Z");
    expect(config.sites.map((s) => s.site)).toEqual([SITE, OTHER].sort());
    expect(text).not.toMatch(/secret-rule|secret-mock-cookie|secret-mock-token/);
    expect(config.redacted).toEqual({ count: 3, rules: [R1, R2] });
    expect(text).toContain(REDACTED_CONFIG);
    expect(text).not.toContain("permissions");
    expect(text).not.toContain('"check"');
    expect(config.productionOrigins).toEqual(["https://app.example.com"]);
  });

  it("con includeSensitive no redacta nada", () => {
    const { config, text } = exported(true);
    expect(config.redacted).toEqual({ count: 0, rules: [] });
    expect(text).toContain("secret-mock-token");
  });

  it("resumen para la interfaz", () => {
    expect(exportSummary(exported().config)).toEqual({
      rules: 3,
      sites: 2,
      hooks: 1,
      profiles: 1,
      origins: 1,
    });
  });
});

describe("T055 importar: validación completa (SC-007)", () => {
  const text = exported().text;
  const reject = (input: string, existing = empty) => {
    const result = parseConfig(input, existing);
    return result.ok ? "ok" : `${result.errorKey}${result.path ? `@${result.path}` : ""}`;
  };

  it("acepta su propia exportación y prepara la vista previa", () => {
    const result = parseConfig(text, { ...empty, productionOrigins: ["https://app.example.com"] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.preview.sites).toEqual([
      { site: SITE, rules: 2, profiles: 1, hooks: 0, renamedProfiles: [] },
      { site: OTHER, rules: 1, profiles: 0, hooks: 1, renamedProfiles: [] },
    ]);
    expect(result.preview.productionOrigins).toEqual({
      new: [],
      existing: ["https://app.example.com"],
    });
    expect(result.preview.redactedRules).toHaveLength(2);
  });

  it("20 archivos inválidos se rechazan con su causa", () => {
    const config = JSON.parse(text) as Record<string, unknown> & {
      sites: {
        site: string;
        rules: Record<string, unknown>[];
        profiles: Record<string, unknown>[];
      }[];
    };
    const mutate = (fn: (c: typeof config) => void) => {
      const copy = structuredClone(config);
      fn(copy);
      return JSON.stringify(copy);
    };
    const cases: [string, string][] = [
      ["", "config_error_not_json"],
      ["{", "config_error_not_json"],
      ["[]", "config_error_not_nahual"],
      ['"hola"', "config_error_not_nahual"],
      [JSON.stringify({ nahual: "otra" }), "config_error_not_nahual"],
      [text.slice(0, text.length / 2), "config_error_not_json"],
      [mutate((c) => (c.version = 7)), "config_error_newer_version@version"],
      [mutate((c) => (c.version = 0)), "config_error_invalid@version"],
      [mutate((c) => (c.extra = true)), "config_error_invalid@extra"],
      [
        mutate((c) => (c.productionOrigins = ["no es un origen"])),
        "config_error_invalid@productionOrigins.0",
      ],
      [mutate((c) => (siteOf(c, 0).site = "not a site")), "config_error_invalid@sites.0.site"],
      [mutate((c) => (ruleOf(c, 0, 0).name = "")), "config_error_invalid@sites.0.rules.0.name"],
      [
        mutate((c) => (ruleOf(c, 0, 0).stage = "otro")),
        "config_error_invalid@sites.0.rules.0.stage",
      ],
      [
        mutate((c) => (ruleOf(c, 0, 0).action = { kind: "hook" })),
        "config_error_invalid@sites.0.rules.0.action.source",
      ],
      [
        mutate((c) => (ruleOf(c, 1, 0).profileIds = [P1])),
        "config_error_invalid@sites.1.rules.0.profileIds",
      ],
      [
        mutate((c) => siteOf(c, 0).profiles.push({ id: R1, name: "qa STAGING" })),
        "config_error_invalid@sites.0.profiles.1.name",
      ],
      [mutate((c) => (ruleOf(c, 0, 1).order = 0)), "config_error_invalid@sites.0.rules.1.order"],
      [
        mutate(
          (c) => (ruleOf(c, 0, 0).conditions = [{ kind: "jsonPath", path: "$[", op: "exists" }]),
        ),
        "config_error_invalid@sites.0.rules.0.conditions.0.path",
      ],
      [
        mutate((c) => (c.redacted = { count: -1, rules: [] })),
        "config_error_invalid@redacted.count",
      ],
      ["x".repeat(10_485_761), "config_error_too_large"],
    ];
    expect(cases).toHaveLength(20);
    for (const [input, expected] of cases) expect(reject(input), expected).toBe(expected);
  });

  it("límites sumados a lo que ya hay", () => {
    const many = { ...empty, rules: Array.from({ length: 499 }, () => nth(existingRules(), 0)) };
    const result = parseConfig(text, many);
    expect(result).toMatchObject({
      ok: false,
      errorKey: "config_error_limit",
      params: ["rules", "499", "502", "500"],
    });
  });
});

describe("T056 aplicar (ida y vuelta, SC-008)", () => {
  it("reproduce reglas, hooks, perfiles y orígenes, todo desactivado e importado", () => {
    const parsed = parseConfig(exported(true).text, empty);
    if (!parsed.ok) throw new Error(parsed.errorKey);
    let n = 0;
    const result = applyImport(empty, parsed.config, {
      source: "config",
      now: NOW,
      newId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`,
      checkOf: (_id, source) => ({ hash: "ff", ok: source.length > 0 }),
      renamed: (name) => `${name} (imported)`,
    });
    expect(result.rules).toHaveLength(3);
    expect(result.rules.every((r) => !r.enabled && r.importedFrom === "config")).toBe(true);
    const hook = result.rules.find((r) => r.action.kind === "hook");
    expect(hook?.action).toEqual({
      kind: "hook",
      source: "export default (ctx) => ctx;",
      imported: true,
      permissions: { changeDestination: false, readSensitive: false },
      check: { hash: "ff", ok: true },
    });
    const qa = result.profiles.find((p) => p.name === "QA staging");
    expect(
      result.rules.find((r) => r.name === nth(existingRules(), 0).name && r.site === SITE)
        ?.profileIds,
    ).toEqual([qa?.id]);
    expect(result.productionOrigins).toEqual(["https://app.example.com"]);
    expect(result.added.origins).toEqual(["https://app.example.com"]);
    expect(result.rules.map((r) => r.id)).not.toContain(R1);
  });

  it("añade al final del sitio, renombra perfiles repetidos y no quita orígenes", () => {
    const parsed = parseConfig(exported().text, empty);
    if (!parsed.ok) throw new Error(parsed.errorKey);
    let n = 0;
    const existing = {
      rules: existingRules().slice(0, 1),
      profiles: [profile()],
      productionOrigins: ["https://ya.example.com"],
    };
    const result = applyImport(existing, parsed.config, {
      source: "requestly",
      now: NOW,
      newId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`,
      checkOf: () => ({ hash: "0", ok: false }),
      renamed: (name) => `${name} (imported)`,
    });
    expect(result.profiles.map((p) => p.name)).toEqual(["QA staging", "QA staging (imported)"]);
    expect(result.rules.filter((r) => r.site === SITE).map((r) => r.order)).toEqual([0, 1, 2]);
    expect(nth(result.rules, 0).id).toBe(R1);
    expect(result.productionOrigins).toEqual(["https://ya.example.com", "https://app.example.com"]);
    expect(result.rules.filter((r) => r.importedFrom === "requestly")).toHaveLength(3);
    expect(result.added.ruleIds).toHaveLength(3);
    expect(R2 && R3).toBeTruthy();
  });
});
