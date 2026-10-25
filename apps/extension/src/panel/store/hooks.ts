import { LIMITS } from "@nahual/domain";
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
}

export const createHooksSlice: SliceCreator<HooksSlice> = (set) => ({
  hookExecutions: {},
  hookExchangeOrder: [],
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
