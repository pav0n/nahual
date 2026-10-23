import { headerValues } from "../match/headers.ts";
import type { Header } from "../schemas/common.ts";

export interface LinkableExchange {
  id: string;
  url: string;
  method: string;
  isPreflight: boolean;
  startedAt: number;
  requestHeaders: Header[];
  /** Id del request real (`initiator.requestId` de Network, research R6). */
  preflightFor?: string | undefined;
}

/** Ventana máxima entre un request y su preflight cuando no hay `initiator`. */
const WINDOW_MS = 5_000;

/**
 * Relaciona cada request con su preflight (FR-006): por `preflightFor` si lo dio Network; si no,
 * misma URL, mismo método pedido, ≤ 5 s después y el más cercano. Devuelve `request ⇒ preflight`.
 */
export function linkPreflights(exchanges: readonly LinkableExchange[]): Map<string, string> {
  const links = new Map<string, string>();
  const used = new Set<string>();
  const preflights = exchanges.filter((e) => e.isPreflight);
  for (const p of preflights) {
    if (p.preflightFor !== undefined) {
      links.set(p.preflightFor, p.id);
      used.add(p.id);
    }
  }
  for (const request of exchanges) {
    if (request.isPreflight || links.has(request.id)) continue;
    let best: LinkableExchange | null = null;
    for (const p of preflights) {
      if (used.has(p.id) || p.preflightFor !== undefined || p.url !== request.url) continue;
      const asked = headerValues(p.requestHeaders, "access-control-request-method")[0];
      if (asked?.toUpperCase() !== request.method.toUpperCase()) continue;
      const delta = p.startedAt - request.startedAt;
      if (delta < 0 || delta > WINDOW_MS) continue;
      if (!best || delta < best.startedAt - request.startedAt) best = p;
    }
    if (best) {
      links.set(request.id, best.id);
      used.add(best.id);
    }
  }
  return links;
}
