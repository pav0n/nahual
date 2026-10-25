import {
  ComparableResponseSchema,
  DiffResultSchema,
  PathPatternSchema,
  type RevealedValues,
} from "@nahual/domain";
import { z } from "zod";

/**
 * Mensajes entre el panel y el worker del diff (005, research R12). Los dos receptores validan
 * con estos schemas (principio I, mensajería validada): el worker la petición, el panel la
 * respuesta.
 */
export const DiffRequestSchema = z.strictObject({
  type: z.literal("diff"),
  requestId: z.int().min(0),
  before: ComparableResponseSchema,
  after: ComparableResponseSchema,
  ignores: z.strictObject({
    paths: z.array(PathPatternSchema).max(100),
    headers: z.array(z.string().max(256)).max(100),
  }),
});
export type DiffRequest = z.infer<typeof DiffRequestSchema>;

const RevealedSchema: z.ZodType<RevealedValues> = z.strictObject({
  headers: z.record(
    z.string(),
    z.strictObject({ before: z.string().optional(), after: z.string().optional() }),
  ),
  body: z.record(
    z.string(),
    z.strictObject({ before: z.unknown().optional(), after: z.unknown().optional() }),
  ),
  lines: z.record(z.string(), z.string()),
}) as unknown as z.ZodType<RevealedValues>;

export const DiffReplySchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("result"),
    requestId: z.int().min(0),
    result: DiffResultSchema,
    revealed: RevealedSchema,
  }),
  z.strictObject({ type: z.literal("error"), requestId: z.int().min(0) }),
]);
export type DiffReply = z.infer<typeof DiffReplySchema>;
