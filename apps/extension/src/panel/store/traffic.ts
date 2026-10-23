import { LIMITS, type CapturedExchange, type ExchangeUpdate } from "@nahual/domain";
import type { SliceCreator } from "./types.ts";

/** Tiempo para deshacer una limpieza del historial (FR-006). */
export const UNDO_CLEAR_MS = 10_000;

export interface TrafficSlice {
  /** Historial de la pestaña en orden de inicio; solo en memoria (FR-007). */
  exchanges: CapturedExchange[];
  /** Se descartó al menos una entrada por el tope de 2,000 (FR-005). */
  atCap: boolean;
  /** Lista limpiada que aún se puede recuperar. */
  cleared: { exchanges: CapturedExchange[]; until: number } | null;
  applyUpdates(updates: ExchangeUpdate[]): void;
  clearTraffic(): void;
  /** `false` si ya no se puede deshacer. */
  undoClearTraffic(): boolean;
  resetTraffic(): void;
}

function apply(list: CapturedExchange[], index: Map<string, number>, update: ExchangeUpdate) {
  const at = index.get(update.id);
  if (at === undefined) {
    if (update.kind !== "start") return false;
    list.push({ ...(update.fields as CapturedExchange), id: update.id, ruleEffects: [] });
    index.set(update.id, list.length - 1);
    return true;
  }
  const entry = list[at];
  if (!entry) return false;
  Object.assign(entry, update.fields);
  if (update.effect) entry.ruleEffects.push(update.effect);
  return false;
}

export const createTrafficSlice: SliceCreator<TrafficSlice> = (set, get) => ({
  exchanges: [],
  atCap: false,
  cleared: null,

  applyUpdates: (updates) =>
    set((s) => {
      // Índice por lote: aplicar 200 updates sobre 2,000 entradas sin buscar cada vez.
      const index = new Map(s.exchanges.map((e, i) => [e.id, i]));
      const clearedIndex = s.cleared ? new Map(s.cleared.exchanges.map((e, i) => [e.id, i])) : null;
      for (const update of updates) {
        if (s.cleared && clearedIndex?.has(update.id)) {
          apply(s.cleared.exchanges, clearedIndex, update);
          continue;
        }
        apply(s.exchanges, index, update);
      }
      const overflow = s.exchanges.length - LIMITS.historyMax;
      if (overflow > 0) {
        s.exchanges.splice(0, overflow);
        s.atCap = true;
      }
    }),

  clearTraffic: () =>
    set((s) => {
      s.cleared = { exchanges: s.exchanges, until: Date.now() + UNDO_CLEAR_MS };
      s.exchanges = [];
      s.atCap = false;
    }),

  undoClearTraffic: () => {
    const cleared = get().cleared;
    if (!cleared || Date.now() > cleared.until) {
      set((s) => {
        s.cleared = null;
      });
      return false;
    }
    set((s) => {
      const merged = [...(s.cleared?.exchanges ?? []), ...s.exchanges];
      const overflow = merged.length - LIMITS.historyMax;
      s.exchanges = overflow > 0 ? merged.slice(overflow) : merged;
      s.atCap = overflow > 0;
      s.cleared = null;
    });
    return true;
  },

  resetTraffic: () =>
    set((s) => {
      s.exchanges = [];
      s.atCap = false;
      s.cleared = null;
    }),
});
