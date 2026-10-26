import { compileJsonPath } from "../jsonpath.ts";
import { LIMITS, utf8Bytes } from "../schemas/limits.ts";
import type { Profile } from "../schemas/profile.ts";
import type { Rule } from "../schemas/rule.ts";
import { migrateConfig } from "./migrate.ts";
import { PortableConfigV1Schema, type PortableConfigV1 } from "./schema.ts";

/** Lo que ya hay en el navegador: los límites se comprueban sumando lo importado (FR-029). */
export interface ExistingConfig {
  rules: readonly Rule[];
  profiles: readonly Profile[];
  productionOrigins: readonly string[];
}

export interface ImportPreview {
  sites: {
    site: string;
    rules: number;
    profiles: number;
    hooks: number;
    renamedProfiles: string[];
  }[];
  productionOrigins: { new: string[]; existing: string[] };
  /** Nombres de las reglas con valores redactados: entran pero no se activan (FR-028). */
  redactedRules: string[];
}

export type ParseResult =
  | { ok: true; config: PortableConfigV1; migratedFrom: number | null; preview: ImportPreview }
  | {
      ok: false;
      errorKey:
        | "config_error_too_large"
        | "config_error_not_json"
        | "config_error_not_nahual"
        | "config_error_newer_version"
        | "config_error_invalid"
        | "config_error_limit";
      path?: string;
      params?: string[];
    };

const invalid = (path: string): ParseResult => ({
  ok: false,
  errorKey: "config_error_invalid",
  path,
});

/** Coherencia que el schema no ve: perfiles del sitio, nombres y órdenes únicos, JSONPath. */
function coherence(config: PortableConfigV1): ParseResult | null {
  for (const [s, site] of config.sites.entries()) {
    const names = new Set<string>();
    for (const [p, profile] of site.profiles.entries()) {
      const name = profile.name.toLocaleLowerCase();
      if (names.has(name)) return invalid(`sites.${s}.profiles.${p}.name`);
      names.add(name);
    }
    const ids = new Set(site.profiles.map((p) => p.id));
    const orders = new Set<number>();
    for (const [r, rule] of site.rules.entries()) {
      if (rule.profileIds.some((id) => !ids.has(id)))
        return invalid(`sites.${s}.rules.${r}.profileIds`);
      if (orders.has(rule.order)) return invalid(`sites.${s}.rules.${r}.order`);
      orders.add(rule.order);
      for (const [c, condition] of rule.conditions.entries())
        if (condition.kind === "jsonPath" && !compileJsonPath(condition.path).ok)
          return invalid(`sites.${s}.rules.${r}.conditions.${c}.path`);
    }
  }
  return null;
}

const hookBytes = (sources: string[]) => sources.reduce((n, s) => n + utf8Bytes(s), 0);

/** Límites de 002, 003, 006 y 007 sumando lo que ya hay (FR-029). */
function limits(config: PortableConfigV1, existing: ExistingConfig): ParseResult | null {
  const rules = config.sites.flatMap((s) => s.rules);
  const fail = (key: string, actual: number, resulting: number, limit: number): ParseResult => ({
    ok: false,
    errorKey: "config_error_limit",
    params: [key, String(actual), String(resulting), String(limit)],
  });
  if (existing.rules.length + rules.length > LIMITS.rulesMax)
    return fail(
      "rules",
      existing.rules.length,
      existing.rules.length + rules.length,
      LIMITS.rulesMax,
    );
  const hooksNow = hookBytes(
    existing.rules.flatMap((r) => (r.action.kind === "hook" ? [r.action.source] : [])),
  );
  const hooksAdded = hookBytes(
    rules.flatMap((r) => (r.action.kind === "hook" ? [r.action.source] : [])),
  );
  if (hooksNow + hooksAdded > LIMITS.hookTotalBytesMax)
    return fail("hookBytes", hooksNow, hooksNow + hooksAdded, LIMITS.hookTotalBytesMax);
  for (const site of config.sites) {
    const now = existing.profiles.filter((p) => p.site === site.site).length;
    if (now + site.profiles.length > LIMITS.profilesPerSiteMax)
      return fail("profiles", now, now + site.profiles.length, LIMITS.profilesPerSiteMax);
  }
  const origins = new Set([...existing.productionOrigins, ...config.productionOrigins]);
  if (origins.size > LIMITS.productionOriginsMax)
    return fail(
      "productionOrigins",
      existing.productionOrigins.length,
      origins.size,
      LIMITS.productionOriginsMax,
    );
  return null;
}

/** Vista previa: qué se añade, qué perfiles se renombran y qué orígenes ya estaban. */
export function buildPreview(
  config: PortableConfigV1,
  existing: ExistingConfig,
  renamed: (name: string) => string = (name) => `${name} (imported)`,
): ImportPreview {
  const known = new Set(existing.productionOrigins);
  return {
    sites: config.sites
      .map((site) => {
        const taken = new Set(
          existing.profiles
            .filter((p) => p.site === site.site)
            .map((p) => p.name.toLocaleLowerCase()),
        );
        return {
          site: site.site,
          rules: site.rules.length,
          profiles: site.profiles.length,
          hooks: site.rules.filter((r) => r.action.kind === "hook").length,
          renamedProfiles: site.profiles
            .filter((p) => taken.has(p.name.toLocaleLowerCase()))
            .map((p) => renamed(p.name)),
        };
      })
      .sort((a, b) => (a.site < b.site ? -1 : a.site > b.site ? 1 : 0)),
    productionOrigins: {
      new: config.productionOrigins.filter((o) => !known.has(o)),
      existing: config.productionOrigins.filter((o) => known.has(o)),
    },
    redactedRules: config.sites.flatMap((s) =>
      s.rules.filter((r) => config.redacted.rules.includes(r.id)).map((r) => r.name),
    ),
  };
}

/**
 * Valida un archivo de configuración entero antes de aplicar nada (007, FR-029, FR-033,
 * contracts/portable-config.md): tamaño, JSON, formato, versión con migraciones, schema,
 * coherencia y límites sumados. El primer fallo rechaza el archivo con su causa.
 */
export function parseConfig(
  text: string,
  existing: ExistingConfig,
  renamed?: (name: string) => string,
): ParseResult {
  if (utf8Bytes(text) > LIMITS.importFileBytesMax)
    return { ok: false, errorKey: "config_error_too_large" };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, errorKey: "config_error_not_json" };
  }
  return parseConfigObject(raw, existing, renamed);
}

/** Lo mismo sobre un valor ya parseado: el SW revalida lo que le manda el panel (research R10). */
export function parseConfigObject(
  raw: unknown,
  existing: ExistingConfig,
  renamed?: (name: string) => string,
): ParseResult {
  if (
    typeof raw !== "object" ||
    raw === null ||
    Array.isArray(raw) ||
    (raw as { nahual?: unknown }).nahual !== "config"
  )
    return { ok: false, errorKey: "config_error_not_nahual" };
  const migrated = migrateConfig(raw as Record<string, unknown>);
  if (!migrated.ok) return { ok: false, errorKey: migrated.errorKey, path: migrated.path };
  const parsed = PortableConfigV1Schema.safeParse(migrated.value);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const keys = issue?.code === "unrecognized_keys" ? issue.keys : [];
    const path = [...(issue?.path ?? []), ...keys.slice(0, 1)].join(".");
    return invalid(path);
  }
  const config = parsed.data;
  return (
    coherence(config) ??
    limits(config, existing) ?? {
      ok: true,
      config,
      migratedFrom: migrated.migratedFrom,
      preview: buildPreview(config, existing, renamed),
    }
  );
}
