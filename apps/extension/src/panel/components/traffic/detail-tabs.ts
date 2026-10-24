import type { CapturedExchange, PausedItemView } from "@nahual/domain";

/** Pestañas del detalle (004, contracts/panel-shell.md `DETAIL_TABS`); 006 añade `hooks`. */
export type DetailTabId = "cors" | "edit" | "headers" | "request" | "response";

export const DETAIL_TABS: readonly { id: DetailTabId; labelKey: string }[] = [
  { id: "cors", labelKey: "detail_tab_cors" },
  { id: "edit", labelKey: "detail_tab_edit" },
  { id: "headers", labelKey: "detail_tab_headers" },
  { id: "request", labelKey: "detail_tab_request" },
  { id: "response", labelKey: "detail_tab_response" },
];

/**
 * Pestañas que aplican a un intercambio: CORS si hay información CORS (bloqueo, relajación o el
 * preflight relacionado), Editar si tiene un pausado activo; las demás siempre.
 */
export function detailTabsFor(
  exchange: CapturedExchange,
  paused: PausedItemView | null,
  hasRelated: boolean,
): DetailTabId[] {
  const cors = Boolean(exchange.cors?.diagnosis || exchange.cors?.relaxed || hasRelated);
  return DETAIL_TABS.map((tab) => tab.id).filter(
    (id) => (id !== "cors" || cors) && (id !== "edit" || paused !== null),
  );
}

/** Pestaña con la que abre el detalle (FR-018): CORS si fue bloqueado, Editar si está pausado. */
export function initialDetailTab(
  exchange: CapturedExchange,
  paused: PausedItemView | null,
): DetailTabId {
  if (exchange.cors?.diagnosis) return "cors";
  if (paused) return "edit";
  return "headers";
}
