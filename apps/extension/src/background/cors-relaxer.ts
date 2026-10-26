import {
  LIMITS,
  applyRelaxation,
  computeRelaxedHeaders,
  headerValues,
  parseOrigin,
  relaxationState,
  validateRelaxation,
  type CorsDiagnosis,
  type CorsRelaxedInfo,
  type Header,
  type RelaxationDraft,
  type RelaxationEndCause,
  type RelaxationState,
  type RelaxationView,
  type RelaxedOrigin,
  type RelaxedInfo,
  type Settings,
} from "@nahual/domain";
import type { Issue } from "@nahual/protocol";
import type { ActionExecutor, ExecResult, PausedTarget } from "./action-executor.ts";
import { corsTimeScale } from "./test-hooks.ts";

export interface ActiveRelaxation {
  id: string;
  appOrigin: string;
  apiOrigin: string;
  exposeHeaders: string[];
  credentials: boolean;
}

interface Relaxation extends ActiveRelaxation {
  createdAt: number;
  expiresAt: number;
  timer: ReturnType<typeof setTimeout>;
  /** URLs sin query cuyo preflight redirige: se responden en etapa Request (research R1, X5). */
  redirecting: Set<string>;
  state: RelaxationState;
}

export type CreateResult =
  | { ok: true; id: string }
  | { ok: false; code: "not_attached" }
  | { ok: false; code: "relaxation_invalid"; issues: Issue[] };

export interface CorsRelaxerOptions {
  settings(): Settings;
  productionListReadable(): boolean;
  isAttached(tabId: number): boolean;
  hasFrameOrigin(tabId: number, origin: string): boolean;
  /** Cambió la lista o el estado de la pestaña: eventos, patrones y `state`. */
  onChange(tabId: number): void;
  onNotice(tabId: number, messageKey: string): void;
  now?: () => number;
}

export interface CorsRelaxer {
  create(tabId: number, draft: RelaxationDraft): CreateResult;
  /** `id` null termina todas las de la pestaña. Idempotente. */
  end(tabId: number, id: string | null, cause: RelaxationEndCause): void;
  sessionEnded(tabId: number): void;
  /** Ajustes nuevos: termina las que caen en producción y recalcula `suspended`. */
  settingsChanged(): void;
  /** Recalcula los estados de la pestaña (navegación). */
  refresh(tabId: number): void;
  views(tabId: number): RelaxationView[];
  count(tabId: number): number;
  patterns(tabId: number): RelaxedOrigin[];
  /** Relajación vigente para ese par de orígenes, o null. Termina la vencida al consultarla. */
  match(tabId: number, apiOrigin: string | null, appOrigin: string | null): ActiveRelaxation | null;
  redirecting(tabId: number, url: string, appOrigin: string | null): ActiveRelaxation | null;
  learnRedirect(tabId: number, id: string, url: string): void;
  /** Bloqueo CORS visto por la captura: aprende credenciales y preflights que redirigen. */
  noteFailure(tabId: number, url: string, diagnosis: CorsDiagnosis): void;
}

const NOTICES: Partial<Record<RelaxationEndCause, string>> = {
  expired: "cors_ended_expired",
  detached: "cors_ended_detached",
  production: "cors_ended_production",
};

const withoutQuery = (url: string) => url.split(/[?#]/)[0] ?? url;

const originOf = (url: string) => {
  try {
    return parseOrigin(new URL(url).origin);
  } catch {
    return null;
  }
};

/**
 * Relajaciones CORS por pestaña, solo en memoria del SW (FR-017, research R10). Cada una vive
 * como mucho 8 h y muere con el debugger, el SW o su origen marcado como producción.
 */
export function createCorsRelaxer(options: CorsRelaxerOptions): CorsRelaxer {
  const now = options.now ?? Date.now;
  const tabs = new Map<number, Map<string, Relaxation>>();
  /** Preflights con redirección vistos antes de relajar, por pestaña y origen de API. */
  const redirectsSeen = new Map<number, Map<string, Set<string>>>();

  const tab = (tabId: number) => {
    let list = tabs.get(tabId);
    if (!list) tabs.set(tabId, (list = new Map()));
    return list;
  };

  const stateOf = (tabId: number, r: Relaxation) =>
    relaxationState({
      globalPaused: options.settings().globalPaused,
      appOriginPresent: options.hasFrameOrigin(tabId, r.appOrigin),
    });

  const end: CorsRelaxer["end"] = (tabId, id, cause) => {
    const list = tabs.get(tabId);
    if (!list) return;
    const ended = [...list.values()].filter((r) => id === null || r.id === id);
    if (ended.length === 0) return;
    for (const r of ended) {
      clearTimeout(r.timer);
      list.delete(r.id);
    }
    const notice = NOTICES[cause];
    if (notice) options.onNotice(tabId, notice);
    options.onChange(tabId);
  };

  const refresh = (tabId: number) => {
    let changed = false;
    for (const r of tabs.get(tabId)?.values() ?? []) {
      const state = stateOf(tabId, r);
      if (state !== r.state) {
        r.state = state;
        changed = true;
      }
    }
    if (changed) options.onChange(tabId);
  };

  const byApi = (tabId: number, apiOrigin: string | null) =>
    apiOrigin === null
      ? undefined
      : [...(tabs.get(tabId)?.values() ?? [])].find((r) => r.apiOrigin === apiOrigin);

  const match: CorsRelaxer["match"] = (tabId, apiOrigin, appOrigin) => {
    const r = byApi(tabId, apiOrigin);
    if (!r || appOrigin === null) return null;
    if (now() >= r.expiresAt) {
      // El temporizador puede retrasarse: nunca se relaja nada vencido.
      end(tabId, r.id, "expired");
      return null;
    }
    if (r.appOrigin !== appOrigin || options.settings().globalPaused) return null;
    return r;
  };

  return {
    create(tabId, draft) {
      if (!options.isAttached(tabId)) return { ok: false, code: "not_attached" };
      const list = tab(tabId);
      const issues = validateRelaxation(draft, {
        productionOrigins: options.settings().productionOrigins,
        productionListReadable: options.productionListReadable(),
        relaxedApiOrigins: [...list.values()].map((r) => r.apiOrigin),
      });
      if (issues.length > 0) return { ok: false, code: "relaxation_invalid", issues };
      const id = crypto.randomUUID();
      const createdAt = now();
      const duration = (draft.durationMinutes * 60_000) / corsTimeScale();
      const relaxation: Relaxation = {
        id,
        appOrigin: draft.appOrigin,
        apiOrigin: draft.apiOrigin,
        exposeHeaders: [...draft.exposeHeaders],
        credentials: draft.credentials,
        createdAt,
        expiresAt: createdAt + duration,
        timer: setTimeout(() => end(tabId, id, "expired"), duration),
        redirecting: new Set(redirectsSeen.get(tabId)?.get(draft.apiOrigin) ?? []),
        state: "active",
      };
      relaxation.state = stateOf(tabId, relaxation);
      list.set(id, relaxation);
      options.onChange(tabId);
      return { ok: true, id };
    },

    end,

    sessionEnded(tabId) {
      end(tabId, null, "detached");
      tabs.delete(tabId);
      redirectsSeen.delete(tabId);
    },

    settingsChanged() {
      const { productionOrigins } = options.settings();
      for (const [tabId, list] of tabs) {
        for (const r of [...list.values()]) {
          const hit = validateRelaxation(
            { ...r, durationMinutes: 15 },
            { productionOrigins, productionListReadable: true, relaxedApiOrigins: [] },
          ).some((i) => i.messageKey === "cors_issue_production_origin");
          if (hit) end(tabId, r.id, "production");
        }
        refresh(tabId);
      }
    },

    refresh,

    views: (tabId) =>
      [...(tabs.get(tabId)?.values() ?? [])].map((r) => ({
        id: r.id,
        appOrigin: r.appOrigin,
        apiOrigin: r.apiOrigin,
        exposeHeaders: r.exposeHeaders,
        credentials: r.credentials,
        createdAt: r.createdAt,
        expiresAt: r.expiresAt,
        state: r.state,
      })),

    count: (tabId) => tabs.get(tabId)?.size ?? 0,

    patterns: (tabId) =>
      [...(tabs.get(tabId)?.values() ?? [])]
        .filter((r) => r.state !== "suspended")
        .map((r) => ({ origin: r.apiOrigin, requestStage: r.redirecting.size > 0 })),

    match,

    redirecting(tabId, url, appOrigin) {
      const r = match(tabId, originOf(url), appOrigin);
      return r && byApi(tabId, r.apiOrigin)?.redirecting.has(withoutQuery(url)) ? r : null;
    },

    learnRedirect(tabId, id, url) {
      const r = tabs.get(tabId)?.get(id);
      const key = withoutQuery(url);
      if (!r || r.redirecting.has(key) || r.redirecting.size >= LIMITS.redirectingPreflightsMax)
        return;
      r.redirecting.add(key);
      options.onChange(tabId);
    },

    noteFailure(tabId, url, diagnosis) {
      const apiOrigin = originOf(url);
      if (apiOrigin === null) return;
      if (diagnosis.cause === "preflight_redirect") {
        let byOrigin = redirectsSeen.get(tabId);
        if (!byOrigin) redirectsSeen.set(tabId, (byOrigin = new Map()));
        const urls = byOrigin.get(apiOrigin) ?? new Set<string>();
        if (urls.size < LIMITS.redirectingPreflightsMax) urls.add(withoutQuery(url));
        byOrigin.set(apiOrigin, urls);
      }
      if (
        diagnosis.cause === "missing_allow_credentials" ||
        diagnosis.cause === "wildcard_with_credentials"
      ) {
        const r = byApi(tabId, apiOrigin);
        if (r && !r.credentials && r.appOrigin === diagnosis.appOrigin) {
          r.credentials = true;
          options.onNotice(tabId, "cors_credentials_learned");
          options.onChange(tabId);
        }
      }
    },
  };
}

export interface RelaxingExecutorOptions {
  base: ActionExecutor;
  relaxer: CorsRelaxer;
  frameOriginOf(tabId: number, frameId: string | undefined): string | null;
  onRelaxed(tabId: number, exchangeId: string, info: CorsRelaxedInfo): void;
}

const isPreflightTarget = (target: PausedTarget) =>
  target.method?.toUpperCase() === "OPTIONS" &&
  headerValues(target.requestHeaders, "access-control-request-method").length > 0;

/**
 * Último paso antes de entregar una respuesta (research R9): aplica la relajación vigente a lo
 * que el RuleEngine va a entregar, sin cambiar sus decisiones. Si aplicarla falla, la respuesta
 * continúa sin modificar (FR-027).
 */
export function createRelaxingExecutor(options: RelaxingExecutorOptions): ActionExecutor {
  const { base, relaxer } = options;

  const relaxationFor = (tabId: number, target: PausedTarget) => {
    if (!target.url) return null;
    const originHeader = headerValues(target.requestHeaders, "origin")[0];
    const appOrigin =
      options.frameOriginOf(tabId, target.frameId) ??
      (originHeader ? parseOrigin(originHeader) : null);
    const apiOrigin = originOf(target.url);
    if (apiOrigin === null) return null;
    const relaxation = relaxer.match(tabId, apiOrigin, appOrigin);
    if (!relaxation) return null;
    const credentials =
      relaxation.credentials || headerValues(target.requestHeaders, "cookie").length > 0;
    return { relaxation, appOrigin, settings: { ...relaxation, credentials } };
  };

  const report = (
    tabId: number,
    target: PausedTarget,
    relaxationId: string,
    info: RelaxedInfo,
    result: ExecResult,
  ) => {
    if (!target.exchangeId) return;
    if (result.ok) options.onRelaxed(tabId, target.exchangeId, { ...info, relaxationId });
    else if (result.outcome === "apply_failed")
      options.onRelaxed(tabId, target.exchangeId, {
        ...info,
        relaxationId,
        added: [],
        removed: [],
        preflightReplaced: false,
        errorKey: result.errorKey,
      });
  };

  /** Entrega relajada de una respuesta cuyos headers finales son `finalHeaders`. */
  const deliver = async (
    tabId: number,
    target: PausedTarget,
    found: NonNullable<ReturnType<typeof relaxationFor>>,
    input: { status: number; serverHeaders: Header[]; finalHeaders: Header[] },
    send: { continue(headers: Header[]): Promise<ExecResult>; unchanged(): Promise<ExecResult> },
  ): Promise<ExecResult> => {
    const preflight = isPreflightTarget(target);
    const decision = applyRelaxation({
      kind: preflight ? "preflight" : "response",
      status: input.status,
      serverHeaders: input.serverHeaders,
      finalHeaders: input.finalHeaders,
      relaxation: found.settings,
      ...(preflight
        ? {
            request: {
              method: headerValues(target.requestHeaders, "access-control-request-method")[0] ?? "",
              requestHeaders:
                headerValues(target.requestHeaders, "access-control-request-headers")[0] ?? null,
            },
          }
        : {}),
    });
    const id = found.relaxation.id;
    switch (decision.action) {
      case "none": {
        const result = await send.unchanged();
        report(tabId, target, id, decision.info, result);
        return result;
      }
      case "continue": {
        const result = await send.continue(decision.headers);
        report(tabId, target, id, decision.info, result);
        return result;
      }
      case "fulfill204": {
        const result = await base.respond(tabId, target, 204, decision.headers, "");
        report(tabId, target, id, decision.info, result);
        return result;
      }
      case "learn_redirect":
        if (target.url) relaxer.learnRedirect(tabId, id, target.url);
        return send.unchanged();
      case "not_relaxable":
        return send.unchanged();
    }
  };

  return {
    async continueUnchanged(tabId, target) {
      if (target.stage === "request") {
        // Respaldo de X5: un preflight que redirige se responde antes de llegar al servidor.
        const found = isPreflightTarget(target) && target.url ? relaxationFor(tabId, target) : null;
        if (!found || !target.url || !relaxer.redirecting(tabId, target.url, found.appOrigin))
          return base.continueUnchanged(tabId, target);
        const relaxed = computeRelaxedHeaders([], found.settings, {
          requestMethod:
            headerValues(target.requestHeaders, "access-control-request-method")[0] ?? "",
          requestHeaders:
            headerValues(target.requestHeaders, "access-control-request-headers")[0] ?? null,
        });
        if (relaxed.kind !== "preflight") return base.continueUnchanged(tabId, target);
        const result = await base.respond(tabId, target, 204, relaxed.headers, "");
        report(
          tabId,
          target,
          found.relaxation.id,
          {
            added: relaxed.added,
            removed: [],
            preflightReplaced: true,
            serverStatus: 0,
            alreadyValid: false,
          },
          result,
        );
        return result;
      }
      const found = relaxationFor(tabId, target);
      if (!found) return base.continueUnchanged(tabId, target);
      const status = target.status ?? 200;
      return deliver(
        tabId,
        target,
        found,
        { status, serverHeaders: target.responseHeaders, finalHeaders: target.responseHeaders },
        {
          continue: (headers) => base.continueEdited(tabId, target, { status, headers }),
          unchanged: () => base.continueUnchanged(tabId, target),
        },
      );
    },

    async continueEdited(tabId, target, edit, options) {
      const found = target.stage === "response" ? relaxationFor(tabId, target) : null;
      if (!found) return base.continueEdited(tabId, target, edit);
      const status = edit.status ?? target.status ?? 200;
      const finalHeaders = edit.headers ?? target.responseHeaders;
      return deliver(
        tabId,
        target,
        found,
        {
          status,
          // 006 (FR-013): lo que deja un hook se trata como si viniera del servidor, sin valores
          // "fijados" por el dev: la relajación decide sobre esos headers y prevalece.
          serverHeaders: options?.fromHook ? finalHeaders : target.responseHeaders,
          finalHeaders,
        },
        {
          continue: (headers) => base.continueEdited(tabId, target, { ...edit, headers }),
          unchanged: () => base.continueEdited(tabId, target, edit),
        },
      );
    },

    async mock(tabId, target, mock) {
      const found = relaxationFor(tabId, target);
      if (!found || isPreflightTarget(target)) return base.mock(tabId, target, mock);
      // Sin respuesta del servidor: todo Access-Control-* del mock es del dev y se respeta.
      return deliver(
        tabId,
        target,
        found,
        { status: mock.status, serverHeaders: [], finalHeaders: mock.headers },
        {
          continue: (headers) => base.mock(tabId, target, { ...mock, headers }),
          unchanged: () => base.mock(tabId, target, mock),
        },
      );
    },

    fail: (tabId, target, reason) => base.fail(tabId, target, reason),
    respond: (tabId, target, status, headers, body) =>
      base.respond(tabId, target, status, headers, body),
  };
}
