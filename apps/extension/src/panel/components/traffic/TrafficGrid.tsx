import type { CapturedExchange } from "@nahual/domain";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { t } from "../../../shared/i18n.ts";
import { formatBytes, formatDuration, formatStatus } from "../../format.ts";

const ROW_HEIGHT = 28;
const COLUMNS = ["method", "url", "status", "type", "size", "time"] as const;

interface Props {
  exchanges: CapturedExchange[];
  selectedId: string | null;
  onOpen(id: string): void;
}

/**
 * Lista de tráfico virtualizada (research R13): patrón grid de APG con `aria-rowcount` total y
 * `aria-rowindex` por fila, para que un lector de pantalla sepa dónde está aunque solo se
 * rendericen las filas visibles. Flechas, Inicio/Fin y RePág/AvPág mueven la fila activa;
 * `Enter` abre el detalle.
 */
export function TrafficGrid({ exchanges, selectedId, onOpen }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  // Foco pendiente en la fila activa: puede no estar renderizada hasta que el virtualizador
  // desplace la lista, así que se reintenta en cada render.
  const focusPending = useRef(false);
  const activeIndex = Math.min(active, Math.max(0, exchanges.length - 1));

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

  return (
    <div
      ref={scrollRef}
      className="grid-scroll"
      role="grid"
      aria-label={t("traffic_grid_label")}
      aria-rowcount={exchanges.length + 1}
      aria-colcount={COLUMNS.length}
      onKeyDown={onKeyDown}
    >
      <div role="row" aria-rowindex={1} className="grid-row grid-head">
        {COLUMNS.map((column, i) => (
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
          return (
            <div
              key={exchange.id}
              role="row"
              data-index={item.index}
              aria-rowindex={item.index + 2}
              aria-selected={exchange.id === selectedId}
              tabIndex={item.index === activeIndex ? 0 : -1}
              className="grid-row"
              data-state={exchange.state}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                height: ROW_HEIGHT,
                transform: `translateY(${item.start}px)`,
              }}
              onClick={() => {
                setActive(item.index);
                onOpen(exchange.id);
              }}
              onFocus={() => setActive(item.index)}
            >
              <span role="gridcell" aria-colindex={1} className="cell cell-method">
                {exchange.method}
              </span>
              <span role="gridcell" aria-colindex={2} className="cell cell-url mono">
                {effect ? (
                  <span
                    className="rule-mark"
                    title={t("traffic_rule_applied", [
                      effect.ruleName,
                      t(`result_${effect.result}`),
                    ])}
                  >
                    <span aria-hidden="true">◆ </span>
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
                {exchange.isPreflight ? (
                  <span className="tag">{t("traffic_preflight")}</span>
                ) : null}
                {exchange.url}
              </span>
              <span
                role="gridcell"
                aria-colindex={3}
                className="cell cell-status"
                data-status-class={exchange.status === null ? "none" : String(exchange.status)[0]}
              >
                {formatStatus(exchange.status, exchange.state)}
              </span>
              <span role="gridcell" aria-colindex={4} className="cell cell-type">
                {exchange.resourceType}
              </span>
              <span role="gridcell" aria-colindex={5} className="cell cell-size">
                {formatBytes(exchange.encodedSize)}
              </span>
              <span role="gridcell" aria-colindex={6} className="cell cell-time">
                {formatDuration(exchange.durationMs)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
