import { z } from "zod";
import { EditableHeaderSchema, StatusCodeSchema } from "./common.ts";
import { LIMITS, utf8Bytes } from "./limits.ts";

/** Errores de red de FR-019; `action-executor` los traduce a `Network.ErrorReason`. */
export const FAIL_REASONS = [
  "failed",
  "aborted",
  "timedOut",
  "connectionRefused",
  "nameNotResolved",
  "accessDenied",
  "internetDisconnected",
] as const;
export const FailReasonSchema = z.enum(FAIL_REASONS);
export type FailReason = z.infer<typeof FailReasonSchema>;

const mockAction = (maxBodyBytes: number) =>
  z
    .strictObject({
      kind: z.literal("mock"),
      status: StatusCodeSchema,
      headers: z
        .array(EditableHeaderSchema)
        .max(LIMITS.mockHeadersMax, { error: "rule_error_too_many" }),
      body: z.string(),
      bodyEncoding: z.enum(["text", "base64"]),
    })
    .superRefine((d, ctx) => {
      // Cuenta bytes reales, no caracteres; un body base64 cuenta por lo que ocupa guardado.
      if (utf8Bytes(d.body) > maxBodyBytes) {
        ctx.addIssue({ code: "custom", path: ["body"], message: "rule_error_body_too_large" });
      }
    });

/** Mock guardado en una regla: body ≤ 1 MB (research R10). */
export const MockActionSchema = mockAction(LIMITS.savedMockBodyBytes);
/** Mock creado desde la cola, que no se guarda: body ≤ 5 MB. */
export const QueueMockActionSchema = mockAction(LIMITS.bodyBytes);
export type MockAction = z.infer<typeof MockActionSchema>;

/** Acción "Modificar con hook" (006, data-model): el código y lo que puede hacer. */
export const HookActionSchema = z.strictObject({
  kind: z.literal("hook"),
  source: z.string().refine((s) => utf8Bytes(s) <= LIMITS.hookSourceBytesMax, {
    error: "hook_error_too_large",
  }),
  imported: z.boolean(),
  permissions: z.strictObject({
    changeDestination: z.boolean(),
    readSensitive: z.boolean(),
  }),
  /** Último análisis del editor: sin errores de sintaxis ni de tipo para este `hash` del código. */
  check: z.strictObject({ hash: z.string().regex(/^[0-9a-f]{1,32}$/), ok: z.boolean() }),
});
export type HookAction = z.infer<typeof HookActionSchema>;

export const PauseActionSchema = z.strictObject({ kind: z.literal("pause") });
export const FailActionSchema = z.strictObject({
  kind: z.literal("fail"),
  errorReason: FailReasonSchema,
});
export const DelayActionSchema = z.strictObject({
  kind: z.literal("delay"),
  ms: z
    .int({ error: "rule_error_delay" })
    .min(1, { error: "rule_error_delay" })
    .max(LIMITS.delayMsMax, { error: "rule_error_delay" }),
});
export const LogActionSchema = z.strictObject({ kind: z.literal("log") });

export const ActionSchema = z.discriminatedUnion("kind", [
  PauseActionSchema,
  MockActionSchema,
  FailActionSchema,
  DelayActionSchema,
  LogActionSchema,
  HookActionSchema,
]);
export type Action = z.infer<typeof ActionSchema>;
export type ActionKind = Action["kind"];
