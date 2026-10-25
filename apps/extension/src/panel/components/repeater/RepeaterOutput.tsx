import type { RepeaterSend } from "@nahual/domain";
import { t } from "../../../shared/i18n.ts";
import type { SideRef } from "../../repeater/compare.ts";
import type { RepeaterTab } from "../../repeater/types.ts";
import { usePanelStore } from "../../store/index.ts";
import { TabPanel, Tabs } from "../common/Tabs.tsx";
import { DiffView } from "./DiffView.tsx";
import { PastedResponse } from "./PastedResponse.tsx";
import { SendHistory } from "./SendHistory.tsx";
import { SendBody, SendHeaders, SendSummary } from "./SendResult.tsx";

export type OutputTabId = "response" | "headers" | "history" | "diff";

const PREFIX = "repeater-output";

/**
 * Salida de una pestaña del repeater con la forma del detalle de Tráfico (004): cabecera con el
 * request mostrado y sus acciones de comparación, pestañas Response, Headers, Historial y, con un
 * diff abierto, Diff (FR-015 a FR-019, FR-022).
 */
export function RepeaterOutput({
  tab,
  shown,
  current,
  onTab,
  comparing,
  onCompare,
  onCloseDiff,
  onSelectSend,
}: {
  tab: RepeaterTab;
  /** Envío que se muestra: el elegido en el historial o el último. */
  shown: RepeaterSend | null;
  current: OutputTabId;
  onTab(id: OutputTabId): void;
  comparing: { before: SideRef; after: SideRef; seq: number } | null;
  onCompare(before: SideRef, after: SideRef): void;
  onCloseDiff(): void;
  onSelectSend(sendId: string): void;
}) {
  const store = usePanelStore.getState;
  const tabs: { id: OutputTabId; label: string }[] = [
    { id: "response", label: t("detail_tab_response") },
    { id: "headers", label: t("detail_tab_headers") },
    { id: "history", label: t("repeater_history_title") },
    ...(comparing ? [{ id: "diff" as const, label: t("diff_title") }] : []),
  ];
  const selected = tabs.some((x) => x.id === current) ? current : "response";
  const done = shown !== null && shown.state !== "pending";
  const index = shown ? tab.sends.findIndex((s) => s.sendId === shown.sendId) : -1;
  const previous = index >= 0 ? (tab.sends[index + 1] ?? null) : null;
  const lastDone = tab.sends.find((s) => s.state !== "pending") ?? null;
  const shownRef: SideRef = { kind: "send", sendId: shown?.sendId ?? "" };

  return (
    <section className="detail repeater-output" aria-label={t("repeater_output_label")}>
      <div className="detail-header">
        <h2 className={shown ? "mono" : undefined} title={shown?.request.url}>
          {shown ? `${shown.request.method} ${shown.request.url}` : t("repeater_result_label")}
        </h2>
        {done && tab.source !== null ? (
          <button type="button" onClick={() => onCompare({ kind: "original" }, shownRef)}>
            {t("diff_compare_original")}
          </button>
        ) : null}
        {done && previous ? (
          <button
            type="button"
            onClick={() => onCompare({ kind: "send", sendId: previous.sendId }, shownRef)}
          >
            {t("diff_compare_previous")}
          </button>
        ) : null}
      </div>
      <Tabs<OutputTabId>
        idPrefix={PREFIX}
        label={t("detail_tabs_label")}
        tabs={tabs}
        selected={selected}
        onSelect={onTab}
      />
      <div className="detail-body">
        {selected === "response" || selected === "headers" ? (
          <div className="send-result" aria-label={t("repeater_result_label")} aria-live="polite">
            {shown ? (
              <SendSummary send={shown} onUsePage={() => store().setRepeaterMode(tab.id, "page")} />
            ) : (
              <p className="muted">{t("repeater_no_result")}</p>
            )}
            <TabPanel idPrefix={PREFIX} id="response" hidden={selected !== "response"}>
              {shown ? <SendBody send={shown} /> : null}
            </TabPanel>
            <TabPanel idPrefix={PREFIX} id="headers" hidden={selected !== "headers"}>
              {shown ? <SendHeaders send={shown} /> : null}
            </TabPanel>
          </div>
        ) : null}
        <TabPanel idPrefix={PREFIX} id="history" hidden={selected !== "history"}>
          <PastedResponse
            key={`${tab.id}-${tab.pasted?.text.length ?? 0}`}
            pasted={tab.pasted}
            onChange={(pasted) => store().setRepeaterPasted(tab.id, pasted)}
          />
          {tab.pasted && lastDone ? (
            <div className="row">
              <button
                type="button"
                onClick={() =>
                  onCompare({ kind: "pasted" }, { kind: "send", sendId: lastDone.sendId })
                }
              >
                {t("diff_compare_pasted")}
              </button>
            </div>
          ) : null}
          <SendHistory
            sends={tab.sends}
            droppedCount={tab.droppedCount}
            selectedId={shown?.sendId ?? null}
            onSelect={onSelectSend}
            onLoad={(s) => store().setRepeaterDraft(tab.id, s.request)}
          />
        </TabPanel>
        {comparing ? (
          <TabPanel idPrefix={PREFIX} id="diff" hidden={selected !== "diff"}>
            <DiffView key={comparing.seq} tab={tab} initial={comparing} onClose={onCloseDiff} />
          </TabPanel>
        ) : null}
      </div>
    </section>
  );
}
