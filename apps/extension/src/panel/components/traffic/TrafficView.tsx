import { compileFilter, linkPreflights } from "@nahual/domain";
import { useEffect, useMemo, useRef, useState } from "react";
import { t } from "../../../shared/i18n.ts";
import { usePanelStore } from "../../store/index.ts";
import { UNDO_CLEAR_MS } from "../../store/traffic.ts";
import { BATCH_ACTIONS, batchEnabled } from "../../actions/batch-actions.ts";
import { EmptyState } from "../common/EmptyState.tsx";
import { Toolbar } from "../common/Toolbar.tsx";
import { anchorOf } from "../common/Menu.tsx";
import type { Anchor } from "../common/menu-logic.ts";
import { SplitPane } from "../common/SplitPane.tsx";
import type { DetailTabId } from "./detail-tabs.ts";
import { ExchangeDetail } from "./ExchangeDetail.tsx";
import { Filters, type ValidFilter } from "./Filters.tsx";
import { RequestActionsBar, RowMenu } from "./RequestActions.tsx";
import { TrafficGrid, type RowMenuRequest } from "./TrafficGrid.tsx";

const NO_FILTER = compileFilter({ text: "", regex: "", status: "", types: [] }) as ValidFilter;

/** Por debajo de este ancho la lista va compacta aunque no haya detalle (FR-007, research R4). */
const COMPACT_BELOW_PX = 600;

/** Ancho de un elemento, al día con `ResizeObserver`. */
function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(Number.POSITIVE_INFINITY);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}

/**
 * Sección Tráfico (002 historia 1; 004 FR-006/007/009): filtros en una barra y lista y detalle lado
 * a lado con un divisor. La selección vive en el store para que el detalle, el menú contextual y
 * Pausados la compartan. Limpiar (o el tope de 2,000) cierra el detalle y deja el foco en la lista.
 */
export function TrafficView() {
  const exchanges = usePanelStore((s) => s.exchanges);
  const atCap = usePanelStore((s) => s.atCap);
  const status = usePanelStore((s) => s.session?.status ?? "detached");
  const clear = usePanelStore((s) => s.clearTraffic);
  const undo = usePanelStore((s) => s.undoClearTraffic);
  const pushToast = usePanelStore((s) => s.pushToast);
  const selectedId = usePanelStore((s) => s.selectedExchangeId);
  const setSelectedId = usePanelStore((s) => s.selectExchange);
  const paused = usePanelStore((s) => s.paused);
  const [filter, setFilter] = useState<ValidFilter>(NO_FILTER);
  const detailTab = usePanelStore((s) => s.detailTab) as DetailTabId | null;
  const detailTabSeq = usePanelStore((s) => s.detailTabSeq);
  // Menú contextual de la lista (004 US3), fuera de las filas virtualizadas.
  const [menuFor, setMenuFor] = useState<{ id: string; anchor: Anchor } | null>(null);
  const menuRow = useRef<HTMLElement | null>(null);
  // Selección múltiple (FR-028): solo con acciones por lote registradas.
  const [checked, setChecked] = useState<{ ids: Set<string>; anchor: string | null }>(() => ({
    ids: new Set(),
    anchor: null,
  }));
  const { ref, width } = useWidth();
  const listRef = useRef<HTMLDivElement>(null);

  const shown = useMemo(() => exchanges.filter((e) => filter.matches(e)), [exchanges, filter]);
  const selected =
    selectedId === null ? null : (exchanges.find((e) => e.id === selectedId) ?? null);
  const pausedByExchange = useMemo(
    () => new Map(paused.map((item) => [item.exchangeId, item])),
    [paused],
  );
  const pausedIds = useMemo(() => new Set(pausedByExchange.keys()), [pausedByExchange]);
  // Request ⇒ preflight y su inverso, para ir y volver desde el detalle (FR-006).
  const links = useMemo(() => {
    const forward = linkPreflights(exchanges);
    const both = new Map(forward);
    for (const [request, preflight] of forward) both.set(preflight, request);
    return both;
  }, [exchanges]);

  const menuExchange = menuFor ? (exchanges.find((e) => e.id === menuFor.id) ?? null) : null;

  /** El menú selecciona la fila y se abre en el punto del clic o, con teclado, bajo la fila. */
  const openRowMenu = ({ exchange, row, point }: RowMenuRequest) => {
    setSelectedId(exchange.id);
    menuRow.current = row;
    setMenuFor({
      id: exchange.id,
      anchor: point
        ? { left: point.x, right: point.x, top: point.y, bottom: point.y }
        : anchorOf(row),
    });
  };

  const changeSelection = (id: string, mode: "toggle" | "range" | "single") =>
    setChecked(({ ids, anchor }) => {
      if (mode === "single") return { ids: new Set([id]), anchor: id };
      const next = new Set(ids);
      if (mode === "toggle") {
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return { ids: next, anchor: id };
      }
      const from = shown.findIndex((e) => e.id === (anchor ?? id));
      const to = shown.findIndex((e) => e.id === id);
      const [a, b] = from <= to ? [from, to] : [to, from];
      for (const e of shown.slice(Math.max(0, a), b + 1)) next.add(e.id);
      return { ids: next, anchor: anchor ?? id };
    });
  const selectedIds = [...checked.ids].filter((id) => exchanges.some((e) => e.id === id));
  const batch = BATCH_ACTIONS.filter((action) => selectedIds.length >= action.minSelected);

  const focusList = () =>
    requestAnimationFrame(() =>
      listRef.current?.querySelector<HTMLElement>("[role=grid], .empty-state")?.focus(),
    );

  const closeDetail = () => {
    setSelectedId(null);
    focusList();
  };

  const onClear = () => {
    clear();
    closeDetail();
    pushToast(
      { messageKey: "toast_traffic_cleared", actionKey: "action_undo", onAction: () => undo() },
      UNDO_CLEAR_MS,
    );
  };

  const list = (
    <div ref={listRef} className="traffic-list">
      {batch.length > 0 ? (
        <Toolbar label={t("traffic_batch_label")} className="batch-bar">
          <span className="count">{t("traffic_selected_count", String(selectedIds.length))}</span>
          {batch.map((action) => (
            <button key={action.id} type="button" onClick={() => action.run(selectedIds)}>
              {action.label ?? t(action.labelKey)}
            </button>
          ))}
        </Toolbar>
      ) : null}
      {exchanges.length === 0 ? (
        <EmptyState title={t("empty_traffic_title")}>
          {t(status === "attached" ? "empty_traffic_reload" : "empty_traffic_body")}
        </EmptyState>
      ) : shown.length === 0 ? (
        <EmptyState title={t("empty_traffic_filtered_title")}>
          {t("empty_traffic_filtered_body")}
        </EmptyState>
      ) : (
        <TrafficGrid
          exchanges={shown}
          selectedId={selected?.id ?? null}
          pausedIds={pausedIds}
          compact={selected !== null || width < COMPACT_BELOW_PX}
          onOpen={(id) => setSelectedId(id)}
          onRowMenu={openRowMenu}
          {...(batchEnabled() ? { selection: { ids: checked.ids, change: changeSelection } } : {})}
        />
      )}
    </div>
  );

  return (
    <div ref={ref} className="traffic">
      <Filters
        shown={shown.length}
        total={exchanges.length}
        onChange={setFilter}
        onClear={onClear}
        clearDisabled={exchanges.length === 0}
      />
      {atCap ? <p className="muted at-cap">{t("traffic_at_cap")}</p> : null}
      <SplitPane
        prefKey="traffic"
        label={t("traffic_divider")}
        start={list}
        end={
          selected ? (
            <ExchangeDetail
              key={`${selected.id}:${detailTabSeq}`}
              exchange={selected}
              paused={pausedByExchange.get(selected.id) ?? null}
              relatedId={links.get(selected.id) ?? null}
              initialTab={detailTab}
              // Al ir al preflight relacionado (o volver) desde CORS, el detalle abre en CORS.
              onOpen={(id) => setSelectedId(id, "cors")}
              onClose={closeDetail}
              actions={<RequestActionsBar exchange={selected} />}
            />
          ) : null
        }
      />
      {menuExchange && menuFor ? (
        <RowMenu
          exchange={menuExchange}
          anchor={menuFor.anchor}
          row={menuRow}
          onClose={() => setMenuFor(null)}
        />
      ) : null}
    </div>
  );
}
