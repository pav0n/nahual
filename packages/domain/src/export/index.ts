import { REDACTED, redactExportSource, type RedactedSite } from "../sensitive.ts";
import {
  endpointOf,
  isJsonType,
  mediaType,
  parseJson,
  pathname,
  type ExportMerge,
  type ExportOmission,
} from "./common.ts";
import { curl } from "./curl.ts";
import { fetchCode } from "./fetch.ts";
import type { ExportFormat } from "./formats.ts";
import { envMarker } from "./js.ts";
import { msw } from "./msw.ts";
import { postman } from "./postman.ts";
import type { ExportSource } from "./source.ts";
import { vitestCode } from "./vitest.ts";
import { zodSchema } from "./zod.ts";

export type { ExportMerge, ExportOmission } from "./common.ts";
export * from "./source.ts";
export * from "./formats.ts";

/** Qué necesita cada formato (data-model "ExportFormat"). */
export const FORMATS: Record<
  ExportFormat,
  { extension: string; needsResponse: "no" | "yes" | "json" | "optional"; batch: boolean }
> = {
  curl: { extension: ".sh", needsResponse: "no", batch: false },
  fetch: { extension: ".ts", needsResponse: "no", batch: false },
  vitest: { extension: ".contract.test.ts", needsResponse: "yes", batch: false },
  msw: { extension: ".ts", needsResponse: "yes", batch: true },
  zod: { extension: ".schema.ts", needsResponse: "json", batch: true },
  postman: { extension: ".postman_collection.json", needsResponse: "optional", batch: true },
};

export interface ExportAsOptions {
  appVersion: string;
  /** Confirmado por el dev en la vista previa; vale solo para esa exportación (FR-011). */
  includeSensitive: boolean;
  /** Sitio de la página, para el nombre de la colección de Postman. */
  site?: string;
}

export interface ExportResult {
  code: string;
  fileName: string;
  redacted: RedactedSite[];
  omitted: ExportOmission[];
  merged: ExportMerge[];
}

export type Availability =
  | { ok: true }
  | {
      ok: false;
      reasonKey:
        | "export_format_needs_response"
        | "export_format_needs_json"
        | "batch_export_zod_same_endpoint"
        | "export_format_single";
    };

const hasJson = (s: ExportSource) => {
  const body = s.response?.body;
  return (
    body?.kind === "text" &&
    parseJson(body.text).ok &&
    (isJsonType(body.contentType) || mediaType(body.contentType) === "")
  );
};

/** ¿Se puede exportar `sources` a `format`? El motivo es una clave i18n para el panel (FR-008). */
export function formatAvailability(
  format: ExportFormat,
  sources: readonly ExportSource[],
): Availability {
  const spec = FORMATS[format];
  if (sources.length > 1 && !spec.batch) return { ok: false, reasonKey: "export_format_single" };
  if (spec.needsResponse === "yes" && !sources.some((s) => s.response))
    return { ok: false, reasonKey: "export_format_needs_response" };
  if (spec.needsResponse === "json") {
    if (!sources.every(hasJson)) return { ok: false, reasonKey: "export_format_needs_json" };
    if (new Set(sources.map(endpointOf)).size > 1)
      return { ok: false, reasonKey: "batch_export_zod_same_endpoint" };
  }
  return { ok: true };
}

const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/** Nombre del archivo descargado: método y ruta, o el nombre fijo del formato (FR-009). */
export function fileNameFor(format: ExportFormat, sources: readonly ExportSource[]): string {
  const first = sources[0];
  const route = (first && slug(pathname(first.request.url))) || "root";
  const method = first ? slug(first.request.method) : "get";
  switch (format) {
    case "msw":
      return "handlers.ts";
    case "zod":
      return `${route}${FORMATS.zod.extension}`;
    case "postman": {
      let host = "collection";
      if (first) {
        try {
          const url = new URL(first.request.url);
          host = `${url.hostname}${url.port ? `-${url.port}` : ""}`;
        } catch {
          // Nombre por defecto.
        }
      }
      return `nahual-${host}${FORMATS.postman.extension}`;
    }
    default:
      return `${method}-${route}${FORMATS[format].extension}`;
  }
}

/** Copia de `source` sin los caracteres del marcador de `env()` (U+E000 y U+E001). */
const withoutEnvMarkers = (source: ExportSource): ExportSource =>
  JSON.parse(JSON.stringify(source), (_key, value: unknown) =>
    typeof value === "string" ? value.replace(/[\uE000\uE001]/g, "\uFFFD") : value,
  ) as ExportSource;

/** Marcador de lo redactado según el formato (research R3). */
const markerFor = (format: ExportFormat) => (site: RedactedSite) => {
  if (format === "vitest") return envMarker(site.envVar);
  if (format === "postman") return `{{${site.postmanVar}}}`;
  return REDACTED;
};

/**
 * Exporta `sources` a `format` (007, FR-008 a FR-018): redacta salvo `includeSensitive`, genera
 * el código y su nombre de archivo. Determinista. Lanza si el formato no está disponible
 * (`formatAvailability`), que el panel comprueba antes.
 */
export function exportAs(
  format: ExportFormat,
  sources: readonly ExportSource[],
  options: ExportAsOptions,
): ExportResult {
  const available = formatAvailability(format, sources);
  if (!available.ok) throw new Error(available.reasonKey);
  // Un valor capturado con el marcador de `env()` lo convertiría en una lectura de variable de
  // entorno en el test exportado (T071): se neutraliza antes de redactar.
  const clean = format === "vitest" ? sources.map(withoutEnvMarkers) : sources;
  const prepared = clean.map((source) =>
    options.includeSensitive
      ? { source, redacted: [] as RedactedSite[] }
      : redactExportSource(source, markerFor(format)),
  );
  const base = { appVersion: options.appVersion };
  const redacted = prepared.flatMap((p) => p.redacted);
  const fileName = fileNameFor(format, sources);
  const single = prepared[0] as (typeof prepared)[number];
  switch (format) {
    case "curl":
      return { code: curl(single.source, base), fileName, redacted, omitted: [], merged: [] };
    case "fetch":
      return { code: fetchCode(single.source, base), fileName, redacted, omitted: [], merged: [] };
    case "vitest":
      return {
        code: vitestCode(single.source, single.redacted, base),
        fileName,
        redacted,
        omitted: [],
        merged: [],
      };
    case "msw": {
      const result = msw(
        prepared.map((p) => p.source),
        base,
      );
      return { ...result, fileName, redacted };
    }
    case "zod":
      return {
        code: zodSchema(
          prepared.map((p) => p.source),
          base,
        ),
        fileName,
        redacted: [],
        omitted: [],
        merged: [],
      };
    case "postman":
      return {
        code: postman(prepared, { ...base, ...(options.site ? { site: options.site } : {}) }),
        fileName,
        redacted,
        omitted: [],
        merged: [],
      };
  }
}
