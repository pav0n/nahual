import { validateRepeaterRequest, type RepeaterSend } from "@nahual/domain";
import { useState, type KeyboardEvent } from "react";
import { t } from "../../../shared/i18n.ts";
import { cancelRepeaterSend, sendRepeaterTab } from "../../repeater/send.ts";
import { matchesShortcut, shortcutAria, shortcutById, labelOf } from "../../shortcuts.ts";
import { usePanelStore } from "../../store/index.ts";
import { EmptyState } from "../common/EmptyState.tsx";
import { SplitPane } from "../common/SplitPane.tsx";
import { TabPanel } from "../common/Tabs.tsx";
import type { SideRef } from "../../repeater/compare.ts";
import { DiffView } from "./DiffView.tsx";
import { ModeSwitch } from "./ModeSwitch.tsx";
import { PastedResponse } from "./PastedResponse.tsx";
import { REPEATER_TABS_PREFIX, RepeaterTabs } from "./RepeaterTabs.tsx";
import { RequestEditor } from "./RequestEditor.tsx";
import { SendHistory } from "./SendHistory.tsx";
import { SendResult } from "./SendResult.tsx";

const SEND_SHORTCUT = shortcutById("repeaterSend");

/**
 * Sección Repeater (005, FR-003): pestañas con un request editable, su envío y su historial. Sin
 * pestañas, explica cómo crear una y que no se guardan al cerrar DevTools (FR-020a).
 */
export function RepeaterView() {
  const tabs = usePanelStore((s) => s.repeaterTabs);
  const activeId = usePanelStore((s) => s.activeRepeaterTab);
  const session = usePanelStore((s) => s.session);
  const tab = tabs.find((x) => x.id === activeId) ?? null;
  const [showIssues, setShowIssues] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, string>>({});
  /** Diff abierto por pestaña (FR-022). */
  const [comparing, setComparing] = useState<
    Record<string, { before: SideRef; after: SideRef; seq: number }>
  >({});

  if (!tab) {
    return (
      <div className="pane repeater">
        <RepeaterTabs />
        <EmptyState title={t("repeater_empty_title")}>{t("repeater_empty_body")}</EmptyState>
      </div>
    );
  }

  const store = usePanelStore.getState;
  // FR-012: adjunto y en el sitio de la pestaña (una pestaña sin sitio toma el actual).
  const pageUnavailable =
    session?.status !== "attached"
      ? "not_attached"
      : tab.site !== null && session.site !== tab.site
        ? "other_site"
        : null;
  const validation = validateRepeaterRequest(tab.draft);
  const issues = showIssues === tab.id && !validation.ok ? validation.issues : [];
  const latest = tab.sends[0] ?? null;
  const pending = latest?.state === "pending";
  const shown: RepeaterSend | null = tab.sends.find((s) => s.sendId === selected[tab.id]) ?? latest;

  const open = (before: SideRef, after: SideRef) =>
    setComparing((current) => ({
      ...current,
      [tab.id]: { before, after, seq: (current[tab.id]?.seq ?? 0) + 1 },
    }));

  const send = () => {
    if (tab.mode === "page" && pageUnavailable) return;
    if (!validation.ok) {
      setShowIssues(tab.id);
      return;
    }
    setShowIssues(null);
    setSelected((current) => ({ ...current, [tab.id]: "" }));
    void sendRepeaterTab(tab.id);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!matchesShortcut(SEND_SHORTCUT, event)) return;
    event.preventDefault();
    event.stopPropagation();
    send();
  };

  return (
    <div className="pane repeater" onKeyDown={onKeyDown}>
      <RepeaterTabs />
      <TabPanel idPrefix={REPEATER_TABS_PREFIX} id={tab.id} hidden={false}>
        <div className="row repeater-toolbar">
          <ModeSwitch
            mode={tab.mode}
            unavailable={pageUnavailable}
            site={tab.site}
            onChange={(mode) => store().setRepeaterMode(tab.id, mode)}
          />
          {pending && latest ? (
            <button type="button" onClick={() => cancelRepeaterSend(latest.sendId)}>
              {t("action_cancel")}
            </button>
          ) : null}
          <button
            type="button"
            className="primary"
            aria-keyshortcuts={shortcutAria(SEND_SHORTCUT)}
            title={labelOf("repeaterSend")}
            onClick={send}
          >
            {t("repeater_send")}
          </button>
        </div>
        {issues.length > 0 ? (
          <p role="alert" className="alert">
            {t("repeater_error_invalid_request")}
          </p>
        ) : null}
        <SplitPane
          prefKey="repeater"
          label={t("repeater_divider")}
          minStart={260}
          minEnd={260}
          start={
            <div className="pane">
              <RequestEditor
                draft={tab.draft}
                issues={issues}
                onChange={(draft) => store().setRepeaterDraft(tab.id, draft)}
                onBodyReplaced={(undo) =>
                  store().pushToast(
                    {
                      messageKey: "repeater_body_replaced",
                      actionKey: "action_undo",
                      onAction: () => {
                        const current = usePanelStore
                          .getState()
                          .repeaterTabs.find((x) => x.id === tab.id);
                        if (current)
                          usePanelStore
                            .getState()
                            .setRepeaterDraft(tab.id, { ...current.draft, body: undo });
                      },
                    },
                    10_000,
                  )
                }
              />
            </div>
          }
          end={
            // Enfocable: si solo hay texto, la región con scroll se alcanza con teclado (axe).
            <div
              className="pane"
              tabIndex={0}
              role="region"
              aria-label={t("repeater_output_label")}
            >
              {comparing[tab.id] ? (
                <DiffView
                  key={comparing[tab.id]?.seq}
                  tab={tab}
                  initial={comparing[tab.id] as { before: SideRef; after: SideRef }}
                  onClose={() =>
                    setComparing((current) =>
                      Object.fromEntries(Object.entries(current).filter(([id]) => id !== tab.id)),
                    )
                  }
                />
              ) : shown ? (
                <SendResult
                  send={shown}
                  onUsePage={() => store().setRepeaterMode(tab.id, "page")}
                />
              ) : (
                <p className="muted">{t("repeater_no_result")}</p>
              )}
              <PastedResponse
                key={`${tab.id}-${tab.pasted?.text.length ?? 0}`}
                pasted={tab.pasted}
                onChange={(pasted) => store().setRepeaterPasted(tab.id, pasted)}
              />
              {tab.pasted && tab.sends.some((s) => s.state !== "pending") ? (
                <button
                  type="button"
                  className="link"
                  onClick={() => {
                    const last = tab.sends.find((s) => s.state !== "pending");
                    if (last) open({ kind: "pasted" }, { kind: "send", sendId: last.sendId });
                  }}
                >
                  {t("diff_compare_pasted")}
                </button>
              ) : null}
              <h3>{t("repeater_history_title")}</h3>
              <SendHistory
                sends={tab.sends}
                droppedCount={tab.droppedCount}
                selectedId={shown?.sendId ?? null}
                onSelect={(sendId) => setSelected((current) => ({ ...current, [tab.id]: sendId }))}
                onLoad={(s) => store().setRepeaterDraft(tab.id, s.request)}
                onCompare={open}
                hasOriginal={tab.source !== null}
              />
            </div>
          }
        />
      </TabPanel>
    </div>
  );
}
