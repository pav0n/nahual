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
import { IconButton } from "../common/IconButton.tsx";
import { Toolbar } from "../common/Toolbar.tsx";
import { ModeSwitch } from "./ModeSwitch.tsx";
import { RepeaterOutput, type OutputTabId } from "./RepeaterOutput.tsx";
import { REPEATER_TABS_PREFIX, RepeaterTabs } from "./RepeaterTabs.tsx";
import { RequestEditor } from "./RequestEditor.tsx";

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
  /** Pestaña de la salida por pestaña del repeater. */
  const [outputTab, setOutputTab] = useState<Record<string, OutputTabId>>({});
  /** Diff abierto por pestaña (FR-022). */
  const [comparing, setComparing] = useState<
    Record<string, { before: SideRef; after: SideRef; seq: number }>
  >({});

  if (!tab) {
    return (
      <div className="repeater">
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

  const showTab = (id: OutputTabId) => setOutputTab((current) => ({ ...current, [tab.id]: id }));
  const open = (before: SideRef, after: SideRef) => {
    setComparing((current) => ({
      ...current,
      [tab.id]: { before, after, seq: (current[tab.id]?.seq ?? 0) + 1 },
    }));
    showTab("diff");
  };

  const send = () => {
    if (tab.mode === "page" && pageUnavailable) return;
    if (!validation.ok) {
      setShowIssues(tab.id);
      return;
    }
    setShowIssues(null);
    setSelected((current) => ({ ...current, [tab.id]: "" }));
    if (outputTab[tab.id] !== "headers") showTab("response");
    void sendRepeaterTab(tab.id);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!matchesShortcut(SEND_SHORTCUT, event)) return;
    event.preventDefault();
    event.stopPropagation();
    send();
  };

  return (
    <div className="repeater" onKeyDown={onKeyDown}>
      <RepeaterTabs />
      <TabPanel idPrefix={REPEATER_TABS_PREFIX} id={tab.id} hidden={false}>
        <Toolbar label={t("repeater_toolbar_label")} className="repeater-toolbar">
          <ModeSwitch
            mode={tab.mode}
            unavailable={pageUnavailable}
            site={tab.site}
            onChange={(mode) => store().setRepeaterMode(tab.id, mode)}
          />
          <span className="toolbar-spacer" />
          <IconButton
            icon="export"
            label={t("action_export_as")}
            onClick={() =>
              store().openExport({ kind: "repeater", tabId: tab.id, sendId: shown?.sendId ?? null })
            }
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
        </Toolbar>
        {issues.length > 0 ? (
          <p role="alert" className="alert repeater-alert">
            {t("repeater_error_invalid_request")}
          </p>
        ) : null}
        <SplitPane
          prefKey="repeater"
          label={t("repeater_divider")}
          minStart={260}
          minEnd={260}
          start={
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
          }
          end={
            <RepeaterOutput
              tab={tab}
              shown={shown}
              current={outputTab[tab.id] ?? "response"}
              onTab={showTab}
              comparing={comparing[tab.id] ?? null}
              onCompare={open}
              onCloseDiff={() => {
                setComparing((current) =>
                  Object.fromEntries(Object.entries(current).filter(([id]) => id !== tab.id)),
                );
                showTab("response");
              }}
              onSelectSend={(sendId) =>
                setSelected((current) => ({ ...current, [tab.id]: sendId }))
              }
            />
          }
        />
      </TabPanel>
    </div>
  );
}
