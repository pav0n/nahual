import { z } from "zod";
import { ProductionOriginEntrySchema, parseProductionEntry } from "../cors/origin.ts";
import { RelaxationDurationSchema } from "../cors/schemas.ts";
import { uniqueArray } from "./common.ts";
import { LIMITS } from "./limits.ts";

const SHAPE = {
  pauseTimeoutSeconds: z.int().min(LIMITS.pauseTimeoutMin).max(LIMITS.pauseTimeoutMax),
  globalPaused: z.boolean(),
  onboardingSeen: z.boolean(),
  attachConsent: z.boolean(),
  autoAttach: z.boolean(),
  /** Duración preseleccionada de una relajación CORS (FR-015). */
  corsDefaultDurationMinutes: RelaxationDurationSchema,
  /** Orígenes donde nunca se relaja CORS (FR-028), normalizados. */
  productionOrigins: uniqueArray(ProductionOriginEntrySchema, LIMITS.productionOriginsMax),
};

export const SettingsSchema = z.strictObject(SHAPE);
export type Settings = z.infer<typeof SettingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
  pauseTimeoutSeconds: LIMITS.pauseTimeoutDefault,
  globalPaused: false,
  onboardingSeen: false,
  attachConsent: false,
  autoAttach: true,
  corsDefaultDurationMinutes: 480,
  productionOrigins: [],
};

/** Cambio parcial que manda el panel (`updateSettings`). */
export const SettingsPatchSchema = SettingsSchema.partial();
export type SettingsPatch = z.infer<typeof SettingsPatchSchema>;

/**
 * Lee la lista de producción entrada por entrada: conserva las válidas y avisa si alguna no lo
 * era. Con `invalid`, el SW no permite relajar hasta que el dev guarde la lista (falla cerrada,
 * research R12).
 */
export function parseProductionOrigins(raw: unknown): { entries: string[]; invalid: boolean } {
  if (raw === undefined) return { entries: [], invalid: false };
  if (!Array.isArray(raw)) return { entries: [], invalid: true };
  const entries: string[] = [];
  let invalid = raw.length > LIMITS.productionOriginsMax;
  for (const item of raw.slice(0, LIMITS.productionOriginsMax)) {
    const entry = typeof item === "string" ? parseProductionEntry(item) : null;
    if (entry === null || entry !== item || entries.includes(entry)) invalid = true;
    else entries.push(entry);
  }
  return { entries, invalid };
}

export interface ParsedSettings {
  settings: Settings;
  invalidFields: string[];
  /** La lista de producción guardada tenía entradas inválidas (research R12). */
  productionOriginsInvalid: boolean;
}

/**
 * Lee ajustes guardados campo a campo: un campo inválido toma su valor por defecto sin perder
 * los demás (data-model.md). `invalidFields` dice cuáles; `"*"` si el objeto entero no sirve.
 */
export function parseSettings(raw: unknown): ParsedSettings {
  if (raw === undefined)
    return {
      settings: { ...DEFAULT_SETTINGS },
      invalidFields: [],
      productionOriginsInvalid: false,
    };
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return {
      settings: { ...DEFAULT_SETTINGS },
      invalidFields: ["*"],
      productionOriginsInvalid: false,
    };
  }
  const source = raw as Record<string, unknown>;
  const settings: Record<string, unknown> = {};
  const invalidFields: string[] = [];
  const production = parseProductionOrigins(source.productionOrigins);
  for (const [key, schema] of Object.entries(SHAPE)) {
    if (key === "productionOrigins") {
      settings[key] = production.entries;
      continue;
    }
    const parsed = schema.safeParse(source[key]);
    if (parsed.success) settings[key] = parsed.data;
    else {
      settings[key] = DEFAULT_SETTINGS[key as keyof Settings];
      if (key in source) invalidFields.push(key);
    }
  }
  return {
    settings: settings as Settings,
    invalidFields,
    productionOriginsInvalid: production.invalid,
  };
}
