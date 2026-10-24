import { compileFilter, linkPreflights } from "@nahual/domain";
import { useMemo, useState } from "react";
import { t } from "../../../shared/i18n.ts";
import { usePanelStore } from "../../store/index.ts";
import { UNDO_CLEAR_MS } from "../../store/traffic.ts";
import { EmptyState } from "../common/EmptyState.tsx";
import { ExchangeDetail } from "./ExchangeDetail.tsx";
import { Filters, type ValidFilter } from "./Filters.tsx";
import { TrafficGrid } from "./TrafficGrid.tsx";

const NO_FILTER = compileFilter({ text: "", regex: "", status: "", types: [] }) as ValidFilter;

/** Pestaña de tráfico (historia 1): filtros, lista, detalle y limpiar con deshacer. */
export function TrafficView() {
  const exchanges = usePanelStore((s) => s.exchanges);
  const atCap = usePanelStore((s) => s.atCap);
  const status = usePanelStore((s) => s.session?.status ?? "detached");
  const clear = usePanelStore((s) => s.clearTraffic);
  const undo = usePanelStore((s) => s.undoClearTraffic);
  const pushToast = usePanelStore((s) => s.pushToast);
  const [filter, setFilter] = useState<ValidFilter>(NO_FILTER);
  const selectedId = usePanelStore((s) => s.selectedExchangeId);
  const setSelectedId = usePanelStore((s) => s.selectExchange);

  const shown = useMemo(() => exchanges.filter((e) => filter.matches(e)), [exchanges, filter]);
  const selected =
    selectedId === null ? null : (exchanges.find((e) => e.id === selectedId) ?? null);
  // Request ⇒ preflight y su inverso, para ir y volver desde el detalle (FR-006).
  const links = useMemo(() => {
    const forward = linkPreflights(exchanges);
    const both = new Map(forward);
    for (const [request, preflight] of forward) both.set(preflight, request);
    return both;
  }, [exchanges]);

  const onClear = () => {
    clear();
    setSelectedId(null);
    pushToast(
      { messageKey: "toast_traffic_cleared", actionKey: "action_undo", onAction: () => undo() },
      UNDO_CLEAR_MS,
    );
  };

  return (
    <>
      <Filters shown={shown.length} total={exchanges.length} onChange={setFilter} />
      <div className="row">
        <button type="button" onClick={onClear} disabled={exchanges.length === 0}>
          {t("action_clear_traffic")}
        </button>
        {atCap ? <p className="muted grow">{t("traffic_at_cap")}</p> : null}
      </div>
      {exchanges.length === 0 ? (
        <EmptyState title={t("empty_traffic_title")}>
          {t(status === "attached" ? "empty_traffic_reload" : "empty_traffic_body")}
        </EmptyState>
      ) : shown.length === 0 ? (
        <EmptyState title={t("empty_traffic_filtered_title")}>
          {t("empty_traffic_filtered_body")}
        </EmptyState>
      ) : (
        <TrafficGrid exchanges={shown} selectedId={selectedId} onOpen={setSelectedId} />
      )}
      {selected ? (
        <ExchangeDetail
          key={selected.id}
          exchange={selected}
          relatedId={links.get(selected.id) ?? null}
          onOpen={setSelectedId}
          onClose={() => setSelectedId(null)}
        />
      ) : null}
    </>
  );
}
