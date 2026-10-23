import { headerValues } from "../match/headers.ts";
import type { Header } from "../schemas/common.ts";
import { parseOrigin } from "./origin.ts";
import { headerList, requestedHeaders } from "./request-headers.ts";
import type { CorsCause, CorsDiagnosis } from "./schemas.ts";

/** Preflight observado por Network o por Fetch (research R6). */
export interface ObservedPreflight {
  exchangeId: string;
  status: number | null;
  headers: Header[];
  /** `Access-Control-Request-Headers` del preflight. */
  requestedHeaders?: string;
}

export interface CorsFailureInput {
  /** `Network.loadingFailed.corsErrorStatus.corsError`. */
  corsError: string;
  failedParameter: string;
  method: string;
  url: string;
  /** Origen del frame que hizo el request (research R4). */
  appOrigin: string | null;
  /** Headers crudos del request (`requestWillBeSentExtraInfo`). */
  requestHeaders: Header[];
  responseStatus: number | null;
  responseHeaders: Header[];
  preflight: ObservedPreflight | null;
}

/** `corsError` de Chrome ⇒ causa (research R3). Lo que no está aquí es `unrecognized`. */
const CAUSES: Record<string, CorsCause> = {
  MissingAllowOriginHeader: "missing_allow_origin",
  PreflightMissingAllowOriginHeader: "missing_allow_origin",
  AllowOriginMismatch: "origin_mismatch",
  InvalidAllowOriginValue: "origin_mismatch",
  MultipleAllowOriginValues: "origin_mismatch",
  PreflightAllowOriginMismatch: "origin_mismatch",
  PreflightInvalidAllowOriginValue: "origin_mismatch",
  PreflightMultipleAllowOriginValues: "origin_mismatch",
  WildcardOriginNotAllowed: "wildcard_with_credentials",
  PreflightWildcardOriginNotAllowed: "wildcard_with_credentials",
  InvalidAllowCredentials: "missing_allow_credentials",
  PreflightInvalidAllowCredentials: "missing_allow_credentials",
  MethodDisallowedByPreflightResponse: "method_not_allowed",
  InvalidAllowMethodsPreflightResponse: "method_not_allowed",
  HeaderDisallowedByPreflightResponse: "header_not_allowed",
  InvalidAllowHeadersPreflightResponse: "header_not_allowed",
  PreflightInvalidStatus: "preflight_status",
  PreflightDisallowedRedirect: "preflight_redirect",
};

const AT_PREFLIGHT = new Set([
  "MethodDisallowedByPreflightResponse",
  "InvalidAllowMethodsPreflightResponse",
  "HeaderDisallowedByPreflightResponse",
  "InvalidAllowHeadersPreflightResponse",
]);

const CREDENTIAL_CAUSES = new Set<CorsCause>([
  "wildcard_with_credentials",
  "missing_allow_credentials",
]);

const corsHeaders = (headers: readonly Header[]) =>
  headers.filter((h) => h.name.toLowerCase().startsWith("access-control-")).slice(0, 20);

function originOfUrl(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return "null";
  }
}

/**
 * Diagnóstico de un request bloqueado por CORS (FR-003–FR-007): causa, qué pidió la app y qué
 * respondió el servidor. Solo copia nombres de headers y los `Access-Control-*` del servidor;
 * nunca valores de `Cookie`, `Authorization` u otros sensibles.
 */
export function classifyCorsFailure(input: CorsFailureInput): CorsDiagnosis {
  const known = CAUSES[input.corsError];
  const atPreflight = input.corsError.startsWith("Preflight") || AT_PREFLIGHT.has(input.corsError);
  let cause: CorsCause = known ?? "unrecognized";
  const preflightStatus = input.preflight?.status ?? null;
  // Chrome puede reportar la falta de Allow-Origin de un preflight 401: el status es la causa (X2).
  if (
    known &&
    atPreflight &&
    preflightStatus !== null &&
    !(preflightStatus >= 200 && preflightStatus < 300)
  )
    cause =
      preflightStatus >= 300 && preflightStatus < 400 ? "preflight_redirect" : "preflight_status";

  const credentials =
    headerValues(input.requestHeaders, "cookie").length > 0 || CREDENTIAL_CAUSES.has(cause)
      ? "yes"
      : "unknown";

  let failedParameter: string | null = input.failedParameter || null;
  if (
    credentials === "yes" &&
    input.preflight &&
    ((cause === "method_not_allowed" &&
      headerValues(input.preflight.headers, "access-control-allow-methods").some(
        (v) => v.trim() === "*",
      )) ||
      (cause === "header_not_allowed" &&
        headerValues(input.preflight.headers, "access-control-allow-headers").some(
          (v) => v.trim() === "*",
        )))
  )
    failedParameter = "*";

  const requested = new Set(requestedHeaders(input.requestHeaders));
  for (const name of headerList(input.preflight?.requestedHeaders)) requested.add(name);

  const apiOrigin = originOfUrl(input.url);
  const notRelaxableReason =
    cause === "unrecognized"
      ? ("unrecognized" as const)
      : input.appOrigin === null || parseOrigin(apiOrigin) === null
        ? ("null_origin" as const)
        : parseOrigin(apiOrigin) === input.appOrigin
          ? ("same_origin" as const)
          : undefined;

  return {
    cause,
    browserCode: input.corsError.slice(0, 64),
    failedParameter: failedParameter?.slice(0, 256) ?? null,
    atPreflight,
    appOrigin: input.appOrigin,
    apiOrigin: apiOrigin.slice(0, 256),
    method: (input.method || "GET").slice(0, 64),
    requestedHeaders: [...requested].sort().slice(0, 50),
    credentials,
    responseStatus: input.responseStatus,
    preflightStatus,
    serverCorsHeaders: corsHeaders(
      atPreflight && input.preflight ? input.preflight.headers : input.responseHeaders,
    ),
    preflightExchangeId: input.preflight?.exchangeId ?? null,
    relaxable: notRelaxableReason === undefined,
    ...(notRelaxableReason ? { notRelaxableReason } : {}),
  };
}
