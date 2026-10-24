import type { RepeaterTab } from "../repeater/types.ts";
import type { SliceCreator } from "./types.ts";

/**
 * Repeater (005, research R13): pestañas en memoria del panel; nada se guarda en disco
 * (FR-020a). Las acciones llegan con US1.
 */
export interface RepeaterSlice {
  repeaterTabs: RepeaterTab[];
}

export const createRepeaterSlice: SliceCreator<RepeaterSlice> = () => ({
  repeaterTabs: [],
});
