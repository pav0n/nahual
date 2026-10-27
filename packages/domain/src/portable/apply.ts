import type { Profile } from "../schemas/profile.ts";
import type { Rule } from "../schemas/rule.ts";
import type { ExistingConfig } from "./parse.ts";
import type { PortableConfigV1 } from "./schema.ts";

export interface ApplyOptions {
  source: "config" | "requestly";
  now: number;
  newId(): string;
  /** `check` del hook importado (el SW lo da solo si el hash coincide con el código). */
  checkOf(originalRuleId: string, source: string): { hash: string; ok: boolean };
  /** Nombre de un perfil cuyo nombre ya existe en el sitio ("QA (importado)"). */
  renamed(name: string): string;
}

export interface ApplyResult {
  rules: Rule[];
  profiles: Profile[];
  productionOrigins: string[];
  added: { ruleIds: string[]; profileIds: string[]; origins: string[] };
}

/**
 * Aplica una configuración ya validada sobre lo que hay (007, FR-031, FR-032, FR-026a, research
 * R10): ids nuevos, reglas al final de su sitio, todo desactivado y marcado, hooks sin permisos,
 * perfiles repetidos renombrados y orígenes de producción añadidos sin quitar ninguno. Puro: el SW
 * escribe el resultado en una sola llamada.
 */
export function applyImport(
  existing: ExistingConfig,
  config: PortableConfigV1,
  options: ApplyOptions,
): ApplyResult {
  const rules = [...existing.rules];
  const profiles = [...existing.profiles];
  const added: ApplyResult["added"] = { ruleIds: [], profileIds: [], origins: [] };
  for (const site of config.sites) {
    const taken = new Set(
      profiles.filter((p) => p.site === site.site).map((p) => p.name.toLocaleLowerCase()),
    );
    const profileIds = new Map<string, string>();
    for (const profile of site.profiles) {
      const id = options.newId();
      profileIds.set(profile.id, id);
      const name = taken.has(profile.name.toLocaleLowerCase())
        ? options.renamed(profile.name)
        : profile.name;
      taken.add(name.toLocaleLowerCase());
      profiles.push({ id, site: site.site, name, createdAt: options.now, updatedAt: options.now });
      added.profileIds.push(id);
    }
    let order = rules.filter((r) => r.site === site.site).length;
    for (const rule of [...site.rules].sort((a, b) => a.order - b.order)) {
      const id = options.newId();
      const action =
        rule.action.kind === "hook"
          ? {
              kind: "hook" as const,
              source: rule.action.source,
              imported: true,
              permissions: { changeDestination: false, readSensitive: false },
              check: options.checkOf(rule.id, rule.action.source),
            }
          : rule.action;
      rules.push({
        ...rule,
        id,
        site: site.site,
        order: order++,
        enabled: false,
        action,
        profileIds: rule.profileIds.flatMap((p) => {
          const mapped = profileIds.get(p);
          return mapped ? [mapped] : [];
        }),
        importedFrom: options.source,
        createdAt: options.now,
        updatedAt: options.now,
      });
      added.ruleIds.push(id);
    }
  }
  const productionOrigins = [...existing.productionOrigins];
  for (const origin of config.productionOrigins) {
    if (productionOrigins.includes(origin)) continue;
    productionOrigins.push(origin);
    added.origins.push(origin);
  }
  return { rules, profiles, productionOrigins, added };
}
