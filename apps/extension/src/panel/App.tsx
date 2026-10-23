import { useEffect } from "react";
import { t } from "../shared/i18n.ts";
import { toggleAttach } from "./attach-control.ts";
import { command } from "./commands.ts";
import { endRelaxation } from "./cors-commands.ts";
import { RelaxIndicator } from "./components/cors/RelaxIndicator.tsx";
import { updateSettings } from "./settings-commands.ts";
import { TabPanel, Tabs } from "./components/common/Tabs.tsx";
import { ToastRegion } from "./components/common/Toast.tsx";
import { Notices } from "./components/Notices.tsx";
import { Onboarding } from "./components/Onboarding.tsx";
import { useContinueAll } from "./components/queue/PauseQueue.tsx";
import { QueueView } from "./components/queue/QueueView.tsx";
import { RulesView } from "./components/rules/RulesView.tsx";
import { SettingsPanel } from "./components/SettingsPanel.tsx";
import { StatusBar } from "./components/StatusBar.tsx";
import { SEARCH_INPUT_ID } from "./components/traffic/Filters.tsx";
import { TrafficView } from "./components/traffic/TrafficView.tsx";
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
  const continueAll = useContinueAll();

  useShortcuts({
    toggleAttach,
    continueSelected: () => {
      const { paused, selectedPausedId } = usePanelStore.getState();
      const item = paused.find((p) => p.pausedId === selectedPausedId) ?? paused[0];
      if (item) void command("resolvePaused", { pausedId: item.pausedId, action: "continue" });
    },
    togglePauseNahual: () => {
      const settings = usePanelStore.getState().settings;
      if (settings) void updateSettings({ globalPaused: !settings.globalPaused });
    },
    continueAll: () => {
      if (usePanelStore.getState().paused.length > 0) continueAll.request();
    },
    endRelaxations: () => {
      if (usePanelStore.getState().relaxations.length > 0) void endRelaxation();
    },
    focusSearch: () => {
      usePanelStore.getState().setTab("traffic");
      // La pestaña se monta en el mismo ciclo: se enfoca en el siguiente.
      requestAnimationFrame(() => document.getElementById(SEARCH_INPUT_ID)?.focus());
    },
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
      <RelaxIndicator />
      <SettingsPanel />
      <Notices />
      <Tabs idPrefix={TABS} label={t("tabs_label")} tabs={tabs} selected={tab} onSelect={setTab} />
      <TabPanel idPrefix={TABS} id="traffic" hidden={tab !== "traffic"}>
        <TrafficView />
      </TabPanel>
      <TabPanel idPrefix={TABS} id="rules" hidden={tab !== "rules"}>
        <RulesView />
      </TabPanel>
      <TabPanel idPrefix={TABS} id="queue" hidden={tab !== "queue"}>
        <QueueView continueAll={continueAll} />
      </TabPanel>
      {continueAll.dialog}
      <Onboarding />
      <ToastRegion />
    </main>
  );
}
