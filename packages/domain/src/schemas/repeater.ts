import { z } from "zod";
import { CorsDiagnosisSchema } from "../cors/schemas.ts";
import { HeaderSchema } from "./common.ts";
import { BodyInfoSchema, RuleEffectSchema } from "./exchange.ts";
import { LIMITS, utf8Bytes } from "./limits.ts";
import { EditHeaderSchema, isAbsoluteHttpUrl } from "./paused.ts";

// Repeater (005, data-model.md). Las pestañas viven solo en memoria del panel (FR-020a); estos
// schemas validan lo que viaja entre panel y SW y lo que el SW recibe para enviar.

const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

export const REPEATER_MODES = ["page", "clean"] as const;
export const RepeaterModeSchema = z.enum(REPEATER_MODES);
export type RepeaterMode = z.infer<typeof RepeaterModeSchema>;

export const RepeaterHeaderSchema = EditHeaderSchema.extend({ enabled: z.boolean() });
export type RepeaterHeader = z.infer<typeof RepeaterHeaderSchema>;

/** Body del editor: nada, texto editable u original no textual reenviado intacto (FR-002a). */
export const RepeaterBodySchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("none"),
    reason: z.enum(["unavailable", "evicted", "tooLarge"]).optional(),
  }),
  z.strictObject({
    kind: z.literal("text"),
    text: z.string().refine((text) => utf8Bytes(text) <= LIMITS.bodyBytes, {
      error: "rule_error_body_too_large",
    }),
  }),
  z.strictObject({
    kind: z.literal("original"),
    base64: z.string().regex(BASE64),
    contentType: z.string().max(256).nullable(),
    size: z.int().min(0).max(LIMITS.bodyBytes, { error: "rule_error_body_too_large" }),
  }),
]);
export type RepeaterBody = z.infer<typeof RepeaterBodySchema>;

export const RepeaterRequestSchema = z.strictObject({
  method: z
    .string()
    .min(1, { error: "rule_error_required" })
    .max(64, { error: "rule_error_too_long" })
    .regex(/^[A-Za-z]+$/, { error: "rule_error_method" }),
  url: z
    .string()
    .max(LIMITS.urlMax, { error: "rule_error_too_long" })
    .refine(isAbsoluteHttpUrl, { error: "rule_error_url" }),
  headers: z
    .array(RepeaterHeaderSchema)
    .max(LIMITS.repeaterHeadersMax, { error: "rule_error_too_many" }),
  body: RepeaterBodySchema,
});
export type RepeaterRequest = z.infer<typeof RepeaterRequestSchema>;

export const RepeaterResponseSchema = z.strictObject({
  status: z.int().min(0).max(999),
  headers: z.array(HeaderSchema).max(500),
  body: z.discriminatedUnion("encoding", [
    z.strictObject({
      encoding: z.literal("text"),
      text: z.string().refine((text) => utf8Bytes(text) <= LIMITS.bodyBytes),
    }),
    z.strictObject({ encoding: z.literal("none"), info: BodyInfoSchema }),
  ]),
  mimeType: z.string().max(256).nullable(),
});
export type RepeaterResponse = z.infer<typeof RepeaterResponseSchema>;

export const REPEATER_ERROR_CODES = [
  "invalid_request",
  "not_attached",
  "context_lost",
  "network",
  "cors_blocked",
  "permission_required",
  "permission_denied",
  "timeout",
  "cancelled",
  "body_too_large",
] as const;
export const RepeaterErrorCodeSchema = z.enum(REPEATER_ERROR_CODES);
export type RepeaterErrorCode = z.infer<typeof RepeaterErrorCodeSchema>;

export const RepeaterErrorSchema = z.strictObject({
  code: RepeaterErrorCodeSchema,
  messageKey: z.string().min(1).max(128),
  params: z.array(z.string().max(512)).max(5).optional(),
});
export type RepeaterError = z.infer<typeof RepeaterErrorSchema>;

export const REPEATER_SEND_STATES = ["pending", "done", "failed", "cancelled"] as const;

/** Resultado de un envío, tal como lo arma el SW (FR-015 a FR-017, FR-010a). */
export const RepeaterOutcomeSchema = z.strictObject({
  response: RepeaterResponseSchema.nullable(),
  error: RepeaterErrorSchema.nullable(),
  durationMs: z.number().min(0).nullable(),
  size: z.int().min(0).nullable(),
  preflight: z.strictObject({ status: z.int().nullable(), blocked: z.boolean() }).nullable(),
  ruleEffects: z.array(RuleEffectSchema).max(4),
  relaxed: z.boolean(),
  cors: CorsDiagnosisSchema.nullable(),
  notSentHeaders: z.array(z.string().max(LIMITS.headerNameMax)).max(LIMITS.repeaterHeadersMax),
  exchangeId: z.string().min(1).max(256).nullable(),
});
export type RepeaterOutcome = z.infer<typeof RepeaterOutcomeSchema>;

/** Un envío del historial de una pestaña. */
export const RepeaterSendSchema = RepeaterOutcomeSchema.extend({
  sendId: z.uuid(),
  request: RepeaterRequestSchema,
  mode: RepeaterModeSchema,
  startedAt: z.number(),
  state: z.enum(REPEATER_SEND_STATES),
});
export type RepeaterSend = z.infer<typeof RepeaterSendSchema>;

/** Segmento de ruta para ignorar: los de `PathSegment` más "cualquier elemento" de un array. */
export const PathPatternSegmentSchema = z.union([
  z.strictObject({ key: z.string().max(1024) }),
  z.strictObject({ index: z.int().min(0) }),
  z.strictObject({
    idField: z.enum(["id", "_id", "uuid", "key"]),
    id: z.union([z.string().max(1024), z.number()]),
  }),
  z.strictObject({ any: z.literal(true) }),
]);
export const PathPatternSchema = z.array(PathPatternSegmentSchema).max(64);
export type PathPattern = z.infer<typeof PathPatternSchema>;

export const IgnoreEntrySchema = z.strictObject({
  paths: z.array(PathPatternSchema).max(LIMITS.ignoreEntriesMax),
  headers: z.array(z.string().min(1).max(LIMITS.headerNameMax)).max(LIMITS.ignoreEntriesMax),
  usedAt: z.number(),
});
export type IgnoreEntry = z.infer<typeof IgnoreEntrySchema>;

/** `nahual.repeater.ignores.v1` (research R10): claves sha256 en hex, sin URLs ni valores. */
export const IgnoreListSchema = z.strictObject({
  version: z.literal(1),
  endpoints: z
    .record(z.string().regex(/^[0-9a-f]{64}$/), IgnoreEntrySchema)
    .refine((endpoints) => Object.keys(endpoints).length <= LIMITS.ignoreEndpointsMax),
});
export type IgnoreList = z.infer<typeof IgnoreListSchema>;
