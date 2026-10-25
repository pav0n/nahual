import type { CapturedExchange } from "@nahual/domain";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { t } from "../../../shared/i18n.ts";
import { formatBytes, formatDuration, formatStatus } from "../../format.ts";

/** Alto de fila de Network (004, research D1). */
const ROW_HEIGHT = 21;
const COLUMNS = ["name", "method", "status", "type", "size", "time"] as const;
/** Con el detalle abierto se ocultan Tipo, Tamaño y Tiempo (FR-007). */
const COMPACT_COLUMNS = ["name", "method", "status"] as const;

export interface RowMenuRequest {
  exchange: CapturedExchange;
  row: HTMLElement;
  /** Punto del clic derecho; sin él (teclado), el menú se abre bajo la fila. */
  point: { x: number; y: number } | null;
}

interface Props {
  exchanges: CapturedExchange[];
  selectedId: string | null;
  /** Ids de intercambios con un pausado activo (marca "pausado", FR-016). */
  pausedIds?: ReadonlySet<string>;
  compact?: boolean;
  onOpen(id: string): void;
  /** Menú de acciones del request (004 US3); sin él, el clic derecho es el del navegador. */
  onRowMenu?(request: RowMenuRequest): void;
  /** Selección múltiple (FR-028): solo si hay acciones por lote registradas. */
  selection?: {
    ids: ReadonlySet<string>;
    change(id: string, mode: "toggle" | "range" | "single"): void;
  };
}

/** Ruta con query y origen de una URL, para la columna Nombre (research R11). */
function nameParts(url: string): { path: string; origin: string } {
  try {
    const parsed = new URL(url);
    return { path: `${parsed.pathname}${parsed.search}` || "/", origin: parsed.origin };
  } catch {
    return { path: url, origin: "" };
  }
}

/**
 * Lista de tráfico virtualizada (research R13 de 002): patrón grid de APG con `aria-rowcount`
 * total y `aria-rowindex` por fila. Columnas de 004 (R11): Nombre (marcas, ruta con query y
 * origen), Método, Estado, Tipo, Tamaño y Tiempo. Flechas, Inicio/Fin y RePág/AvPág mueven la fila
 * activa; `Enter` abre el detalle.
 */
export function TrafficGrid({
  exchanges,
  selectedId,
  pausedIds,
  compact = false,
  onOpen,
  onRowMenu,
  selection,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  // Foco pendiente en la fila activa: puede no estar renderizada hasta que el virtualizador
  // desplace la lista, así que se reintenta en cada render.
  const focusPending = useRef(false);
  const activeIndex = Math.min(active, Math.max(0, exchanges.length - 1));
  const columns = compact ? COMPACT_COLUMNS : COLUMNS;

  // TanStack Virtual devuelve funciones que no se pueden memoizar: no se usa React Compiler.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: exchanges.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  });

  useEffect(() => {
    if (!focusPending.current) return;
    const row = scrollRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    if (row) {
      row.focus();
      focusPending.current = false;
    }
  });

  const move = (index: number) => {
    const next = Math.max(0, Math.min(exchanges.length - 1, index));
    setActive(next);
    virtualizer.scrollToIndex(next, { align: "auto" });
    focusPending.current = true;
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const page = Math.max(1, Math.floor((scrollRef.current?.clientHeight ?? 280) / ROW_HEIGHT) - 1);
    const keys: Record<string, number> = {
      ArrowDown: activeIndex + 1,
      ArrowUp: activeIndex - 1,
      PageDown: activeIndex + page,
      PageUp: activeIndex - page,
      Home: 0,
      End: exchanges.length - 1,
    };
    const target = keys[event.key];
    if (target !== undefined) {
      event.preventDefault();
      move(target);
    } else if (event.key === "Enter") {
      const exchange = exchanges[activeIndex];
      if (exchange) {
        event.preventDefault();
        onOpen(exchange.id);
      }
    }
  };

  const onContextMenu = (event: MouseEvent) => {
    if (!onRowMenu) return;
    // Sobre el área vacía de la lista no hay menú (ni el del navegador): no hay request (caso límite).
    const row = (event.target as HTMLElement).closest<HTMLElement>("[data-exchange-id]");
    event.preventDefault();
    if (!row) return;
    const exchange = exchanges.find((e) => e.id === row.dataset.exchangeId);
    if (!exchange) return;
    setActive(Number(row.dataset.index));
    // Shift+F10 y la tecla de menú emiten `contextmenu` sin coordenadas de puntero útiles.
    const keyboard = event.button !== 2 || (event.clientX === 0 && event.clientY === 0);
    onRowMenu({ exchange, row, point: keyboard ? null : { x: event.clientX, y: event.clientY } });
  };

  return (
    <div
      ref={scrollRef}
      className="grid-scroll"
      role="grid"
      aria-label={t("traffic_grid_label")}
      aria-rowcount={exchanges.length + 1}
      aria-colcount={columns.length}
      onKeyDown={onKeyDown}
      onContextMenu={onRowMenu ? onContextMenu : undefined}
    >
      <div role="row" aria-rowindex={1} className="grid-row grid-head" data-compact={compact}>
        {columns.map((column, i) => (
          <span
            key={column}
            role="columnheader"
            aria-colindex={i + 1}
            className={`cell cell-${column}`}
          >
            {t(`traffic_col_${column}`)}
          </span>
        ))}
      </div>
      <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
        {virtualizer.getVirtualItems().map((item) => {
          const exchange = exchanges[item.index];
          if (!exchange) return null;
          const effect = exchange.ruleEffects.at(-1);
          const { path, origin } = nameParts(exchange.url);
          return (
            <div
              key={exchange.id}
              role="row"
              data-index={item.index}
              data-exchange-id={exchange.id}
              aria-rowindex={item.index + 2}
              aria-selected={exchange.id === selectedId}
              tabIndex={item.index === activeIndex ? 0 : -1}
              className="grid-row"
              data-state={exchange.state}
              data-compact={compact}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                height: ROW_HEIGHT,
                transform: `translateY(${item.start}px)`,
              }}
              onClick={(event) => {
                setActive(item.index);
                if (selection && (event.ctrlKey || event.metaKey)) {
                  selection.change(exchange.id, "toggle");
                  return;
                }
                if (selection && event.shiftKey) {
                  selection.change(exchange.id, "range");
                  return;
                }
                selection?.change(exchange.id, "single");
                onOpen(exchange.id);
              }}
              onFocus={() => setActive(item.index)}
            >
              <span
                role="gridcell"
                aria-colindex={1}
                className="cell cell-name"
                title={exchange.url}
              >
                {selection ? (
                  <input
                    type="checkbox"
                    className="row-check"
                    tabIndex={-1}
                    aria-label={t("traffic_select_row", `${exchange.method} ${path}`)}
                    checked={selection.ids.has(exchange.id)}
                    onClick={(event) => event.stopPropagation()}
                    onChange={() => selection.change(exchange.id, "toggle")}
                  />
                ) : null}
                {effect ? (
                  <span
                    className="rule-mark"
                    title={t("traffic_rule_applied", [
                      effect.ruleName,
                      t(`result_${effect.result}`),
                    ])}
                  >
                    <span aria-hidden="true">◆</span>
                    <span className="visually-hidden">
                      {t("traffic_rule_applied", [
                        effect.ruleName,
                        t(`result_${effect.result}`),
                      ])}{" "}
                    </span>
                  </span>
                ) : null}
                {exchange.cors?.diagnosis ? (
                  <span className="tag tag-cors">
                    <span aria-hidden="true">⊘ </span>
                    {t("traffic_cors_blocked")}
                  </span>
                ) : null}
                {exchange.cors?.relaxed && !exchange.cors.relaxed.errorKey ? (
                  <span className="tag tag-relaxed">
                    <span aria-hidden="true">⇄ </span>
                    {t("traffic_cors_relaxed")}
                  </span>
                ) : null}
                {pausedIds?.has(exchange.id) ? (
                  <span className="tag tag-paused">
                    <span aria-hidden="true">⏸ </span>
                    {t("traffic_paused")}
                  </span>
                ) : null}
                {exchange.repeater ? (
                  <span className="tag tag-repeater">{t("traffic_repeater")}</span>
                ) : null}
                {exchange.isPreflight ? (
                  <span className="tag">{t("traffic_preflight")}</span>
                ) : null}
                <span className="path mono">{path}</span> <span className="host">{origin}</span>
              </span>
              <span role="gridcell" aria-colindex={2} className="cell cell-method">
                {exchange.method}
              </span>
              <span
                role="gridcell"
                aria-colindex={3}
                className="cell cell-status"
                data-status-class={exchange.status === null ? "none" : String(exchange.status)[0]}
              >
                {formatStatus(exchange.status, exchange.state)}
              </span>
              {compact ? null : (
                <>
                  <span role="gridcell" aria-colindex={4} className="cell cell-type">
                    {exchange.resourceType}
                  </span>
                  <span role="gridcell" aria-colindex={5} className="cell cell-size">
                    {formatBytes(exchange.encodedSize)}
                  </span>
                  <span role="gridcell" aria-colindex={6} className="cell cell-time">
                    {formatDuration(exchange.durationMs)}
                  </span>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
