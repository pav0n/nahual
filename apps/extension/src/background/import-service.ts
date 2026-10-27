import { LIMITS } from "@nahual/domain";
import { applyImport, parseConfigObject } from "@nahual/domain/portable";
import { hashSource } from "@nahual/hook-runtime";
import type { PanelPayload } from "@nahual/protocol";
import type { CommandResult } from "./panel-port.ts";
import { PROFILES_KEY, type ProfileStore } from "./profile-store.ts";
import type { RuleStore } from "./rule-store.ts";
import { SETTINGS_KEY, type SettingsStore } from "./settings-store.ts";

export interface ImportService {
  importConfig(payload: PanelPayload<"importConfig">): Promise<CommandResult>;
  undoImport(importId: string): Promise<CommandResult>;
}

export interface ImportServiceOptions {
  rules: RuleStore;
  profiles: ProfileStore;
  settings: SettingsStore;
  /** Nombre de un perfil que ya existe en el sitio ("QA (importado)"), en el idioma del panel. */
  renamed(name: string): string;
}

/**
 * Importación de la configuración portable y de Requestly en el SW (007, research R10): vuelve a
 * validar lo que manda el panel, aplica con `applyImport` y escribe reglas, perfiles y ajustes en
 * una sola llamada (todo o nada, también si se interrumpe). Deshacer quita lo importado durante
 * 10 s; lo que el dev cambió mientras tanto se conserva.
 */
export function createImportService(options: ImportServiceOptions): ImportService {
  const { rules, profiles, settings } = options;
  const undo = new Map<
    string,
    { ruleIds: string[]; profileIds: string[]; origins: string[]; until: number }
  >();

  const existing = (current = rules.all()) => ({
    rules: current,
    profiles: profiles.all(),
    productionOrigins: settings.get().productionOrigins,
  });

  return {
    importConfig({ importId, config, source, hookChecks }) {
      return rules.transaction((current) => {
        const parsed = parseConfigObject(config, existing(current), options.renamed);
        if (!parsed.ok)
          return {
            ok: false,
            code: parsed.errorKey === "config_error_limit" ? "config_limit" : "config_invalid",
            issues: [{ path: parsed.path ?? "", messageKey: parsed.errorKey }],
          };
        const result = applyImport(existing(current), parsed.config, {
          source,
          now: Date.now(),
          newId: () => crypto.randomUUID(),
          // El análisis del panel vale solo para ese mismo código (006, FR-016).
          checkOf: (id, code) => {
            const hash = hashSource(code);
            const check = hookChecks[id];
            return check && check.hash === hash ? { hash, ok: check.ok } : { hash, ok: false };
          },
          renamed: options.renamed,
        });
        return {
          rules: result.rules,
          extra: {
            [PROFILES_KEY]: profiles.stage({
              profiles: result.profiles,
              lastActive: profiles.lastActive(),
            }),
            [SETTINGS_KEY]: settings.stageProductionOrigins(result.productionOrigins),
          },
          after: () =>
            undo.set(importId, { ...result.added, until: Date.now() + LIMITS.importUndoMs }),
        };
      });
    },

    undoImport(importId) {
      const entry = undo.get(importId);
      undo.delete(importId);
      if (!entry || Date.now() > entry.until)
        return Promise.resolve({ ok: false, code: "undo_expired" });
      const ruleIds = new Set(entry.ruleIds);
      const profileIds = new Set(entry.profileIds);
      const origins = new Set(entry.origins);
      return rules.transaction((current) => ({
        rules: current.filter((r) => !ruleIds.has(r.id)),
        extra: {
          [PROFILES_KEY]: profiles.stage({
            profiles: profiles.all().filter((p) => !profileIds.has(p.id)),
            lastActive: Object.fromEntries(
              Object.entries(profiles.lastActive()).filter(([, id]) => !profileIds.has(id)),
            ),
          }),
          [SETTINGS_KEY]: settings.stageProductionOrigins(
            settings.get().productionOrigins.filter((o) => !origins.has(o)),
          ),
        },
      }));
    },
  };
}
