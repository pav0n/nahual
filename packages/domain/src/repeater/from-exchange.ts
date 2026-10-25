import { pathOf } from "../rule-from-exchange.ts";
import { isForbiddenHeader } from "./forbidden-headers.ts";
import type { CapturedExchange } from "../schemas/exchange.ts";
import { LIMITS } from "../schemas/limits.ts";
import {
  RepeaterHeaderSchema,
  type RepeaterBody,
  type RepeaterHeader,
  type RepeaterRequest,
} from "../schemas/repeater.ts";

/** Body del request capturado tal como lo devuelve la captura (`getBody`) o su ausencia. */
export type CapturedRequestBody =
  | { kind: "text"; text: string }
  | { kind: "base64"; base64: string; size: number }
  | { kind: "unavailable"; reason: string }
  | null;

const contentTypeOf = (exchange: CapturedExchange) =>
  exchange.requestHeaders.find((h) => h.name.toLowerCase() === "content-type")?.value ?? null;

function bodyOf(exchange: CapturedExchange, body: CapturedRequestBody): RepeaterBody {
  if (body?.kind === "text") return { kind: "text", text: body.text };
  if (body?.kind === "base64")
    return {
      kind: "original",
      base64: body.base64,
      contentType: contentTypeOf(exchange)?.slice(0, 256) ?? null,
      size: body.size,
    };
  // Sin body que reenviar: el motivo alimenta el aviso de FR-002a.
  const reason = body?.reason ?? exchange.requestBody.reason ?? "none";
  if (reason === "none") return { kind: "none" };
  if (reason === "evicted" || reason === "tooLarge") return { kind: "none", reason };
  return { kind: "none", reason: "unavailable" };
}

/**
 * Pestaña nueva del repeater a partir de un request capturado (005, FR-002, FR-002a): método,
 * URL, headers (activos salvo los que el navegador no deja fijar; los que el editor no admite se
 * omiten) y el body si se conserva. El nombre por defecto es `MÉTODO /ruta`.
 */
export function repeaterRequestFromExchange(
  exchange: CapturedExchange,
  body: CapturedRequestBody,
): { request: RepeaterRequest; name: string; truncatedUrl: boolean } {
  const headers: RepeaterHeader[] = [];
  for (const { name, value } of exchange.requestHeaders) {
    // Los que pone el navegador (`sec-*`, `referer`, `cookie`…) se copian desactivados: igual
    // no saldrían tal cual (FR-008) y así no llenan el editor de avisos.
    const header = { name, value, enabled: !isForbiddenHeader(name) };
    if (RepeaterHeaderSchema.safeParse(header).success) headers.push(header);
    if (headers.length === LIMITS.repeaterHeadersMax) break;
  }
  const method = exchange.method.toUpperCase();
  return {
    request: { method, url: exchange.url, headers, body: bodyOf(exchange, body) },
    name: `${method} ${pathOf(exchange.url)}`.slice(0, LIMITS.repeaterTabNameMax).trim(),
    truncatedUrl: exchange.urlTruncated,
  };
}
