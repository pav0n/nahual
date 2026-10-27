import {
  LIMITS,
  type CapturedExchange,
  type RepeaterRequest,
  type RepeaterResponse,
} from "@nahual/domain";
import {
  exportSourceFromExchange,
  exportSourceFromRepeater,
  type CapturedBody,
  type ExportSource,
} from "@nahual/domain/export";

/** Body tal como llega en el evento `body` del SW (`getBody`), o `null` si ya no está. */
export type LoadedBody = { encoding: "text" | "base64"; content: string; size: number } | null;
export type BodyLoader = (exchangeId: string, side: "request" | "response") => Promise<LoadedBody>;

/** Request de la selección que no entra en la exportación (FR-016), con su motivo. */
export interface SelectionOmission {
  exchangeId: string;
  reasonKey: "export_reason_preflight" | "export_reason_batch_limit";
}

const toCaptured = (body: LoadedBody): CapturedBody => {
  if (!body) return null;
  return body.encoding === "base64"
    ? { kind: "base64", base64: body.content, size: body.size }
    : { kind: "text", text: body.content };
};

/**
 * Fuentes de exportación de los requests elegidos en Tráfico (007, research R2): pide al SW los
 * bodies que siguen disponibles, uno a uno, e informa del progreso. Los preflights no se exportan
 * y por encima de `exportBatchMax` se omite el resto; los dos casos vuelven con su motivo.
 */
export async function trafficExportSources(
  exchanges: readonly CapturedExchange[],
  load: BodyLoader,
  onProgress?: (done: number, total: number) => void,
): Promise<{ sources: ExportSource[]; exchangeIds: string[]; omitted: SelectionOmission[] }> {
  const omitted: SelectionOmission[] = [];
  const chosen: CapturedExchange[] = [];
  for (const exchange of exchanges) {
    if (exchange.isPreflight)
      omitted.push({ exchangeId: exchange.id, reasonKey: "export_reason_preflight" });
    else if (chosen.length >= LIMITS.exportBatchMax)
      omitted.push({ exchangeId: exchange.id, reasonKey: "export_reason_batch_limit" });
    else chosen.push(exchange);
  }
  const sources: ExportSource[] = [];
  for (const exchange of chosen) {
    const request = exchange.requestBody.available ? await load(exchange.id, "request") : null;
    const response = exchange.responseBody.available ? await load(exchange.id, "response") : null;
    sources.push(exportSourceFromExchange(exchange, toCaptured(request), toCaptured(response)));
    onProgress?.(sources.length, chosen.length);
  }
  return { sources, exchangeIds: chosen.map((e) => e.id), omitted };
}

/** Fuente del request en edición del repeater con la respuesta mostrada (US1-6). */
export const repeaterExportSource = (
  request: RepeaterRequest,
  response: RepeaterResponse | null,
  capturedAt: number,
): ExportSource => exportSourceFromRepeater(request, response, capturedAt);
