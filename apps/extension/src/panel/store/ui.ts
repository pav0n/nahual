import type { SliceCreator } from "./types.ts";

export type PanelTab = "traffic" | "rules" | "queue";

export interface Toast {
  id: number;
  messageKey: string;
  params?: string[];
  /** Acción opcional ("Deshacer"). */
  actionKey?: string;
  onAction?: () => void;
}

export interface UiSlice {
  tab: PanelTab;
  toasts: Toast[];
  setTab(tab: PanelTab): void;
  pushToast(toast: Omit<Toast, "id">, timeoutMs?: number): number;
  dismissToast(id: number): void;
}

let toastSeq = 0;

export const createUiSlice: SliceCreator<UiSlice> = (set, get) => ({
  tab: "traffic",
  toasts: [],
  setTab: (tab) =>
    set((s) => {
      s.tab = tab;
    }),
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
