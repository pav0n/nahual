import type { Settings, SettingsPatch } from "@nahual/domain";
import type { SliceCreator } from "./types.ts";

export interface SettingsSlice {
  settings: Settings | null;
  setSettings(settings: Settings): void;
  /** Cambio optimista mientras el SW confirma; el siguiente evento `settings` manda. */
  patchSettingsLocal(patch: SettingsPatch): void;
}

export const createSettingsSlice: SliceCreator<SettingsSlice> = (set) => ({
  settings: null,
  setSettings: (settings) =>
    set((s) => {
      s.settings = settings;
    }),
  patchSettingsLocal: (patch) =>
    set((s) => {
      if (s.settings) Object.assign(s.settings, patch);
    }),
});
