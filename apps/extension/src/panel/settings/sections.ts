import type { ComponentType } from "react";
import { CorsSettings } from "../components/cors/CorsSettings.tsx";
import { GeneralSettings } from "./GeneralSettings.tsx";
import { PauseSettings } from "./PauseSettings.tsx";
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
];
