import { z } from "zod";
import { HeaderSchema, StageSchema } from "./common.ts";
import { LIMITS } from "./limits.ts";
import { CorsDiagnosisSchema, CorsRelaxedInfoSchema } from "../cors/schemas.ts";

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
  /** En un preflight: id del intercambio del request real (`initiator.requestId`, research R6). */
  preflightFor: z.string().max(256).optional(),
  /** Origen del frame que hizo el request (003, research R4). */
  appOrigin: z.string().max(LIMITS.originMax).nullable().optional(),
});
export type ExchangeFields = z.infer<typeof ExchangeFieldsSchema>;

/** Información CORS de un intercambio (003): diagnóstico del bloqueo y lo que cambió la relajación. */
export const ExchangeCorsSchema = z.strictObject({
  diagnosis: CorsDiagnosisSchema.optional(),
  relaxed: CorsRelaxedInfoSchema.optional(),
});
export type ExchangeCors = z.infer<typeof ExchangeCorsSchema>;

export const CapturedExchangeSchema = ExchangeFieldsSchema.extend({
  id: z.string().min(1).max(256),
  ruleEffects: z.array(RuleEffectSchema).max(4),
  cors: ExchangeCorsSchema.optional(),
});
export type CapturedExchange = z.infer<typeof CapturedExchangeSchema>;

export const ExchangeUpdateSchema = z.strictObject({
  id: z.string().min(1).max(256),
  kind: z.enum(["start", "response", "headers", "finish", "fail", "effect", "cors"]),
  fields: ExchangeFieldsSchema.partial(),
  effect: RuleEffectSchema.optional(),
  cors: ExchangeCorsSchema.optional(),
});
export type ExchangeUpdate = z.infer<typeof ExchangeUpdateSchema>;
