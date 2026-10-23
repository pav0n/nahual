import type { StateCreator } from "zustand";
import type { PanelStore } from "./index.ts";

/** Slice del store del panel con el middleware de Immer. */
export type SliceCreator<T> = StateCreator<PanelStore, [["zustand/immer", never]], [], T>;
