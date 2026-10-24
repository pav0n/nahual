import type { ComponentType } from "react";
import type { PanelStore } from "../store/index.ts";
import type { PanelSection } from "../store/ui.ts";

export interface SectionEntry {
  id: PanelSection;
  labelKey: string;
  /** Texto ya traducido; solo lo usa el gancho del build de pruebas (research R13). */
  label?: string;
  /** Contenido de la sección; las de 002–004 las monta `App`. */
  render?: ComponentType;
  /** `null` o `0` ⇒ sin contador (FR-011). */
  count(state: PanelStore): number | null;
  countTone: "neutral" | "attention";
}

/**
 * Secciones de la barra superior (004, contracts/panel-shell.md); 005 añade `repeater`. El orden
 * del arreglo es el de la barra.
 */
export const SECTIONS: SectionEntry[] = [
  { id: "traffic", labelKey: "tab_traffic", count: () => null, countTone: "neutral" },
  {
    id: "rules",
    labelKey: "tab_rules",
    count: (s) => s.rules.filter((r) => r.enabled && r.site === s.session?.site).length,
    countTone: "neutral",
  },
  { id: "paused", labelKey: "tab_paused", count: (s) => s.paused.length, countTone: "attention" },
];
