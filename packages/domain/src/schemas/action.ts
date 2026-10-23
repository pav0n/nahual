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

export const ActionSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("pause") }),
  MockActionSchema,
  z.strictObject({ kind: z.literal("fail"), errorReason: FailReasonSchema }),
  z.strictObject({
    kind: z.literal("delay"),
    ms: z
      .int({ error: "rule_error_delay" })
      .min(1, { error: "rule_error_delay" })
      .max(LIMITS.delayMsMax, { error: "rule_error_delay" }),
  }),
  z.strictObject({ kind: z.literal("log") }),
]);
export type Action = z.infer<typeof ActionSchema>;
export type ActionKind = Action["kind"];
