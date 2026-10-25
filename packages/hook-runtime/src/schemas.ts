import { LIMITS, StageSchema, utf8Bytes } from "@nahual/domain";
import { z } from "zod";

/** Body tal como lo ve un hook (data-model): texto o el motivo por el que no hay contenido. */
export const HookBodySchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("text"),
    text: z.string().refine((t) => utf8Bytes(t) <= LIMITS.bodyBytes, {
      error: "rule_error_body_too_large",
    }),
    contentType: z.string().max(LIMITS.headerValueMax).nullable(),
    size: z.int().min(0).nullable(),
  }),
  z.strictObject({
    kind: z.enum(["binary", "tooLarge", "none"]),
    contentType: z.string().max(LIMITS.headerValueMax).nullable(),
    size: z.int().min(0).nullable(),
  }),
]);
export type HookBody = z.infer<typeof HookBodySchema>;

/** Headers como objeto con nombres en minúsculas (contracts/hook-api.md). */
export const HookHeadersSchema = z.record(z.string().max(LIMITS.headerNameMax), z.string());
export type HookHeaders = z.infer<typeof HookHeadersSchema>;

const RequestPartSchema = z.strictObject({
  method: z.string().max(64),
  url: z.string().max(LIMITS.urlMax),
  headers: HookHeadersSchema,
  body: HookBodySchema,
  graphql: z.strictObject({ operationName: z.string().nullable() }).nullable(),
});

const ResponsePartSchema = z.strictObject({
  status: z.int().min(0).max(999),
  headers: HookHeadersSchema,
  body: HookBodySchema,
});

/** Lo que viaja al sandbox: solo datos (data-model, `HookContextData`). */
export const HookContextDataSchema = z.strictObject({
  stage: StageSchema,
  resourceType: z.string().max(64),
  site: z.string().max(LIMITS.originMax),
  request: RequestPartSchema,
  response: ResponsePartSchema.nullable(),
});
export type HookContextData = z.infer<typeof HookContextDataSchema>;

/** `ctx.respond(...)` de etapa Request (FR-010). */
export const HookRespondSchema = z.strictObject({
  status: z.int(),
  headers: HookHeadersSchema,
  body: z.string(),
});
export type HookRespond = z.infer<typeof HookRespondSchema>;

export const HOOK_ERROR_TYPES = [
  "exception",
  "invalid_result",
  "timeout",
  "state_conflict",
  "state_too_large",
  "access_denied",
] as const;
export type HookErrorType = (typeof HOOK_ERROR_TYPES)[number];

const LogsSchema = z
  .array(z.string().max(LIMITS.hookLogEntryChars))
  .max(LIMITS.hookConsoleEntriesMax);

/** Resultado de una ejecución que devuelve el sandbox (data-model, `HookOutcome`). */
export const HookOutcomeSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("ok"),
    context: HookContextDataSchema,
    respond: HookRespondSchema.nullable(),
    stateChanged: z.boolean(),
    state: z.unknown(),
    logs: LogsSchema,
    durationMs: z.number().min(0),
  }),
  z.strictObject({
    kind: z.literal("error"),
    type: z.enum(HOOK_ERROR_TYPES),
    message: z.string().max(2_000),
    line: z.int().min(1).nullable(),
    logs: LogsSchema,
    durationMs: z.number().min(0),
  }),
]);
export type HookOutcome = z.infer<typeof HookOutcomeSchema>;

/** Panel ⇒ sandbox (contracts/sandbox-messaging.md). */
export const PanelToSandboxSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("run"),
    execId: z.string().min(1).max(64),
    ruleId: z.string().min(1).max(64),
    codeHash: z.string().regex(/^[0-9a-f]{1,32}$/),
    /** Solo si el sandbox no tiene ese `codeHash` en caché. */
    source: z
      .string()
      .refine((s) => utf8Bytes(s) <= LIMITS.hookSourceBytesMax)
      .nullable(),
    context: HookContextDataSchema,
    state: z.unknown(),
    timeoutMs: z.int().min(1).max(LIMITS.hookTimeoutMs),
  }),
  z.strictObject({ type: z.literal("dispose"), ruleId: z.string().min(1).max(64) }),
]);
export type PanelToSandbox = z.infer<typeof PanelToSandboxSchema>;

/** Sandbox ⇒ panel. */
export const SandboxToPanelSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("hello"), v: z.literal(1) }),
  z.strictObject({ type: z.literal("ready"), sucraseMs: z.number().min(0) }),
  z.strictObject({
    type: z.literal("result"),
    execId: z.string().min(1).max(64),
    outcome: HookOutcomeSchema,
  }),
]);
export type SandboxToPanel = z.infer<typeof SandboxToPanelSchema>;
