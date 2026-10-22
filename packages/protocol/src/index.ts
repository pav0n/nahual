import type { z } from "zod";
import { PROTOCOL_VERSION } from "./envelope.ts";
import {
  PanelMessageSchema,
  type PanelMessage,
  type PanelMessageType,
  type PanelPayload,
} from "./panel-to-sw.ts";
import {
  SwMessageSchema,
  type SwMessage,
  type SwMessageType,
  type SwPayload,
} from "./sw-to-panel.ts";

export * from "./envelope.ts";
export * from "./panel-to-sw.ts";
export * from "./sw-to-panel.ts";

export type ParseResult<T> = { ok: true; message: T } | { ok: false; error: string };

/**
 * Resume los problemas de validación con su ruta y código, nunca con el valor recibido: los
 * mensajes pueden contener headers sensibles y este texto termina en logs.
 */
function describeIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 5)
    .map((issue) => `${issue.path.join(".") || "(raíz)"}: ${issue.code}`)
    .join("; ");
}

function parseWith<T>(schema: z.ZodType<T>, raw: unknown): ParseResult<T> {
  const result = schema.safeParse(raw);
  return result.success
    ? { ok: true, message: result.data }
    : { ok: false, error: describeIssues(result.error) };
}

/** Valida un mensaje del panel hacia el service worker. Nunca lanza. */
export const parsePanelMessage = (raw: unknown): ParseResult<PanelMessage> =>
  parseWith(PanelMessageSchema, raw);

/** Valida un mensaje del service worker hacia el panel. Nunca lanza. */
export const parseSwMessage = (raw: unknown): ParseResult<SwMessage> =>
  parseWith(SwMessageSchema, raw);

// TypeScript no puede relacionar el genérico `T` con la unión discriminada; la forma real la
// cubren las pruebas (cada mensaje construido pasa su propio schema).
export function makeCommand<T extends PanelMessageType>(type: T, payload: PanelPayload<T>) {
  const command = { v: PROTOCOL_VERSION, id: crypto.randomUUID(), type, payload };
  return command as unknown as Extract<PanelMessage, { type: T }>;
}

export function makeEvent<T extends SwMessageType>(
  type: T,
  payload: SwPayload<T>,
  correlationId?: string,
) {
  const base = { v: PROTOCOL_VERSION, id: crypto.randomUUID(), type, payload };
  const event = correlationId === undefined ? base : { ...base, correlationId };
  return event as unknown as Extract<SwMessage, { type: T }>;
}
