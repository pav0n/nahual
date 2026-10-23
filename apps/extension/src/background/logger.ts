import { MASK, isSensitiveHeader } from "@nahual/domain";

export type LogValue = string | number | boolean | null | undefined;
export type LogData = Record<string, LogValue>;

export interface Logger {
  warn(message: string, data?: LogData): void;
  error(message: string, data?: LogData): void;
}

interface Sink {
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

const URL_LIKE = /\b[a-z][a-z0-9+.-]*:\/\/\S*/gi;
const HAS_URL = /\b[a-z][a-z0-9+.-]*:\/\//i;
/** Más largo que un código o un identificador: puede ser un body o un valor capturado. */
const MAX_VALUE_CHARS = 64;

function sanitizeValue(key: string, value: LogValue): LogValue {
  if (typeof value !== "string") return value;
  if (isSensitiveHeader(key)) return MASK;
  if (HAS_URL.test(value) || value.length > MAX_VALUE_CHARS) return "[omitido]";
  return value;
}

/**
 * Registros del SW sin datos de tráfico (FR-036): nunca URLs, valores de headers sensibles ni
 * bodies, aunque el código que llama se equivoque y los pase. Solo códigos, causas e ids.
 */
export function createLogger(sink: Sink = console): Logger {
  const format = (message: string, data?: LogData) => {
    const text = `[nahual] ${message.replace(URL_LIKE, "[url]")}`;
    if (!data) return [text];
    const clean = Object.fromEntries(
      Object.entries(data).map(([key, value]) => [key, sanitizeValue(key, value)]),
    );
    return [text, clean];
  };
  return {
    warn: (message, data) => sink.warn(...format(message, data)),
    error: (message, data) => sink.error(...format(message, data)),
  };
}

export const logger = createLogger();
