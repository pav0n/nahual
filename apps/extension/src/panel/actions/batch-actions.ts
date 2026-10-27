import { pathOf, type CapturedExchange, type ExportFormat } from "@nahual/domain";
import { usePanelStore } from "../store/index.ts";

/** Acción sobre varios requests seleccionados (004, contracts/panel-shell.md `BATCH_ACTIONS`). */
export interface BatchAction {
  id: string;
  labelKey: string;
  /** Texto ya traducido; solo lo usa el gancho del build de pruebas (research R13). */
  label?: string;
  /** Al menos 2 (FR-028). */
  minSelected: number;
  /** 007: si es falso, el botón se muestra deshabilitado con `disabledReasonKey`. */
  enabled?(exchanges: readonly CapturedExchange[]): boolean;
  disabledReasonKey?: string;
  run(exchangeIds: string[]): void;
}

const openExport = (format: ExportFormat) => (exchangeIds: string[]) =>
  usePanelStore.getState().openExport({ kind: "traffic", exchangeIds, format });

const endpoint = (e: CapturedExchange) => `${e.method.toUpperCase()} ${pathOf(e.url)}`;

/**
 * 007 (FR-016c): exactamente tres acciones por lote, y con ellas la selección múltiple de la
 * lista. cURL, fetch y Vitest son siempre de un solo request.
 */
export const BATCH_ACTIONS: BatchAction[] = [
  { id: "exportMsw", labelKey: "batch_export_msw", minSelected: 2, run: openExport("msw") },
  {
    id: "exportZod",
    labelKey: "batch_export_zod",
    minSelected: 2,
    enabled: (exchanges) => new Set(exchanges.map(endpoint)).size === 1,
    disabledReasonKey: "batch_export_zod_same_endpoint",
    run: openExport("zod"),
  },
  {
    id: "exportPostman",
    labelKey: "batch_export_postman",
    minSelected: 2,
    run: openExport("postman"),
  },
];

export const batchEnabled = () => BATCH_ACTIONS.length > 0;
