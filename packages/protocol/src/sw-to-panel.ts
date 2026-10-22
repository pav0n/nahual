import { z } from "zod";
import { message } from "./envelope.ts";
import {
  InterceptionPatternSchema,
  MAX_PAUSE_TIMEOUT_SECONDS,
  MIN_PAUSE_TIMEOUT_SECONDS,
  StageSchema,
} from "./panel-to-sw.ts";

export const ERROR_CODES = [
  "invalid_message",
  "not_attached",
  "already_attached",
  "restricted_page",
  "pattern_invalid",
  "timeout_out_of_range",
  "unknown_paused_id",
  "cdp_error",
] as const;
export const ErrorCodeSchema = z.enum(ERROR_CODES);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export const SESSION_STATUSES = ["detached", "attaching", "attached", "conflict"] as const;
export const SessionStatusSchema = z.enum(SESSION_STATUSES);
export type SessionStatus = z.infer<typeof SessionStatusSchema>;

export const CAUSES = [
  "user",
  "panel_closed",
  "canceled_by_user",
  "target_closed",
  "already_attached",
  "restricted_page",
  "unknown",
] as const;
export const CauseSchema = z.enum(CAUSES);
export type Cause = z.infer<typeof CauseSchema>;

export const OUTCOMES = ["continued", "modified", "timed_out", "failed", "abandoned"] as const;
export const OutcomeSchema = z.enum(OUTCOMES);
export type Outcome = z.infer<typeof OutcomeSchema>;

/**
 * Header tal como lo envía el servidor o el navegador, solo para mostrarlo. Es más permisivo
 * que `HeaderEdit` (los servidores mandan valores largos), pero acotado.
 */
export const HeaderSchema = z.strictObject({
  name: z.string().min(1).max(1024),
  value: z.string().max(65_536),
});
export type Header = z.infer<typeof HeaderSchema>;

export const PausedRequestViewSchema = z.strictObject({
  pausedId: z.string().min(1).max(256),
  tabId: z.int().min(0),
  stage: StageSchema,
  method: z.string().min(1).max(64),
  url: z.string().min(1),
  headers: z.array(HeaderSchema).max(500),
  statusCode: z.int().min(100).max(599).nullable(),
  bodyAvailable: z.boolean(),
  bodySize: z.int().min(0).nullable(),
  pausedAt: z.number(),
  expiresAt: z.number(),
});
export type PausedRequestView = z.infer<typeof PausedRequestViewSchema>;

export const SessionStateSchema = z.strictObject({
  status: SessionStatusSchema,
  cause: CauseSchema.nullable(),
  attachedAt: z.number().nullable(),
  patterns: z.array(InterceptionPatternSchema),
  pauseTimeoutSeconds: z.int().min(MIN_PAUSE_TIMEOUT_SECONDS).max(MAX_PAUSE_TIMEOUT_SECONDS),
});
export type SessionState = z.infer<typeof SessionStateSchema>;

export const SwMessageSchema = z.discriminatedUnion("type", [
  message("ack", z.strictObject({})),
  message("error", z.strictObject({ code: ErrorCodeSchema, messageKey: z.string().min(1) })),
  message("state", SessionStateSchema),
  message("paused", PausedRequestViewSchema),
  message(
    "resolved",
    z.strictObject({
      pausedId: z.string().min(1).max(256),
      outcome: OutcomeSchema,
      errorKey: z.string().min(1).optional(),
    }),
  ),
]);

export type SwMessage = z.infer<typeof SwMessageSchema>;
export type SwMessageType = SwMessage["type"];
export type SwPayload<T extends SwMessageType> = Extract<SwMessage, { type: T }>["payload"];
