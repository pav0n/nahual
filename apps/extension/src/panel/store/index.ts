import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { createConnectionSlice, type ConnectionSlice } from "./connection.ts";
import { createCorsSlice, type CorsSlice } from "./cors.ts";
import { createHooksSlice, type HooksSlice } from "./hooks.ts";
import { createQueueSlice, type QueueSlice } from "./queue.ts";
import { createRepeaterSlice, type RepeaterSlice } from "./repeater.ts";
import { createRulesSlice, type RulesSlice } from "./rules.ts";
import { createSettingsSlice, type SettingsSlice } from "./settings.ts";
import { createTrafficSlice, type TrafficSlice } from "./traffic.ts";
import { createUiSlice, type UiSlice } from "./ui.ts";

export type PanelStore = ConnectionSlice &
  CorsSlice &
  HooksSlice &
  QueueSlice &
  RepeaterSlice &
  RulesSlice &
  SettingsSlice &
  TrafficSlice &
  UiSlice;

/** Estado del panel (research R12). Solo memoria: nada de esto se guarda en disco (FR-007). */
export const usePanelStore = create<PanelStore>()(
  immer((...a) => ({
    ...createConnectionSlice(...a),
    ...createCorsSlice(...a),
    ...createHooksSlice(...a),
    ...createQueueSlice(...a),
    ...createRepeaterSlice(...a),
    ...createRulesSlice(...a),
    ...createSettingsSlice(...a),
    ...createTrafficSlice(...a),
    ...createUiSlice(...a),
  })),
);
