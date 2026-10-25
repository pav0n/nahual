import { z } from "zod";

// Mensajes panel ⇔ Worker de tipos de los hooks (006, research R4). Se validan en ambos lados.

export const TypesRequestSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("update"), id: z.int(), source: z.string().max(200_000) }),
  z.strictObject({ type: z.literal("complete"), id: z.int(), position: z.int().min(0) }),
  z.strictObject({ type: z.literal("info"), id: z.int(), position: z.int().min(0) }),
]);
export type TypesRequest = z.infer<typeof TypesRequestSchema>;

const Diagnostic = z.strictObject({
  from: z.int().min(0),
  to: z.int().min(0),
  line: z.int().min(1),
  message: z.string().max(4_000),
  severity: z.enum(["error", "warning"]),
});

export const TypesReplySchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("diagnostics"),
    id: z.int(),
    diagnostics: z.array(Diagnostic).max(500),
  }),
  z.strictObject({
    type: z.literal("completions"),
    id: z.int(),
    completions: z
      .array(z.strictObject({ label: z.string(), kind: z.string(), detail: z.string().optional() }))
      .max(200),
  }),
  z.strictObject({ type: z.literal("info"), id: z.int(), text: z.string().nullable() }),
]);
export type TypesReply = z.infer<typeof TypesReplySchema>;
