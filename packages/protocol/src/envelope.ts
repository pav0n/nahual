import { z } from "zod";

// Sin compilación JIT de schemas: Zod la haría con `new Function`, prohibido por la CSP de MV3 y
// por la constitución (sin código evaluado fuera del sandbox).
z.config({ jitless: true });

export const PROTOCOL_VERSION = 3;

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
