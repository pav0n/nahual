import type { RepeaterHeader } from "../schemas/repeater.ts";

/**
 * Nombres que `fetch` no deja fijar (especificación Fetch, "forbidden request-header"): el
 * navegador los ignora o pone los suyos, en la pestaña y en el SW (research R6).
 */
const FORBIDDEN = new Set([
  "accept-charset",
  "accept-encoding",
  "access-control-request-headers",
  "access-control-request-method",
  "access-control-request-private-network",
  "connection",
  "content-length",
  "cookie",
  "cookie2",
  "date",
  "dnt",
  "expect",
  "host",
  "keep-alive",
  "origin",
  "referer",
  "set-cookie",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "via",
]);

export const isForbiddenHeader = (name: string) => {
  const lower = name.toLowerCase();
  return FORBIDDEN.has(lower) || lower.startsWith("proxy-") || lower.startsWith("sec-");
};

/**
 * Headers activos que no saldrán tal cual (FR-008), en minúsculas y sin repetir. La lista es la
 * misma en los dos modos: los dos envían con `fetch`.
 */
export function forbiddenHeaders(headers: RepeaterHeader[]): string[] {
  const names = headers
    .filter((h) => h.enabled && isForbiddenHeader(h.name))
    .map((h) => h.name.toLowerCase());
  return [...new Set(names)];
}
