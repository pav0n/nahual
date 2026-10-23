import { useEffect } from "react";
import { t } from "../shared/i18n.ts";
import { command } from "./commands.ts";
import { EmptyState } from "./components/common/EmptyState.tsx";
import { TabPanel, Tabs } from "./components/common/Tabs.tsx";
import { ToastRegion } from "./components/common/Toast.tsx";
import { Notices } from "./components/Notices.tsx";
import { StatusBar } from "./components/StatusBar.tsx";
import { usePanelStore } from "./store/index.ts";
import type { PanelTab } from "./store/ui.ts";
import "./theme.css";
import { applyTheme } from "./theme.ts";
import { useShortcuts } from "./use-shortcuts.ts";
import { useSwConnection } from "./use-sw-connection.ts";

const TABS = "nahual";

export function App({ tabId }: { tabId: number | null }) {
  useSwConnection(tabId);
  useEffect(applyTheme, []);
  const tab = usePanelStore((s) => s.tab);
  const setTab = usePanelStore((s) => s.setTab);
  const session = usePanelStore((s) => s.session);
  const queueSize = session?.queueSize ?? 0;

  useShortcuts({
    toggleAttach: () => {
      const state = usePanelStore.getState().session;
      if (!state || state.status === "attaching") return;
      if (state.status === "attached") void command("detach", {});
      else void command(state.status === "conflict" || state.cause ? "reconnect" : "attach", {});
    },
    continueSelected: () => {},
  });

  if (tabId === null) {
    return (
      <main>
        <h1>{t("panelTitle")}</h1>
        <p role="alert" className="alert">
          {t("error_no_tab")}
        </p>
      </main>
    );
  }

  const tabs: { id: PanelTab; label: string }[] = [
    { id: "traffic", label: t("tab_traffic") },
    { id: "rules", label: t("tab_rules") },
    {
      id: "queue",
      label: queueSize > 0 ? t("tab_queue_count", String(queueSize)) : t("tab_queue"),
    },
  ];

  return (
    <main>
      <h1>{t("panelTitle")}</h1>
      <StatusBar />
      <Notices />
      <Tabs idPrefix={TABS} label={t("tabs_label")} tabs={tabs} selected={tab} onSelect={setTab} />
      <TabPanel idPrefix={TABS} id="traffic" hidden={tab !== "traffic"}>
        <EmptyState title={t("empty_traffic_title")}>{t("empty_traffic_body")}</EmptyState>
      </TabPanel>
      <TabPanel idPrefix={TABS} id="rules" hidden={tab !== "rules"}>
        <EmptyState title={t("empty_rules_title")}>{t("empty_rules_body")}</EmptyState>
      </TabPanel>
      <TabPanel idPrefix={TABS} id="queue" hidden={tab !== "queue"}>
        <EmptyState title={t("empty_queue_title")}>{t("empty_queue_body")}</EmptyState>
      </TabPanel>
      <ToastRegion />
    </main>
  );
}
