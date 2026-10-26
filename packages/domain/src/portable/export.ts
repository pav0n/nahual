import { isSensitiveHeader, isSensitiveName, redactValue } from "../sensitive.ts";
import type { Profile } from "../schemas/profile.ts";
import type { Rule } from "../schemas/rule.ts";
import type { Settings } from "../schemas/settings.ts";
import { CONFIG_VERSION } from "./migrate.ts";
import type { PortableAction, PortableConfigV1, PortableRule } from "./schema.ts";

/** Marcador de un valor redactado en la configuración (research R3, FR-028). */
export const REDACTED_CONFIG = "<nahual:redacted>";

export interface ExportConfigOptions {
  appVersion: string;
  /** Confirmado por el dev; vale solo para esa exportación (FR-011, FR-028). */
  includeSensitive: boolean;
  now: number;
}

/** Copia de la regla para el archivo, con lo sensible redactado; cuenta lo que redactó. */
function portableRule(rule: Rule, redact: boolean): { rule: PortableRule; redacted: number } {
  let redacted = 0;
  const mark = () => {
    redacted += 1;
    return REDACTED_CONFIG;
  };
  const conditions = rule.conditions.map((c) =>
    redact &&
    (c.kind === "header" || c.kind === "query") &&
    c.value !== undefined &&
    isSensitiveName(c.name)
      ? { ...c, value: mark() }
      : c,
  );
  let action: PortableAction;
  if (rule.action.kind === "hook") action = { kind: "hook", source: rule.action.source };
  else if (rule.action.kind === "mock" && redact) {
    const headers = rule.action.headers.map((h) =>
      isSensitiveHeader(h.name) ? { ...h, value: mark() } : h,
    );
    let body = rule.action.body;
    if (rule.action.bodyEncoding === "text") {
      try {
        const r = redactValue(JSON.parse(body), mark);
        if (r.changed) body = JSON.stringify(r.value);
      } catch {
        // Body que no es JSON: se exporta tal cual (como en los exportadores de código).
      }
    }
    action = { ...rule.action, headers, body };
  } else action = rule.action;
  return {
    rule: {
      id: rule.id,
      order: rule.order,
      name: rule.name,
      enabled: rule.enabled,
      prefilter: rule.prefilter,
      methods: rule.methods,
      resourceTypes: rule.resourceTypes,
      stage: rule.stage,
      conditions,
      profileIds: rule.profileIds,
      action,
    },
    redacted,
  };
}

/**
 * Configuración portable (007, FR-026 a FR-028, contracts/portable-config.md): reglas de todos los
 * sitios con sus hooks (sin permisos), perfiles y orígenes de producción. Nada más viaja.
 */
export function exportConfig(
  rules: readonly Rule[],
  profiles: readonly Profile[],
  settings: Pick<Settings, "productionOrigins">,
  options: ExportConfigOptions,
): { config: PortableConfigV1; text: string } {
  const redact = !options.includeSensitive;
  const sites = [...new Set([...rules.map((r) => r.site), ...profiles.map((p) => p.site)])].sort();
  const redactedRules: string[] = [];
  let count = 0;
  const config: PortableConfigV1 = {
    nahual: "config",
    version: CONFIG_VERSION,
    app: options.appVersion,
    exportedAt: new Date(options.now).toISOString(),
    redacted: { count: 0, rules: [] },
    productionOrigins: [...settings.productionOrigins],
    sites: sites.map((site) => ({
      site,
      profiles: profiles
        .filter((p) => p.site === site)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((p) => ({ id: p.id, name: p.name })),
      rules: rules
        .filter((r) => r.site === site)
        .sort((a, b) => a.order - b.order)
        .map((r) => {
          const out = portableRule(r, redact);
          if (out.redacted > 0) {
            count += out.redacted;
            redactedRules.push(r.id);
          }
          return out.rule;
        }),
    })),
  };
  config.redacted = { count, rules: redactedRules };
  return { config, text: `${JSON.stringify(config, null, 2)}\n` };
}

/** Lo que muestra Ajustes ⇒ Importar y exportar antes de descargar. */
export function exportSummary(config: PortableConfigV1) {
  const rules = config.sites.flatMap((s) => s.rules);
  return {
    rules: rules.length,
    sites: config.sites.filter((s) => s.rules.length > 0).length,
    hooks: rules.filter((r) => r.action.kind === "hook").length,
    profiles: config.sites.reduce((n, s) => n + s.profiles.length, 0),
    origins: config.productionOrigins.length,
  };
}

/** ¿La regla importada conserva algún valor redactado? No se activa hasta completarlo (FR-028). */
export const hasRedactedValue = (rule: Rule) => JSON.stringify(rule).includes(REDACTED_CONFIG);
