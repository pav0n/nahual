import type { PausedEdit, PausedItemView } from "@nahual/domain";
import type { SliceCreator } from "./types.ts";

/** Edición en curso de un item de la cola: lo que el dev cambió respecto al original. */
export type PausedDraft = PausedEdit;

export interface QueueSlice {
  /** Pausados de la pestaña en orden de llegada (FR-023). */
  paused: PausedItemView[];
  selectedPausedId: string | null;
  drafts: Record<string, PausedDraft>;
  addPaused(view: PausedItemView): void;
  /** Devuelve el borrador que tenía, si lo había (para avisar que no se aplicó). */
  removePaused(pausedId: string): PausedDraft | undefined;
  clearPaused(): void;
  selectPaused(pausedId: string | null): void;
  setDraft(pausedId: string, draft: PausedDraft | null): void;
}

const withoutKey = <T>(record: Record<string, T>, key: string) =>
  Object.fromEntries(Object.entries(record).filter(([k]) => k !== key));

export const createQueueSlice: SliceCreator<QueueSlice> = (set, get) => ({
  paused: [],
  selectedPausedId: null,
  drafts: {},
  addPaused: (view) =>
    set((s) => {
      s.paused = [...s.paused.filter((p) => p.pausedId !== view.pausedId), view].sort(
        (a, b) => a.pausedAt - b.pausedAt,
      );
      s.selectedPausedId ??= view.pausedId;
    }),
  removePaused: (pausedId) => {
    const draft = get().drafts[pausedId];
    set((s) => {
      const index = s.paused.findIndex((p) => p.pausedId === pausedId);
      s.paused = s.paused.filter((p) => p.pausedId !== pausedId);
      s.drafts = withoutKey(s.drafts, pausedId);
      if (s.selectedPausedId === pausedId) {
        // Se selecciona el siguiente que quede (o el anterior si era el último).
        s.selectedPausedId = (s.paused[index] ?? s.paused[index - 1])?.pausedId ?? null;
      }
    });
    return draft;
  },
  clearPaused: () =>
    set((s) => {
      s.paused = [];
      s.drafts = {};
      s.selectedPausedId = null;
    }),
  selectPaused: (pausedId) =>
    set((s) => {
      s.selectedPausedId = pausedId;
    }),
  setDraft: (pausedId, draft) =>
    set((s) => {
      if (draft === null || Object.keys(draft).length === 0)
        s.drafts = withoutKey(s.drafts, pausedId);
      else s.drafts[pausedId] = draft;
    }),
});
