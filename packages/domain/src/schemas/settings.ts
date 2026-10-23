import { z } from "zod";
import { LIMITS } from "./limits.ts";

const SHAPE = {
  pauseTimeoutSeconds: z.int().min(LIMITS.pauseTimeoutMin).max(LIMITS.pauseTimeoutMax),
  globalPaused: z.boolean(),
  onboardingSeen: z.boolean(),
  attachConsent: z.boolean(),
  autoAttach: z.boolean(),
};

export const SettingsSchema = z.strictObject(SHAPE);
export type Settings = z.infer<typeof SettingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
  pauseTimeoutSeconds: LIMITS.pauseTimeoutDefault,
  globalPaused: false,
  onboardingSeen: false,
  attachConsent: false,
  autoAttach: true,
};

/** Cambio parcial que manda el panel (`updateSettings`). */
export const SettingsPatchSchema = SettingsSchema.partial();
export type SettingsPatch = z.infer<typeof SettingsPatchSchema>;

/**
 * Lee ajustes guardados campo a campo: un campo inválido toma su valor por defecto sin perder
 * los demás (data-model.md). `invalidFields` dice cuáles; `"*"` si el objeto entero no sirve.
 */
export function parseSettings(raw: unknown): { settings: Settings; invalidFields: string[] } {
  if (raw === undefined) return { settings: { ...DEFAULT_SETTINGS }, invalidFields: [] };
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { settings: { ...DEFAULT_SETTINGS }, invalidFields: ["*"] };
  }
  const source = raw as Record<string, unknown>;
  const settings: Record<string, unknown> = {};
  const invalidFields: string[] = [];
  for (const [key, schema] of Object.entries(SHAPE)) {
    const parsed = schema.safeParse(source[key]);
    if (parsed.success) settings[key] = parsed.data;
    else {
      settings[key] = DEFAULT_SETTINGS[key as keyof Settings];
      if (key in source) invalidFields.push(key);
    }
  }
  return { settings: settings as Settings, invalidFields };
}
