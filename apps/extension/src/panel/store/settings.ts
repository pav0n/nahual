import type { Settings } from "@nahual/domain";
import type { SliceCreator } from "./types.ts";

export interface SettingsSlice {
  settings: Settings | null;
  setSettings(settings: Settings): void;
}

export const createSettingsSlice: SliceCreator<SettingsSlice> = (set) => ({
  settings: null,
  setSettings: (settings) =>
    set((s) => {
      s.settings = settings;
    }),
});
