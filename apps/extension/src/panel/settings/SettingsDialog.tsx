import { t } from "../../shared/i18n.ts";
import { Dialog } from "../components/common/Dialog.tsx";
import { TabPanel, Tabs } from "../components/common/Tabs.tsx";
import { usePanelStore } from "../store/index.ts";
import { SETTINGS_SECTIONS } from "./sections.ts";

const PREFIX = "settings";

/**
 * Ajustes como diálogo modal encima del panel (004, FR-014): no desplaza la lista ni el detalle y
 * cada campo se guarda al confirmarse, sin botón de aplicar (FR-015).
 */
export function SettingsDialog() {
  const open = usePanelStore((s) => s.settingsOpen);
  const setOpen = usePanelStore((s) => s.setSettingsOpen);
  const section = usePanelStore((s) => s.settingsSection) ?? SETTINGS_SECTIONS[0]?.id ?? "general";
  const setSection = usePanelStore((s) => s.setSettingsSection);

  return (
    <Dialog
      open={open}
      title={t("settings_title")}
      onClose={() => setOpen(false)}
      className="settings"
    >
      <div className="settings-layout">
        <Tabs
          idPrefix={PREFIX}
          label={t("settings_sections_label")}
          orientation="vertical"
          selected={section}
          onSelect={setSection}
          tabs={SETTINGS_SECTIONS.map((entry) => ({
            id: entry.id,
            label: entry.label ?? t(entry.labelKey),
          }))}
        />
        {SETTINGS_SECTIONS.map((entry) => (
          <TabPanel key={entry.id} idPrefix={PREFIX} id={entry.id} hidden={entry.id !== section}>
            <entry.render />
          </TabPanel>
        ))}
      </div>
    </Dialog>
  );
}
