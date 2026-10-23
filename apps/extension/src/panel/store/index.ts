import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { createConnectionSlice, type ConnectionSlice } from "./connection.ts";
import { createQueueSlice, type QueueSlice } from "./queue.ts";
import { createRulesSlice, type RulesSlice } from "./rules.ts";
import { createSettingsSlice, type SettingsSlice } from "./settings.ts";
import { createTrafficSlice, type TrafficSlice } from "./traffic.ts";
import { createUiSlice, type UiSlice } from "./ui.ts";

export type PanelStore = ConnectionSlice &
  QueueSlice &
  RulesSlice &
  SettingsSlice &
  TrafficSlice &
  UiSlice;

/** Estado del panel (research R12). Solo memoria: nada de esto se guarda en disco (FR-007). */
export const usePanelStore = create<PanelStore>()(
  immer((...a) => ({
    ...createConnectionSlice(...a),
    ...createQueueSlice(...a),
    ...createRulesSlice(...a),
    ...createSettingsSlice(...a),
    ...createTrafficSlice(...a),
    ...createUiSlice(...a),
  })),
);
