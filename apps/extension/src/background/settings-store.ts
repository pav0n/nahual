import {
  DEFAULT_SETTINGS,
  SettingsSchema,
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
  update(patch: SettingsPatch): Promise<CommandResult>;
}

export interface SettingsStoreOptions {
  storage: LocalStorageLike;
  onChange(settings: Settings): void;
  onNotice(messageKey: string): void;
}

/** Ajustes en `chrome.storage.local` (contracts/storage.md). Solo el SW escribe. */
export function createSettingsStore(options: SettingsStoreOptions): SettingsStore {
  const { storage } = options;
  let current: Settings = { ...DEFAULT_SETTINGS };
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
    const { settings, invalidFields } = parseSettings(root.settings);
    current = settings;
    if (invalidFields.length > 0) options.onNotice("notice_settings_reset");
  };

  const ready = storage.get(SETTINGS_KEY).then((items) => load(items[SETTINGS_KEY]));

  storage.onChanged((changes) => {
    const change = changes[SETTINGS_KEY];
    if (!change) return;
    load(change.newValue);
    options.onChange(current);
  });

  return {
    ready,
    get: () => current,
    update(patch) {
      const result = writes.then(async (): Promise<CommandResult> => {
        const next = SettingsSchema.safeParse({ ...current, ...patch });
        if (!next.success) return { ok: false, code: "settings_invalid" };
        try {
          await storage.set({ [SETTINGS_KEY]: { version: VERSION, settings: next.data } });
        } catch (error) {
          return { ok: false, code: isQuotaError(error) ? "storage_quota" : "cdp_error" };
        }
        // `onChanged` ya actualizó `current` con lo escrito; se asegura por si no llega.
        current = next.data;
        return { ok: true };
      });
      writes = result.then(() => {});
      return result;
    },
  };
}
