import {
  ExchangeUpdateSchema,
  LIMITS,
  PathPatternSchema,
  RepeaterOutcomeSchema,
  RelaxationViewSchema,
  PausedItemViewSchema,
  RuleResultSchema,
  RuleSchema,
  SettingsSchema,
} from "@nahual/domain";
import { z } from "zod";
import { message } from "./envelope.ts";

export const ERROR_CODES = [
  "invalid_message",
  "not_attached",
  "already_attached",
  "restricted_page",
  "unknown_paused_id",
  "cdp_error",
  "rule_invalid",
  "unknown_rule",
  "settings_invalid",
  "storage_quota",
  "edit_invalid",
  "body_unavailable",
  "no_site",
  "relaxation_invalid",
  "ignores_invalid",
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

/** Problema de validación de un campo, para mostrarlo junto a él (FR-013). */
export const IssueSchema = z.strictObject({
  path: z.string().max(256),
  messageKey: z.string().min(1).max(128),
});
export type Issue = z.infer<typeof IssueSchema>;

export const SessionStateSchema = z.strictObject({
  status: SessionStatusSchema,
  cause: CauseSchema.nullable(),
  attachedAt: z.number().nullable(),
  site: z.string().nullable(),
  activeRuleCount: z.int().min(0),
  queueSize: z.int().min(0),
  globalPaused: z.boolean(),
  /** Relajaciones CORS de la pestaña (003). */
  relaxationCount: z.int().min(0),
});
export type SessionState = z.infer<typeof SessionStateSchema>;

export const MAX_EXCHANGE_UPDATES = 200;

const Side = z.enum(["request", "response"]);

export const SwMessageSchema = z.discriminatedUnion("type", [
  // 005: resultado de un envío del repeater, solo al puerto que lo pidió.
  message(
    "repeaterResult",
    RepeaterOutcomeSchema.extend({
      sendId: z.uuid(),
      state: z.enum(["done", "failed", "cancelled"]),
    }),
  ),
  message(
    "ignores",
    z.strictObject({
      method: z.string().min(1).max(64),
      url: z.string().min(1).max(LIMITS.urlMax),
      paths: z.array(PathPatternSchema).max(LIMITS.ignoreEntriesMax),
      headers: z.array(z.string().min(1).max(LIMITS.headerNameMax)).max(LIMITS.ignoreEntriesMax),
    }),
  ),
  message("ack", z.strictObject({})),
  message(
    "error",
    z.strictObject({
      code: ErrorCodeSchema,
      messageKey: z.string().min(1),
      issues: z.array(IssueSchema).max(50).optional(),
    }),
  ),
  message("state", SessionStateSchema),
  message("settings", SettingsSchema),
  message(
    "rules",
    z.strictObject({
      rules: z.array(RuleSchema).max(500),
      discarded: z
        .array(z.strictObject({ count: z.int().min(1), reasonKey: z.string().min(1).max(128) }))
        .max(20),
    }),
  ),
  message(
    "exchanges",
    z.strictObject({ updates: z.array(ExchangeUpdateSchema).max(MAX_EXCHANGE_UPDATES) }),
  ),
  message(
    "relaxations",
    z.strictObject({ items: z.array(RelaxationViewSchema).max(LIMITS.relaxationsPerTab) }),
  ),
  message("navigated", z.strictObject({ site: z.string().nullable(), url: z.string() })),
  message("paused", PausedItemViewSchema),
  message(
    "resolved",
    z.strictObject({
      pausedId: z.string().min(1).max(256),
      outcome: RuleResultSchema,
      errorKey: z.string().min(1).optional(),
    }),
  ),
  message(
    "body",
    z.strictObject({
      exchangeId: z.string().min(1).max(256),
      side: Side,
      encoding: z.enum(["text", "base64"]),
      content: z.string(),
      size: z.int().min(0),
    }),
  ),
  message(
    "notice",
    z.strictObject({
      messageKey: z.string().min(1).max(128),
      params: z.array(z.string().max(256)).max(5).optional(),
    }),
  ),
]);

export type SwMessage = z.infer<typeof SwMessageSchema>;
export type SwMessageType = SwMessage["type"];
export type SwPayload<T extends SwMessageType> = Extract<SwMessage, { type: T }>["payload"];
