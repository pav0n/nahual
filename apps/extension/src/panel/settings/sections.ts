import type { ComponentType } from "react";
import { CorsSettings } from "../components/cors/CorsSettings.tsx";
import { GeneralSettings } from "./GeneralSettings.tsx";
import { PauseSettings } from "./PauseSettings.tsx";
import { lazySection } from "./lazy-section.tsx";
import { ShortcutsList } from "./ShortcutsList.tsx";

export interface SettingsSectionEntry {
  id: string;
  labelKey: string;
  /** Texto ya traducido; solo lo usa el gancho del build de pruebas (research R13). */
  label?: string;
  render: ComponentType;
}

/**
 * Secciones de Ajustes en el orden de su navegación (004, contracts/panel-shell.md, FR-014/029);
 * 007 añade `profiles` y `data`.
 */
export const SETTINGS_SECTIONS: SettingsSectionEntry[] = [
  { id: "general", labelKey: "settings_section_general", render: GeneralSettings },
  { id: "pause", labelKey: "settings_section_pause", render: PauseSettings },
  { id: "cors", labelKey: "settings_section_cors", render: CorsSettings },
  { id: "shortcuts", labelKey: "settings_section_shortcuts", render: ShortcutsList },
  // 007: perfiles (FR-023) e "Importar y exportar" (FR-026 a FR-033).
  // Se cargan al abrirlas: no entran en la carga inicial del panel (T069).
  {
    id: "profiles",
    labelKey: "profile_settings_title",
    render: lazySection(() =>
      import("../components/profiles/ProfilesSettings.tsx").then((m) => ({
        default: m.ProfilesSettings,
      })),
    ),
  },
  {
    id: "data",
    labelKey: "config_section_title",
    render: lazySection(() =>
      import("../components/data/DataSettings.tsx").then((m) => ({ default: m.DataSettings })),
    ),
  },
];
