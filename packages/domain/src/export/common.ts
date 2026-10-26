import type { ExportBody, ExportSource } from "./source.ts";

/** Opciones comunes de los exportadores (contracts/exporters.md). */
export interface ExportOptions {
  /** Versión de Nahual para el primer comentario de cada archivo. */
  appVersion: string;
}

/** Tamaño legible y estable (no depende del idioma del panel). */
export function sizeLabel(bytes: number | null): string {
  if (bytes === null) return "unknown size";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Comentario de un body que no se incrusta (Edge Cases). */
export const omittedNote = (body: Extract<ExportBody, { kind: "omitted" }>) =>
  `body omitted: ${body.reason} (${sizeLabel(body.size)})`;

/** `GET /ruta`: la ruta de la URL sin query, o la URL tal cual si no se puede leer. */
export function endpointOf(source: ExportSource): string {
  return `${source.request.method} ${pathname(source.request.url)}`;
}

export function pathname(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url.split(/[?#]/, 1)[0] ?? url;
  }
}

/** `content-type` de un body de texto o del header, en minúsculas y sin parámetros. */
export function mediaType(contentType: string | null | undefined): string {
  return (contentType ?? "").split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

export const isJsonType = (contentType: string | null | undefined) => {
  const type = mediaType(contentType);
  return type === "application/json" || type.endsWith("+json");
};

/** Texto que es JSON válido (sin importar el content-type). */
export function parseJson(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false };
  }
}

/** Request de un lote que no entra en la salida (FR-016), con la clave i18n del motivo. */
export interface ExportOmission {
  index: number;
  reasonKey:
    | "export_reason_no_response"
    | "export_reason_preflight"
    | "export_reason_not_json"
    | "export_reason_body_unavailable";
}

/** Varios requests del mismo endpoint fusionados en un handler (FR-016). */
export interface ExportMerge {
  endpoint: string;
  count: number;
}
