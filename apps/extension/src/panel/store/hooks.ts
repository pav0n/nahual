import { LIMITS } from "@nahual/domain";
import type { ConsoleEntry } from "@nahual/hook-runtime";
import type { HookExecution } from "../hooks/hook-host.ts";
import type { SliceCreator } from "./types.ts";

/**
 * Hooks (006, research R11): ejecuciones por intercambio para la pestaña Hooks del detalle. Solo
 * memoria (FR-029): se pierden al cerrar DevTools. Se guardan las de los últimos 2,000
 * intercambios, como el historial de 002.
 */
export interface HooksSlice {
  hookExecutions: Record<string, HookExecution[]>;
  /** Orden de llegada de los intercambios con ejecuciones, para descartar los más antiguos. */
  hookExchangeOrder: string[];
  addHookExecutions(executions: HookExecution[]): void;
  /** Consola de hooks (copia de la de `hooks/runtime.ts`, FR-026). */
  hookConsole: ConsoleEntry[];
  hookUnreadErrors: number;
  setHookConsole(entries: readonly ConsoleEntry[], unread: number): void;
  /** Reglas con el hook suspendido hasta cerrar el panel (FR-022). */
  hookSuspended: string[];
  setHookSuspended(ruleIds: string[]): void;
  /** Filtro de nivel que pide el contador de errores al abrir la consola (FR-028). */
  hookConsoleLevel: "all" | "error";
  setHookConsoleLevel(level: "all" | "error"): void;
}

export const createHooksSlice: SliceCreator<HooksSlice> = (set) => ({
  hookExecutions: {},
  hookExchangeOrder: [],
  hookConsole: [],
  hookUnreadErrors: 0,
  hookSuspended: [],
  hookConsoleLevel: "all",
  setHookConsoleLevel: (level) =>
    set((state) => {
      state.hookConsoleLevel = level;
    }),
  setHookConsole: (entries, unread) =>
    set((state) => {
      // Copias: la consola sigue cambiando sus entradas (el store las congela).
      state.hookConsole = entries.map((e) => ({ ...e, request: { ...e.request } }));
      state.hookUnreadErrors = unread;
    }),
  setHookSuspended: (ruleIds) =>
    set((state) => {
      state.hookSuspended = ruleIds;
    }),
  addHookExecutions: (executions) =>
    set((state) => {
      for (const execution of executions) {
        const list = state.hookExecutions[execution.exchangeId];
        if (list) list.push(execution);
        else {
          state.hookExecutions[execution.exchangeId] = [execution];
          state.hookExchangeOrder.push(execution.exchangeId);
        }
      }
      while (state.hookExchangeOrder.length > LIMITS.historyMax) {
        const oldest = state.hookExchangeOrder.shift();
        if (oldest !== undefined)
          state.hookExecutions = Object.fromEntries(
            Object.entries(state.hookExecutions).filter(([id]) => id !== oldest),
          );
      }
    }),
});
