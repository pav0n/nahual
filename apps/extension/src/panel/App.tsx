import { useEffect } from "react";
import { t } from "../shared/i18n.ts";
import { toggleAttach } from "./attach-control.ts";
import { command } from "./commands.ts";
import { TabPanel } from "./components/common/Tabs.tsx";
import { ToastRegion } from "./components/common/Toast.tsx";
import { CorsReportDialog } from "./components/cors/CorsReport.tsx";
import { Onboarding } from "./components/Onboarding.tsx";
import { useContinueAll } from "./components/queue/PauseQueue.tsx";
import { QueueView } from "./components/queue/QueueView.tsx";
import { RulesView } from "./components/rules/RulesView.tsx";
import { SEARCH_INPUT_ID } from "./components/traffic/Filters.tsx";
import { TrafficView } from "./components/traffic/TrafficView.tsx";
import { endRelaxation } from "./cors-commands.ts";
import { SettingsDialog } from "./settings/SettingsDialog.tsx";
import { updateSettings } from "./settings-commands.ts";
import { AppShell } from "./shell/AppShell.tsx";
import { SECTIONS } from "./shell/sections.ts";
import { SECTIONS_PREFIX } from "./shell/TopBar.tsx";
import { usePanelStore } from "./store/index.ts";
import "./theme.css";
import { applyTheme } from "./theme.ts";
import { useShortcuts } from "./use-shortcuts.ts";
import { useSwConnection } from "./use-sw-connection.ts";

export function App({ tabId }: { tabId: number | null }) {
  useSwConnection(tabId);
  useEffect(applyTheme, []);
  const section = usePanelStore((s) => s.section);
  const slotsVersion = usePanelStore((s) => s.slotsVersion);
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
      usePanelStore.getState().setSection("traffic");
      // La sección se monta en el mismo ciclo: se enfoca en el siguiente.
      requestAnimationFrame(() => document.getElementById(SEARCH_INPUT_ID)?.focus());
    },
    // 007: los conectan "Exportar como…" (T026) y el selector de perfil (T046).
    exportRequest: () => {},
    openProfileMenu: () => {},
  });

  if (tabId === null) {
    return (
      <main className="pane">
        <p role="alert" className="alert">
          {t("error_no_tab")}
        </p>
      </main>
    );
  }

  return (
    <AppShell
      key={slotsVersion}
      overlays={
        <>
          {continueAll.dialog}
          <SettingsDialog />
          <CorsReportDialog />
          <Onboarding />
          <ToastRegion />
        </>
      }
    >
      <TabPanel idPrefix={SECTIONS_PREFIX} id="traffic" hidden={section !== "traffic"}>
        <TrafficView />
      </TabPanel>
      <TabPanel idPrefix={SECTIONS_PREFIX} id="rules" hidden={section !== "rules"}>
        <RulesView />
      </TabPanel>
      <TabPanel idPrefix={SECTIONS_PREFIX} id="paused" hidden={section !== "paused"}>
        <QueueView continueAll={continueAll} />
      </TabPanel>
      {SECTIONS.flatMap(({ id, render: Section }) =>
        Section ? (
          <TabPanel key={id} idPrefix={SECTIONS_PREFIX} id={id} hidden={section !== id}>
            <Section />
          </TabPanel>
        ) : (
          []
        ),
      )}
    </AppShell>
  );
}
