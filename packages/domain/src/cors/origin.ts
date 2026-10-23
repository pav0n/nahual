import { z } from "zod";
import { LIMITS } from "../schemas/limits.ts";

/** Caracteres que nunca van en un origen: son comodines o escapes en los patrones de Fetch. */
const PATTERN_CHARS = /[*?\\]/;

/**
 * Normaliza un origen `esquema://host[:puerto]` (data-model: Origin): minúsculas, sin puerto por
 * defecto ni barra final. Devuelve `null` si no es un origen http(s) exacto: `"null"`, rutas,
 * query, credenciales o caracteres de patrón.
 */
export function parseOrigin(input: string): string | null {
  if (input.length === 0 || input.length > LIMITS.originMax || PATTERN_CHARS.test(input))
    return null;
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.username || url.password || url.search || url.hash) return null;
  if (url.pathname !== "/" || /^[a-z]+:\/\/[^/]+\/.+/i.test(input)) return null;
  return url.origin.length <= LIMITS.originMax ? url.origin : null;
}

export const OriginSchema = z
  .string()
  .max(LIMITS.originMax)
  .refine((value) => parseOrigin(value) === value, { error: "cors_error_origin" });

const PATTERN = /^(https?):\/\/\*\.([^/:*?\\]+\.[^/:*?\\]+)(:\d+)?\/?$/i;

/**
 * Entrada de la lista de producción (FR-028): un origen exacto o un patrón
 * `esquema://*.dominio[:puerto]` con un solo `*` al inicio del host. Devuelve la forma
 * normalizada o `null`.
 */
export function parseProductionEntry(input: string): string | null {
  if (input.length === 0 || input.length > LIMITS.originMax) return null;
  const match = PATTERN.exec(input);
  if (!match) return parseOrigin(input);
  const [, scheme, domain, port = ""] = match;
  const origin = parseOrigin(`${scheme}://${domain}${port}`);
  if (origin === null) return null;
  const { protocol, host } = new URL(origin);
  return `${protocol}//*.${host}`;
}

export const ProductionOriginEntrySchema = z
  .string()
  .max(LIMITS.originMax)
  .refine((value) => parseProductionEntry(value) === value, {
    error: "cors_error_production_entry",
  });

/**
 * Entrada de la lista de producción que coincide con `origin` (normalizado), o `null`. Un patrón
 * coincide con subdominios de cualquier nivel con el mismo esquema y puerto, no con el dominio
 * raíz (clarificación de la spec).
 */
export function matchProductionOrigin(origin: string, entries: readonly string[]): string | null {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return null;
  }
  for (const entry of entries) {
    if (!entry.includes("*")) {
      if (entry === origin) return entry;
      continue;
    }
    const pattern = new URL(entry.replace("*.", ""));
    if (pattern.protocol !== url.protocol || pattern.port !== url.port) continue;
    if (url.hostname.endsWith(`.${pattern.hostname}`)) return entry;
  }
  return null;
}
