import { z } from "zod";
import { ProductionOriginEntrySchema } from "../cors/origin.ts";
import {
  DelayActionSchema,
  FailActionSchema,
  LogActionSchema,
  MockActionSchema,
  PauseActionSchema,
} from "../schemas/action.ts";
import { uniqueArray } from "../schemas/common.ts";
import { LIMITS, utf8Bytes } from "../schemas/limits.ts";
import { ProfileSchema } from "../schemas/profile.ts";
import { DRAFT_SHAPE, SiteSchema, checkStage } from "../schemas/rule.ts";

// Configuración portable v1 (007, contracts/portable-config.md). `strictObject` en todo: una clave
// que no se conoce (también `__proto__`) rechaza el archivo.

/** Un hook viaja sin permisos, sin estado de análisis y sin la marca de importado (FR-026). */
const PortableHookSchema = z.strictObject({
  kind: z.literal("hook"),
  source: z.string().refine((s) => utf8Bytes(s) <= LIMITS.hookSourceBytesMax, {
    error: "hook_error_too_large",
  }),
});

export const PortableActionSchema = z.discriminatedUnion("kind", [
  PauseActionSchema,
  MockActionSchema,
  FailActionSchema,
  DelayActionSchema,
  LogActionSchema,
  PortableHookSchema,
]);
export type PortableAction = z.infer<typeof PortableActionSchema>;

export const PortableRuleSchema = z
  .strictObject({
    id: z.uuid(),
    order: z.int().min(0),
    ...DRAFT_SHAPE,
    profileIds: uniqueArray(z.uuid(), LIMITS.profilesPerRuleMax),
    action: PortableActionSchema,
  })
  .superRefine(checkStage);
export type PortableRule = z.infer<typeof PortableRuleSchema>;

export const PortableProfileSchema = z.strictObject({
  id: z.uuid(),
  name: ProfileSchema.shape.name,
});
export type PortableProfile = z.infer<typeof PortableProfileSchema>;

export const PortableConfigV1Schema = z.strictObject({
  nahual: z.literal("config"),
  version: z.literal(1),
  app: z.string().max(64),
  exportedAt: z.string().max(64),
  redacted: z.strictObject({
    count: z.int().min(0),
    rules: z.array(z.uuid()).max(LIMITS.rulesMax),
  }),
  productionOrigins: uniqueArray(ProductionOriginEntrySchema, LIMITS.productionOriginsMax),
  sites: z
    .array(
      z.strictObject({
        site: SiteSchema,
        profiles: z.array(PortableProfileSchema).max(LIMITS.profilesPerSiteMax),
        rules: z.array(PortableRuleSchema).max(LIMITS.rulesMax),
      }),
    )
    .max(LIMITS.rulesMax),
});
export type PortableConfigV1 = z.infer<typeof PortableConfigV1Schema>;

/** Lo que viaja en `importConfig` (data-model "ImportPayload"). */
export interface ImportPayload {
  config: PortableConfigV1;
  source: "config" | "requestly";
  /** `check` de cada hook calculado por el Worker de tipos en la vista previa, por id original. */
  hookChecks: Record<string, { hash: string; ok: boolean }>;
}
