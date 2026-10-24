/** Acción sobre varios requests seleccionados (004, contracts/panel-shell.md `BATCH_ACTIONS`). */
export interface BatchAction {
  id: string;
  labelKey: string;
  /** Texto ya traducido; solo lo usa el gancho del build de pruebas (research R13). */
  label?: string;
  /** Al menos 2 (FR-028). */
  minSelected: number;
  run(exchangeIds: string[]): void;
}

/**
 * Hoy ninguna: sin acciones por lote la lista no ofrece selección múltiple (FR-028). 007 añade
 * `exportMany`.
 */
export const BATCH_ACTIONS: BatchAction[] = [];

export const batchEnabled = () => BATCH_ACTIONS.length > 0;
