import { z } from "zod";
import { HeaderSchema, StageSchema } from "./common.ts";
import { LIMITS } from "./limits.ts";

/** Por qué un body no se muestra o no se evalúa (FR-004, FR-012). */
export const BODY_UNAVAILABLE_REASONS = [
  "none",
  "redirect",
  "binary",
  "tooLarge",
  "evicted",
  "pending",
  "unknown",
] as const;

export const BodyInfoSchema = z.strictObject({
  available: z.boolean(),
  size: z.int().min(0).nullable(),
  reason: z.enum(BODY_UNAVAILABLE_REASONS).optional(),
});
export type BodyInfo = z.infer<typeof BodyInfoSchema>;

/** Resultado de una regla sobre un intercambio (data-model.md, RuleEffect). */
export const RULE_RESULTS = [
  "paused",
  "continued",
  "modified",
  "mocked",
  "failed",
  "aborted",
  "delayed",
  "logged",
  "timed_out",
  "discarded_navigation",
  "continued_on_detach",
  "queue_full",
  "unevaluable",
  "apply_failed",
] as const;
export const RuleResultSchema = z.enum(RULE_RESULTS);
export type RuleResult = z.infer<typeof RuleResultSchema>;

export const UNEVALUABLE_REASONS = [
  "no_body",
  "binary",
  "too_large",
  "invalid_json",
  "not_graphql",
] as const;
export type UnevaluableReason = (typeof UNEVALUABLE_REASONS)[number];

export const RuleEffectSchema = z.strictObject({
  stage: StageSchema,
  ruleId: z.uuid(),
  ruleName: z.string().max(LIMITS.ruleNameMax),
  result: RuleResultSchema,
  reason: z.enum(UNEVALUABLE_REASONS).optional(),
  errorKey: z.string().min(1).max(128).optional(),
});
export type RuleEffect = z.infer<typeof RuleEffectSchema>;

export const EXCHANGE_STATES = ["pending", "complete", "failed"] as const;

/** Campos de un intercambio capturado; viajan por partes en `ExchangeUpdate`. */
export const ExchangeFieldsSchema = z.strictObject({
  seq: z.int().min(0),
  method: z.string().min(1).max(64),
  url: z.string().max(LIMITS.urlMax + 1),
  /** La URL original era más larga y se recortó para mostrarla. */
  urlTruncated: z.boolean(),
  resourceType: z.string().max(64),
  isPreflight: z.boolean(),
  requestHeaders: z.array(HeaderSchema).max(500),
  responseHeaders: z.array(HeaderSchema).max(500),
  status: z.int().min(0).max(999).nullable(),
  state: z.enum(EXCHANGE_STATES),
  errorText: z.string().max(256).optional(),
  encodedSize: z.int().min(0).nullable(),
  decodedSize: z.int().min(0).nullable(),
  startedAt: z.number(),
  durationMs: z.number().min(0).nullable(),
  mimeType: z.string().max(256).nullable(),
  requestBody: BodyInfoSchema,
  responseBody: BodyInfoSchema,
});
export type ExchangeFields = z.infer<typeof ExchangeFieldsSchema>;

export const CapturedExchangeSchema = ExchangeFieldsSchema.extend({
  id: z.string().min(1).max(256),
  ruleEffects: z.array(RuleEffectSchema).max(4),
});
export type CapturedExchange = z.infer<typeof CapturedExchangeSchema>;

export const ExchangeUpdateSchema = z.strictObject({
  id: z.string().min(1).max(256),
  kind: z.enum(["start", "response", "headers", "finish", "fail", "effect"]),
  fields: ExchangeFieldsSchema.partial(),
  effect: RuleEffectSchema.optional(),
});
export type ExchangeUpdate = z.infer<typeof ExchangeUpdateSchema>;
