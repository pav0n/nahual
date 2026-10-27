import {
  DEFAULT_SETTINGS,
  SettingsSchema,
  parseProductionEntry,
  parseSettings,
  type Settings,
  type SettingsPatch,
} from "@nahual/domain";
import type { CommandResult } from "./panel-port.ts";
import { isQuotaError, type LocalStorageLike } from "./storage-port.ts";

export const SETTINGS_KEY = "nahual.settings.v1";
const VERSION = 1;

export interface SettingsStore {
  /** Se resuelve tras la primera lectura. */
  ready: Promise<void>;
  get(): Settings;
  /**
   * `productionOrigins` llega sin normalizar desde el panel: se normaliza y se valida entrada
   * por entrada (`issues` con el índice).
   */
  update(patch: SettingsUpdate): Promise<CommandResult>;
  /**
   * La lista de producción guardada se leyó entera. Si no, el SW no permite relajar CORS hasta
   * que el dev la guarde de nuevo (falla cerrada, research R12).
   */
  productionListReadable(): boolean;
  /**
   * 007 (research R10): valor de `nahual.settings.v1` con otra lista de producción, para escribirlo
   * en la misma llamada que reglas y perfiles. Lo adopta `onChanged`.
   */
  stageProductionOrigins(origins: readonly string[]): unknown;
}

export type SettingsUpdate = Omit<SettingsPatch, "productionOrigins"> & {
  productionOrigins?: string[] | undefined;
};

export interface SettingsStoreOptions {
  storage: LocalStorageLike;
  onChange(settings: Settings): void;
  onNotice(messageKey: string): void;
}

/** Ajustes en `chrome.storage.local` (contracts/storage.md). Solo el SW escribe. */
export function createSettingsStore(options: SettingsStoreOptions): SettingsStore {
  const { storage } = options;
  let current: Settings = { ...DEFAULT_SETTINGS };
  let productionReadable = true;
  /** Lista tal como está en disco mientras es ilegible: otras escrituras no la "reparan". */
  let rawProduction: unknown = undefined;
  let writes = Promise.resolve();

  const load = (raw: unknown) => {
    if (raw === undefined) {
      current = { ...DEFAULT_SETTINGS };
      return;
    }
    const root = raw as { version?: unknown; settings?: unknown } | null;
    if (typeof root !== "object" || root === null || root.version !== VERSION) {
      current = { ...DEFAULT_SETTINGS };
      options.onNotice("notice_settings_reset");
      return;
    }
    const { settings, invalidFields, productionOriginsInvalid } = parseSettings(root.settings);
    current = settings;
    if (invalidFields.length > 0) options.onNotice("notice_settings_reset");
    if (productionOriginsInvalid) {
      // Se avisa una vez, no en cada relectura tras otras escrituras.
      if (productionReadable) options.onNotice("cors_production_list_invalid");
      productionReadable = false;
      rawProduction = (root.settings as { productionOrigins?: unknown } | null)?.productionOrigins;
    }
  };

  // Un cambio que llega antes que la lectura inicial es más nuevo que ella: no se pisa.
  let changedBeforeRead = false;
  const ready = storage.get(SETTINGS_KEY).then((items) => {
    if (!changedBeforeRead) load(items[SETTINGS_KEY]);
  });

  storage.onChanged((changes) => {
    const change = changes[SETTINGS_KEY];
    if (!change) return;
    changedBeforeRead = true;
    load(change.newValue);
    options.onChange(current);
  });

  return {
    ready,
    get: () => current,
    productionListReadable: () => productionReadable,
    stageProductionOrigins: (origins) => ({
      version: VERSION,
      settings: { ...current, productionOrigins: [...origins] },
    }),
    update(patch) {
      const result = writes.then(async (): Promise<CommandResult> => {
        const candidate: Record<string, unknown> = { ...current, ...patch };
        if (patch.productionOrigins !== undefined) {
          const normalized = patch.productionOrigins.map(parseProductionEntry);
          const issues = normalized.flatMap((entry, index) =>
            entry === null
              ? [{ path: `productionOrigins.${index}`, messageKey: "cors_error_production_entry" }]
              : [],
          );
          if (issues.length > 0) return { ok: false, code: "settings_invalid", issues };
          candidate.productionOrigins = [...new Set(normalized)];
        }
        const next = SettingsSchema.safeParse(candidate);
        if (!next.success) return { ok: false, code: "settings_invalid" };
        const keepRaw = !productionReadable && patch.productionOrigins === undefined;
        const toWrite = keepRaw ? { ...next.data, productionOrigins: rawProduction } : next.data;
        try {
          await storage.set({ [SETTINGS_KEY]: { version: VERSION, settings: toWrite } });
        } catch (error) {
          return { ok: false, code: isQuotaError(error) ? "storage_quota" : "cdp_error" };
        }
        // `onChanged` ya actualizó `current` con lo escrito; se asegura por si no llega.
        current = next.data;
        if (patch.productionOrigins !== undefined) {
          productionReadable = true;
          rawProduction = undefined;
        }
        return { ok: true };
      });
      writes = result.then(() => {});
      return result;
    },
  };
}
