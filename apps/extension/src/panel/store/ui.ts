import type { RuleDraft } from "@nahual/domain";
import type { SliceCreator } from "./types.ts";

/** Secciones de la barra superior (004, data-model `PanelSection`); 005 añade `repeater`. */
export type PanelSection = "traffic" | "rules" | "paused" | "repeater";

export interface Toast {
  id: number;
  messageKey: string;
  params?: string[];
  /** Acción opcional ("Deshacer"). */
  actionKey?: string;
  onAction?: () => void;
}

export interface UiSlice {
  section: PanelSection;
  toasts: Toast[];
  /** Onboarding reabierto desde "Ayuda" (FR-027). */
  helpOpen: boolean;
  /** Ajustes abiertos como diálogo (004, FR-014). */
  settingsOpen: boolean;
  /**
   * Request seleccionado en Tráfico: lo comparten la lista, el detalle, el menú contextual y
   * Pausados (004, plan "Sección activa y selección").
   */
  selectedExchangeId: string | null;
  /** Pestaña con la que abre el detalle pedido (CORS desde el preflight o desde una acción). */
  detailTab: string | null;
  /** Cambia con cada pestaña pedida: vuelve a abrir el detalle aunque sea el mismo request. */
  detailTabSeq: number;
  /** Intercambio cuyo detalle abre la confirmación de "Permitir CORS" (004 FR-024). */
  relaxRequestFor: string | null;
  /** Borrador que "Crear regla desde este request" deja para Reglas (FR-023). */
  incomingRuleDraft: RuleDraft | null;
  /** Cambia cuando el gancho de pruebas llena los lugares reservados: se vuelve a montar todo. */
  slotsVersion: number;
  bumpSlots(): void;
  setHelpOpen(open: boolean): void;
  setSettingsOpen(open: boolean): void;
  setSection(section: PanelSection): void;
  selectExchange(id: string | null, tab?: string): void;
  requestRelax(exchangeId: string | null): void;
  /** Deja el borrador para Reglas y cambia a esa sección; nada se guarda todavía. */
  openRuleDraft(draft: RuleDraft): void;
  /** Lo toma Reglas al abrir el editor; devuelve `null` si no hay ninguno. */
  consumeRuleDraft(): RuleDraft | null;
  pushToast(toast: Omit<Toast, "id">, timeoutMs?: number): number;
  dismissToast(id: number): void;
}

let toastSeq = 0;

export const createUiSlice: SliceCreator<UiSlice> = (set, get) => ({
  section: "traffic",
  toasts: [],
  helpOpen: false,
  settingsOpen: false,
  selectedExchangeId: null,
  detailTab: null,
  detailTabSeq: 0,
  relaxRequestFor: null,
  incomingRuleDraft: null,
  slotsVersion: 0,
  bumpSlots: () =>
    set((s) => {
      s.slotsVersion += 1;
    }),
  setHelpOpen: (open) =>
    set((s) => {
      s.helpOpen = open;
    }),
  setSettingsOpen: (open) =>
    set((s) => {
      s.settingsOpen = open;
    }),
  setSection: (section) =>
    set((s) => {
      s.section = section;
    }),
  selectExchange: (id, tab) =>
    set((s) => {
      s.selectedExchangeId = id;
      s.detailTab = tab ?? null;
      if (tab) s.detailTabSeq += 1;
      if (s.relaxRequestFor !== id) s.relaxRequestFor = null;
    }),
  requestRelax: (exchangeId) =>
    set((s) => {
      s.relaxRequestFor = exchangeId;
    }),
  openRuleDraft: (draft) =>
    set((s) => {
      s.incomingRuleDraft = draft;
      s.section = "rules";
    }),
  consumeRuleDraft: () => {
    const draft = get().incomingRuleDraft;
    if (draft)
      set((s) => {
        s.incomingRuleDraft = null;
      });
    return draft;
  },
  pushToast: (toast, timeoutMs = 10_000) => {
    const id = ++toastSeq;
    set((s) => {
      s.toasts.push({ ...toast, id });
    });
    setTimeout(() => get().dismissToast(id), timeoutMs);
    return id;
  },
  dismissToast: (id) =>
    set((s) => {
      s.toasts = s.toasts.filter((t) => t.id !== id);
    }),
});
