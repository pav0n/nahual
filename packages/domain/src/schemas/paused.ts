import { z } from "zod";
import { HeaderSchema, StageSchema, StatusCodeSchema } from "./common.ts";
import { BodyInfoSchema } from "./exchange.ts";
import { HTTP_TOKEN, LIMITS, utf8Bytes } from "./limits.ts";

const BodyTextSchema = z.string().nullable();

/** Item de la cola tal como lo ve el panel (data-model.md, PausedItem). */
export const PausedItemViewSchema = z.strictObject({
  pausedId: z.string().min(1).max(256),
  exchangeId: z.string().min(1).max(256),
  stage: StageSchema,
  ruleId: z.uuid(),
  ruleName: z.string().max(LIMITS.ruleNameMax),
  pausedAt: z.number(),
  expiresAt: z.number(),
  request: z.strictObject({
    method: z.string().min(1).max(64),
    url: z.string().min(1),
    headers: z.array(HeaderSchema).max(500),
    /** Presente si es textual y ≤ 5 MB. */
    body: BodyTextSchema,
    bodyInfo: BodyInfoSchema,
  }),
  response: z
    .strictObject({
      status: StatusCodeSchema,
      headers: z.array(HeaderSchema).max(500),
      body: BodyTextSchema,
      bodyInfo: BodyInfoSchema,
    })
    .nullable(),
});
export type PausedItemView = z.infer<typeof PausedItemViewSchema>;

/**
 * Header de una edición. Los valores reales de la página pueden superar el límite de los headers
 * de un mock (p. ej. una `Cookie` larga) y viajan completos (FR-004b).
 */
export const EditHeaderSchema = z.strictObject({
  name: z
    .string()
    .min(1, { error: "rule_error_required" })
    .max(LIMITS.headerNameMax, { error: "rule_error_too_long" })
    .regex(HTTP_TOKEN, { error: "rule_error_header_name" }),
  value: z
    .string()
    .max(65_536, { error: "rule_error_too_long" })
    .regex(/^[^\r\n]*$/, { error: "rule_error_header_value" }),
});

export const isAbsoluteHttpUrl = (value: string) => {
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
};

/**
 * Lo que el dev confirma en el editor de la cola. Request: método, URL, headers y body;
 * Response: status, headers y body. `headers` reemplaza la lista completa.
 */
export const PausedEditSchema = z
  .strictObject({
    method: z
      .string()
      .min(1, { error: "rule_error_required" })
      .max(64, { error: "rule_error_too_long" })
      .regex(HTTP_TOKEN, { error: "rule_error_method" })
      .optional(),
    url: z
      .string()
      .max(LIMITS.urlMax, { error: "rule_error_too_long" })
      .refine(isAbsoluteHttpUrl, { error: "rule_error_url" })
      .optional(),
    status: StatusCodeSchema.optional(),
    headers: z
      .array(EditHeaderSchema)
      .max(LIMITS.editHeadersMax, { error: "rule_error_too_many" })
      .optional(),
    body: z.string().optional(),
  })
  .superRefine((edit, ctx) => {
    if (edit.body !== undefined && utf8Bytes(edit.body) > LIMITS.bodyBytes) {
      ctx.addIssue({ code: "custom", path: ["body"], message: "rule_error_body_too_large" });
    }
  });
export type PausedEdit = z.infer<typeof PausedEditSchema>;
