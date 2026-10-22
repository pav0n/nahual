import { z } from "zod";

export const PROTOCOL_VERSION = 1;

const Uuid = z.uuidv4();

/** Sobre común a todo mensaje entre contextos (contracts/panel-protocol.md). */
export const EnvelopeSchema = z.strictObject({
  v: z.literal(PROTOCOL_VERSION),
  id: Uuid,
  correlationId: Uuid.optional(),
  type: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
});

export type Envelope = z.infer<typeof EnvelopeSchema>;

/** Sobre con `type` y `payload` concretos, para construir las uniones discriminadas. */
export function message<const T extends string, P extends z.ZodType>(type: T, payload: P) {
  return z.strictObject({
    v: z.literal(PROTOCOL_VERSION),
    id: Uuid,
    correlationId: Uuid.optional(),
    type: z.literal(type),
    payload,
  });
}
