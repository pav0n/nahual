import { z } from "zod";
import { HeaderSchema } from "../schemas/common.ts";
import { HTTP_TOKEN, LIMITS } from "../schemas/limits.ts";
import { OriginSchema } from "./origin.ts";

/** Causas de bloqueo CORS (FR-003, research R3). */
export const CORS_CAUSES = [
  "missing_allow_origin",
  "origin_mismatch",
  "method_not_allowed",
  "header_not_allowed",
  "preflight_status",
  "wildcard_with_credentials",
  "missing_allow_credentials",
  "preflight_redirect",
  "unrecognized",
] as const;
export const CorsCauseSchema = z.enum(CORS_CAUSES);
export type CorsCause = z.infer<typeof CorsCauseSchema>;

/** Duraciones de una relajación en minutos (FR-015). */
export const RELAXATION_DURATIONS = [15, 60, 240, 480] as const;
export const RelaxationDurationSchema = z.union(
  RELAXATION_DURATIONS.map((minutes) => z.literal(minutes)),
  { error: "cors_error_duration" },
);
export type RelaxationDuration = (typeof RELAXATION_DURATIONS)[number];

/** Nombre de header en minúsculas (data-model: HeaderName). Nunca `*`. */
export const CorsHeaderNameSchema = z
  .string()
  .min(1)
  .max(LIMITS.corsHeaderNameMax)
  .regex(HTTP_TOKEN, { error: "cors_error_header_name" })
  .refine((name) => name === name.toLowerCase() && name !== "*", {
    error: "cors_error_header_name",
  });

export const NOT_RELAXABLE_REASONS = [
  "null_origin",
  "same_origin",
  "unrecognized",
  "production",
] as const;

/** Diagnóstico de un intercambio bloqueado por CORS (FR-003–FR-007). */
export const CorsDiagnosisSchema = z.strictObject({
  cause: CorsCauseSchema,
  browserCode: z.string().max(64),
  failedParameter: z.string().max(256).nullable(),
  atPreflight: z.boolean(),
  appOrigin: OriginSchema.nullable(),
  /** Origen del destino tal cual (puede no ser http/https). */
  apiOrigin: z.string().max(LIMITS.originMax),
  method: z.string().min(1).max(64),
  requestedHeaders: z.array(CorsHeaderNameSchema).max(LIMITS.requestedHeadersMax),
  credentials: z.enum(["yes", "no", "unknown"]),
  responseStatus: z.int().min(0).max(999).nullable(),
  preflightStatus: z.int().min(0).max(999).nullable(),
  serverCorsHeaders: z.array(HeaderSchema).max(20),
  preflightExchangeId: z.string().max(256).nullable(),
  relaxable: z.boolean(),
  notRelaxableReason: z.enum(NOT_RELAXABLE_REASONS).optional(),
});
export type CorsDiagnosis = z.infer<typeof CorsDiagnosisSchema>;

/** Lo que la relajación cambió en un intercambio (FR-026, FR-027). */
export const CorsRelaxedInfoSchema = z.strictObject({
  relaxationId: z.uuid(),
  added: z.array(HeaderSchema).max(10),
  removed: z.array(HeaderSchema).max(20),
  preflightReplaced: z.boolean(),
  serverStatus: z.int().min(0).max(999),
  alreadyValid: z.boolean(),
  errorKey: z.string().min(1).max(128).optional(),
});
export type CorsRelaxedInfo = z.infer<typeof CorsRelaxedInfoSchema>;

export const RELAXATION_STATES = ["active", "suspended", "idle"] as const;
export type RelaxationState = (typeof RELAXATION_STATES)[number];

/** Relajación tal como la ve el panel (contracts/panel-protocol.md). */
export const RelaxationViewSchema = z.strictObject({
  id: z.uuid(),
  appOrigin: OriginSchema,
  apiOrigin: OriginSchema,
  exposeHeaders: z.array(CorsHeaderNameSchema).max(LIMITS.exposeHeadersMax),
  credentials: z.boolean(),
  createdAt: z.number(),
  expiresAt: z.number(),
  state: z.enum(RELAXATION_STATES),
});
export type RelaxationView = z.infer<typeof RelaxationViewSchema>;

/** Causas por las que termina una relajación (research R10). */
export const RELAXATION_END_CAUSES = [
  "expired",
  "user",
  "detached",
  "production",
  "restart",
] as const;
export type RelaxationEndCause = (typeof RELAXATION_END_CAUSES)[number];
