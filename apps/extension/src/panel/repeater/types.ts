import type {
  ComparableResponse,
  RepeaterMode,
  RepeaterRequest,
  RepeaterSend,
} from "@nahual/domain";

/** Pestaña del repeater (data-model `RepeaterTab`): solo vive en memoria del panel. */
export interface RepeaterTab {
  id: string;
  name: string;
  mode: RepeaterMode;
  draft: RepeaterRequest;
  /** Request capturado del que salió y su respuesta original (FR-002). */
  source: { exchangeId: string; request: RepeaterRequest; response: ComparableResponse } | null;
  /** Más reciente primero; a lo sumo `LIMITS.repeaterSendsMax`. */
  sends: RepeaterSend[];
  /** Envíos descartados por el límite (FR-021). */
  droppedCount: number;
  /** Respuesta pegada (FR-022a). */
  pasted: { text: string } | null;
}
