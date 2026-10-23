import type { Header } from "../schemas/common.ts";
import { HTTP_TOKEN, LIMITS } from "../schemas/limits.ts";

/** Headers que el navegador pone por su cuenta: la app no los pide y el servidor no los permite. */
const BROWSER_HEADERS = new Set([
  "origin",
  "cookie",
  "cookie2",
  "referer",
  "user-agent",
  "host",
  "connection",
  "content-length",
  "accept-encoding",
  "accept-charset",
  "keep-alive",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "via",
  "date",
  "dnt",
  "expect",
  "priority",
]);

const BROWSER_PREFIXES = ["sec-", "proxy-", "access-control-request-"];

/** Content-Type que no dispara preflight (Fetch, CORS-safelisted request-header). */
const SIMPLE_CONTENT_TYPES = new Set([
  "application/x-www-form-urlencoded",
  "multipart/form-data",
  "text/plain",
]);

function isSafelisted(name: string, value: string): boolean {
  if (name === "accept" || name === "accept-language" || name === "content-language") return true;
  if (name === "content-type") {
    const essence = value.split(";")[0]?.trim().toLowerCase() ?? "";
    return SIMPLE_CONTENT_TYPES.has(essence);
  }
  return false;
}

/**
 * Headers que la app pidió y que el servidor debe permitir en `Access-Control-Allow-Headers`:
 * nombres en minúsculas, ordenados, sin los safelisted ni los que pone el navegador (≤ 50).
 * Solo devuelve nombres, nunca valores (FR-035).
 */
export function requestedHeaders(headers: readonly Header[]): string[] {
  const names = new Set<string>();
  for (const { name, value } of headers) {
    const lower = name.toLowerCase();
    if (!HTTP_TOKEN.test(lower) || lower.length > LIMITS.corsHeaderNameMax) continue;
    if (BROWSER_HEADERS.has(lower) || BROWSER_PREFIXES.some((p) => lower.startsWith(p))) continue;
    if (isSafelisted(lower, value)) continue;
    names.add(lower);
  }
  return [...names].sort().slice(0, LIMITS.requestedHeadersMax);
}

/** Nombres de una lista separada por comas (`Access-Control-Request-Headers`). */
export function headerList(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter((v) => v.length > 0);
}
