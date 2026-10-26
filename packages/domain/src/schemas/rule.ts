import { z } from "zod";
import { ActionSchema } from "./action.ts";
import {
  HttpMethodSchema,
  HTTP_METHODS,
  RESOURCE_TYPES,
  ResourceTypeSchema,
  StageSchema,
  uniqueArray,
} from "./common.ts";
import { CONDITIONS_BY_STAGE, ConditionSchema } from "./condition.ts";
import { LIMITS, RegexSchema } from "./limits.ts";

/** Origen no opaco (`http`/`https`) y exacto: sin ruta, query ni fragmento (FR-014a). */
export function isSiteOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && url.origin === value;
  } catch {
    return false;
  }
}

/** Sitio de una URL de página, o `null` si su origen es opaco (research R9). */
export function siteOf(url: string): string | null {
  try {
    const { origin, protocol } = new URL(url);
    return protocol === "http:" || protocol === "https:" ? origin : null;
  } catch {
    return null;
  }
}

export const SiteSchema = z.string().refine(isSiteOrigin, { error: "rule_error_site" });

export const PrefilterSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("glob"),
    pattern: z
      .string()
      .min(1, { error: "rule_error_required" })
      .max(LIMITS.globMax, { error: "rule_error_too_long" }),
  }),
  z.strictObject({ kind: z.literal("regex"), pattern: RegexSchema }),
]);
export type Prefilter = z.infer<typeof PrefilterSchema>;

/** Cada condición debe ser válida para la etapa de la regla (data-model.md). */
function checkStage(
  rule: { stage: keyof typeof CONDITIONS_BY_STAGE; conditions: { kind: string }[] },
  ctx: z.RefinementCtx,
) {
  const allowed: readonly string[] = CONDITIONS_BY_STAGE[rule.stage];
  rule.conditions.forEach((condition, index) => {
    if (!allowed.includes(condition.kind)) {
      ctx.addIssue({
        code: "custom",
        path: ["conditions", index, "kind"],
        message: "rule_error_condition_stage",
      });
    }
  });
}

const DRAFT_SHAPE = {
  name: z
    .string()
    .trim()
    .min(1, { error: "rule_error_required" })
    .max(LIMITS.ruleNameMax, { error: "rule_error_too_long" }),
  enabled: z.boolean(),
  prefilter: PrefilterSchema,
  methods: uniqueArray(HttpMethodSchema, HTTP_METHODS.length),
  resourceTypes: uniqueArray(ResourceTypeSchema, RESOURCE_TYPES.length),
  stage: StageSchema,
  conditions: z.array(ConditionSchema).max(LIMITS.conditionsMax, { error: "rule_error_too_many" }),
  action: ActionSchema,
};

/** Lo que el dev edita: una regla sin identidad, sitio, posición ni fechas. */
export const RuleDraftSchema = z.strictObject(DRAFT_SHAPE).superRefine(checkStage);
export type RuleDraft = z.infer<typeof RuleDraftSchema>;

export const RuleSchema = z
  .strictObject({
    id: z.uuid(),
    site: SiteSchema,
    order: z.int().min(0),
    createdAt: z.number(),
    updatedAt: z.number(),
    ...DRAFT_SHAPE,
  })
  .superRefine(checkStage);
export type Rule = z.infer<typeof RuleSchema>;

/**
 * Configuración de una regla que viaja en un archivo de hook `.ts` (006,
 * contracts/hook-file.md): sin permisos, sitio, identidad, orden, estado ni acción.
 */
export const HookFileConfigSchema = z
  .strictObject({
    name: DRAFT_SHAPE.name,
    stage: DRAFT_SHAPE.stage,
    prefilter: DRAFT_SHAPE.prefilter,
    methods: DRAFT_SHAPE.methods.default([]),
    resourceTypes: DRAFT_SHAPE.resourceTypes.default([]),
    conditions: DRAFT_SHAPE.conditions.default([]),
  })
  .superRefine(checkStage);
export type HookFileConfig = z.infer<typeof HookFileConfigSchema>;
