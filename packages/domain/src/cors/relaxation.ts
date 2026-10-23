import type { Header } from "../schemas/common.ts";
import { LIMITS } from "../schemas/limits.ts";
import { computeRelaxedHeaders, preflightPasses, responsePasses } from "./headers.ts";
import { matchProductionOrigin, parseOrigin } from "./origin.ts";
import { headerList } from "./request-headers.ts";
import {
  CorsHeaderNameSchema,
  RELAXATION_DURATIONS,
  type CorsRelaxedInfo,
  type RelaxationState,
} from "./schemas.ts";

/** Ninguna relajación supera 8 h (FR-015). */
export const RELAXATION_MAX_MS = 8 * 60 * 60 * 1000;

export interface RelaxationDraft {
  appOrigin: string;
  apiOrigin: string;
  durationMinutes: number;
  exposeHeaders: readonly string[];
  credentials: boolean;
}

export interface RelaxationEnv {
  /** Los del SW, nunca los del panel. */
  productionOrigins: readonly string[];
  productionListReadable: boolean;
  /** Orígenes de API ya relajados en la pestaña. */
  relaxedApiOrigins: readonly string[];
}

export interface RelaxationIssue {
  path: string;
  messageKey: string;
}

const issue = (path: string, code: string): RelaxationIssue => ({
  path,
  messageKey: `cors_issue_${code}`,
});

/**
 * Validación de una relajación nueva (FR-008–FR-023, FR-029). La hace el SW con sus propios
 * ajustes. Los issues no llevan valores: el panel nombra la entrada de producción con su lista.
 */
export function validateRelaxation(draft: RelaxationDraft, env: RelaxationEnv): RelaxationIssue[] {
  const issues: RelaxationIssue[] = [];
  const app = draft.appOrigin === "null" ? null : parseOrigin(draft.appOrigin);
  const api = parseOrigin(draft.apiOrigin);
  if (draft.appOrigin === "null") issues.push(issue("appOrigin", "app_origin_null"));
  else if (app !== draft.appOrigin) issues.push(issue("appOrigin", "app_origin_invalid"));
  if (api !== draft.apiOrigin) issues.push(issue("apiOrigin", "api_origin_invalid"));
  if (app && api && app === api) issues.push(issue("apiOrigin", "same_origin"));
  if (!env.productionListReadable) issues.push(issue("apiOrigin", "production_list_invalid"));
  else {
    if (api && matchProductionOrigin(api, env.productionOrigins))
      issues.push(issue("apiOrigin", "production_origin"));
    else if (app && matchProductionOrigin(app, env.productionOrigins))
      issues.push(issue("appOrigin", "production_origin"));
  }
  if (!(RELAXATION_DURATIONS as readonly number[]).includes(draft.durationMinutes))
    issues.push(issue("durationMinutes", "duration_invalid"));
  if (api && env.relaxedApiOrigins.includes(api))
    issues.push(issue("apiOrigin", "already_relaxed"));
  else if (env.relaxedApiOrigins.length >= LIMITS.relaxationsPerTab)
    issues.push(issue("apiOrigin", "limit_reached"));
  if (
    draft.exposeHeaders.length > LIMITS.exposeHeadersMax ||
    draft.exposeHeaders.some((name) => !CorsHeaderNameSchema.safeParse(name).success)
  )
    issues.push(issue("exposeHeaders", "expose_header_invalid"));
  return issues;
}

export interface ApplyInput {
  kind: "response" | "preflight";
  /** Status y headers del servidor. */
  status: number;
  serverHeaders: readonly Header[];
  /** Headers que se entregarían sin relajar (con ediciones o mock del dev). */
  finalHeaders: readonly Header[];
  relaxation: { appOrigin: string; credentials: boolean; exposeHeaders: readonly string[] };
  /** Solo preflight: método y headers pedidos. */
  request?: { method: string; requestHeaders: string | null };
}

export type RelaxedInfo = Omit<CorsRelaxedInfo, "relaxationId" | "errorKey">;

export type ApplyResult =
  | { action: "none"; info: RelaxedInfo }
  | { action: "continue"; headers: Header[]; info: RelaxedInfo }
  | { action: "fulfill204"; headers: Header[]; info: RelaxedInfo }
  /** Preflight con redirección: no se corrige en Response; se aprende la URL (research R1, X5). */
  | { action: "learn_redirect" }
  | { action: "not_relaxable" };

/** `Access-Control-*` que el dev cambió respecto al servidor (FR-024). */
function pinnedNames(server: readonly Header[], final: readonly Header[]): string[] {
  const serverValue = (name: string) => server.find((h) => h.name.toLowerCase() === name)?.value;
  return final
    .filter((h) => h.name.toLowerCase().startsWith("access-control-"))
    .filter((h) => serverValue(h.name.toLowerCase()) !== h.value)
    .map((h) => h.name.toLowerCase());
}

/**
 * Último paso de la etapa Response (research R9): decide si la relajación cambia la respuesta y
 * cómo, sin efectos. El SW ejecuta el resultado con CDP.
 */
export function applyRelaxation(input: ApplyInput): ApplyResult {
  const { relaxation, status } = input;
  const ctx = { ...relaxation, pinned: pinnedNames(input.serverHeaders, input.finalHeaders) };
  const info = (alreadyValid: boolean, added: Header[] = [], removed: Header[] = []) => ({
    added: added.slice(0, 10),
    removed: removed.slice(0, 20),
    preflightReplaced: false,
    serverStatus: status,
    alreadyValid,
  });

  if (input.kind === "preflight") {
    if (status >= 300 && status < 400) return { action: "learn_redirect" };
    const request = input.request ?? { method: "GET", requestHeaders: null };
    if (
      preflightPasses(
        { status, headers: input.serverHeaders },
        { method: request.method, requestHeaders: headerList(request.requestHeaders) },
        relaxation,
      )
    )
      return { action: "none", info: info(true) };
    const result = computeRelaxedHeaders(input.finalHeaders, ctx, {
      requestMethod: request.method,
      requestHeaders: request.requestHeaders,
    });
    if (result.kind !== "preflight") return { action: "not_relaxable" };
    return {
      action: "fulfill204",
      headers: result.headers,
      info: { ...info(false, result.added, result.removed), preflightReplaced: true },
    };
  }

  const alreadyValid = responsePasses(input.serverHeaders, relaxation);
  if (alreadyValid && relaxation.exposeHeaders.length === 0 && ctx.pinned.length === 0)
    return { action: "none", info: info(true) };
  const result = computeRelaxedHeaders(input.finalHeaders, ctx);
  if (result.kind !== "response") return { action: "not_relaxable" };
  return {
    action: "continue",
    headers: result.headers,
    info: info(alreadyValid, result.added, result.removed),
  };
}

/** Estado de una relajación (data-model). */
export function relaxationState(ctx: {
  globalPaused: boolean;
  appOriginPresent: boolean;
}): RelaxationState {
  if (ctx.globalPaused) return "suspended";
  return ctx.appOriginPresent ? "active" : "idle";
}
