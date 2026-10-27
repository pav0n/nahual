import { rulesThatApply } from "../profiles/select.ts";
import type { ComponentType } from "react";
import { RepeaterView } from "../components/repeater/RepeaterView.tsx";
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
    // 007 (FR-024): con un perfil activo, solo las reglas que actúan.
    count: (s) =>
      rulesThatApply(s.rules, s.session?.site ?? null, s.session?.activeProfileId ?? null).length,
    countTone: "neutral",
  },
  { id: "paused", labelKey: "tab_paused", count: (s) => s.paused.length, countTone: "attention" },
  // 005: pestañas abiertas del repeater (FR-003).
  {
    id: "repeater",
    labelKey: "tab_repeater",
    count: (s) => s.repeaterTabs.length,
    countTone: "neutral",
    render: RepeaterView,
  },
];
