import { useShallow } from "zustand/react/shallow";
import { t } from "../../shared/i18n.ts";
import { IconButton } from "../components/common/IconButton.tsx";
import { Tabs } from "../components/common/Tabs.tsx";
import { updateSettings } from "../settings-commands.ts";
import { ariaOf, labelOf } from "../shortcuts.ts";
import { usePanelStore } from "../store/index.ts";
import { SECTIONS } from "./sections.ts";
import { STATUS_ITEMS } from "./status-items.ts";

export const SECTIONS_PREFIX = "nahual";

/**
 * Barra superior única (004, FR-010/011/025): a la izquierda las secciones con su contador; a la
 * derecha los indicadores de estado, "Pausar Nahual", Ajustes y Ayuda. Envuelve en lugar de hacer
 * scroll horizontal a 320 px.
 */
export function TopBar() {
  const counts = usePanelStore(useShallow((s) => SECTIONS.map((entry) => entry.count(s))));
  const section = usePanelStore((s) => s.section);
  const setSection = usePanelStore((s) => s.setSection);
  const settings = usePanelStore((s) => s.settings);
  const setSettingsOpen = usePanelStore((s) => s.setSettingsOpen);
  const setHelpOpen = usePanelStore((s) => s.setHelpOpen);
  const paused = settings?.globalPaused ?? false;

  return (
    <header className="topbar">
      <Tabs
        idPrefix={SECTIONS_PREFIX}
        label={t("tabs_label")}
        selected={section}
        onSelect={setSection}
        tabs={SECTIONS.map((entry, index) => {
          const count = counts[index];
          return {
            id: entry.id,
            label: (
              <>
                {entry.label ?? t(entry.labelKey)}
                {count ? (
                  <span
                    className="count-badge"
                    data-tone={
                      count > 0 && entry.countTone === "attention" ? "attention" : "neutral"
                    }
                  >
                    {count}
                  </span>
                ) : null}
              </>
            ),
          };
        })}
      />
      <div className="topbar-end">
        {STATUS_ITEMS.map(({ id, render: Item }) => (
          <Item key={id} />
        ))}
        <IconButton
          icon="pause"
          role="switch"
          aria-checked={paused}
          label={t("action_pause_nahual")}
          shortcut={labelOf("togglePauseNahual")}
          aria-keyshortcuts={ariaOf("togglePauseNahual")}
          disabled={settings === null}
          onClick={() => void updateSettings({ globalPaused: !paused })}
        />
        <IconButton
          icon="settings"
          label={t("settings_title")}
          onClick={() => setSettingsOpen(true)}
        />
        <IconButton icon="help" label={t("action_help")} onClick={() => setHelpOpen(true)} />
      </div>
    </header>
  );
}
