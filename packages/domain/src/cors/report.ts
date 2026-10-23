import { headerValues } from "../match/headers.ts";
import type { Header } from "../schemas/common.ts";
import { LIMITS } from "../schemas/limits.ts";
import { parseOrigin } from "./origin.ts";
import { headerList, requestedHeaders } from "./request-headers.ts";
import type { CorsCause, CorsDiagnosis, CorsRelaxedInfo } from "./schemas.ts";
import { corsSnippet, type Framework } from "./snippets.ts";

/** Lo que el reporte necesita de un intercambio del historial (nunca bodies). */
export interface ReportExchange {
  url: string;
  method: string;
  isPreflight: boolean;
  requestHeaders: Header[];
  cors?:
    { diagnosis?: CorsDiagnosis | undefined; relaxed?: CorsRelaxedInfo | undefined } | undefined;
}

/** Datos del reporte para backend (data-model: CorsReport). Solo nombres, nunca valores. */
export interface CorsReport {
  apiOrigin: string;
  appOrigins: string[];
  methods: string[];
  requestedHeaders: string[];
  credentials: boolean;
  suggestedMaxAgeSeconds: number;
  causes: { cause: CorsCause; count: number }[];
  endpoints: string[];
  relaxedInBrowser: boolean;
  exchangeCount: number;
}

/** `Max-Age` razonable para desarrollo y staging (spec, supuestos). */
export const SUGGESTED_MAX_AGE_SECONDS = 600;

const originOf = (url: string) => {
  try {
    return parseOrigin(new URL(url).origin);
  } catch {
    return null;
  }
};

const pathOf = (url: string) => {
  try {
    return new URL(url).pathname;
  } catch {
    return "/";
  }
};

/**
 * Reporte de lo que el servidor de `apiOrigin` debe permitir (FR-032, FR-033), a partir de los
 * intercambios bloqueados o relajados de la pestaña. Solo copia orígenes, métodos, nombres de
 * headers y rutas sin query string (FR-035).
 */
export function buildCorsReport(
  exchanges: readonly ReportExchange[],
  apiOrigin: string,
): CorsReport {
  const appOrigins = new Set<string>();
  const methods = new Set<string>();
  const headers = new Set<string>();
  const endpoints = new Set<string>();
  const causes = new Map<CorsCause, number>();
  let credentials = false;
  let relaxed = false;
  let count = 0;

  for (const e of exchanges) {
    const d = e.cors?.diagnosis;
    const r = e.cors?.relaxed;
    if ((!d && !r) || originOf(e.url) !== apiOrigin) continue;
    count++;
    const method = (
      e.isPreflight
        ? (headerValues(e.requestHeaders, "access-control-request-method")[0] ?? e.method)
        : e.method
    )
      .trim()
      .toUpperCase();
    methods.add(method);
    if (endpoints.size < LIMITS.reportEndpointsMax) endpoints.add(`${method} ${pathOf(e.url)}`);
    const origin = d?.appOrigin ?? parseOrigin(headerValues(e.requestHeaders, "origin")[0] ?? "");
    if (origin) appOrigins.add(origin);
    for (const name of requestedHeaders(e.requestHeaders)) headers.add(name);
    for (const name of d?.requestedHeaders ?? []) headers.add(name);
    if (e.isPreflight)
      for (const name of headerList(
        headerValues(e.requestHeaders, "access-control-request-headers")[0],
      ))
        headers.add(name);
    if (d?.credentials === "yes" || headerValues(e.requestHeaders, "cookie").length > 0)
      credentials = true;
    if (d) causes.set(d.cause, (causes.get(d.cause) ?? 0) + 1);
    if (r && !r.errorKey) relaxed = true;
  }

  return {
    apiOrigin,
    appOrigins: [...appOrigins].sort(),
    methods: [...methods].sort(),
    requestedHeaders: [...headers].sort(),
    credentials,
    suggestedMaxAgeSeconds: SUGGESTED_MAX_AGE_SECONDS,
    causes: [...causes].map(([cause, n]) => ({ cause, count: n })),
    endpoints: [...endpoints].sort(),
    relaxedInBrowser: relaxed,
    exchangeCount: count,
  };
}

export type Translate = (key: string, substitutions?: string | string[]) => string;

/**
 * Texto copiable del reporte (FR-033–FR-037). Los textos vienen de `t` (idioma de la interfaz);
 * los ejemplos de código van en inglés.
 */
export function renderCorsReport(
  report: CorsReport,
  options: { t: Translate; framework?: Framework },
): string {
  const { t } = options;
  const list = (items: readonly string[]) =>
    items.length === 0 ? `  - ${t("cors_none")}` : items.map((item) => `  - ${item}`).join("\n");
  const lines = [
    t("cors_report_title", report.apiOrigin),
    "",
    t("cors_report_warning"),
    "",
    t("cors_report_origins"),
    list(report.appOrigins),
    t("cors_report_methods"),
    list(report.methods),
    t("cors_report_headers"),
    list(report.requestedHeaders),
    t(report.credentials ? "cors_report_credentials_yes" : "cors_report_credentials_no"),
    t("cors_report_max_age", String(report.suggestedMaxAgeSeconds)),
    t("cors_report_causes"),
    list(report.causes.map((c) => `${t(`cors_cause_name_${c.cause}`)} (${c.count})`)),
    t("cors_report_endpoints"),
    list(report.endpoints),
  ];
  if (options.framework) {
    lines.push(
      "",
      t("cors_report_example", t(`cors_framework_${options.framework}`)),
      corsSnippet(options.framework, report),
    );
  }
  return lines.join("\n");
}
