import {
  DEFAULT_PAUSE_TIMEOUT_SECONDS,
  MAX_PATTERNS,
  MAX_PAUSE_TIMEOUT_SECONDS,
  MIN_PAUSE_TIMEOUT_SECONDS,
  type Header,
  type HeaderEdit,
  type InterceptionPattern,
  type Outcome,
  type PausedRequestView,
  type Stage,
} from "@nahual/protocol";
import {
  DebuggerError,
  type DebuggerPort,
  type FetchHeaderEntry,
  type GetResponseBodyResult,
  type RequestPausedEvent,
} from "./debugger-port.ts";
import type { CommandResult } from "./panel-port.ts";

/** Límite de body evaluable de la constitución (principio VI). */
export const MAX_BODY_BYTES = 5 * 1024 * 1024;
/** Límites de lo que se muestra en el panel (schema `PausedRequestView`). */
const MAX_VIEW_HEADERS = 500;
const MAX_VIEW_HEADER_VALUE = 65_536;

export interface ResolvedResult {
  pausedId: string;
  outcome: Outcome;
  errorKey?: string;
}

export interface FetchInterceptorOptions {
  debugger: DebuggerPort;
  isAttached(tabId: number): boolean;
  onPaused(tabId: number, view: PausedRequestView): void;
  onResolved(tabId: number, result: ResolvedResult): void;
}

export interface InterceptionConfigView {
  patterns: InterceptionPattern[];
  pauseTimeoutSeconds: number;
}

export interface FetchInterceptor {
  setPatterns(tabId: number, patterns: InterceptionPattern[]): Promise<CommandResult>;
  setPauseTimeout(tabId: number, seconds: number): CommandResult;
  continue(tabId: number, pausedId: string, edits?: HeaderEdit[]): Promise<CommandResult>;
  getConfig(tabId: number): InterceptionConfigView;
  /** La sesión de debugger terminó: Chrome ya liberó las pausas, no hay que llamar a CDP. */
  sessionEnded(tabId: number): void;
  /** El panel de la pestaña se cerró: se olvida su configuración. */
  forget(tabId: number): void;
}

interface Paused {
  view: PausedRequestView;
  /** Headers originales, base para aplicar las ediciones. */
  headers: FetchHeaderEntry[];
  timer: ReturnType<typeof setTimeout>;
}

interface TabState {
  patterns: InterceptionPattern[];
  pauseTimeoutSeconds: number;
  fetchEnabled: boolean;
  paused: Map<string, Paused>;
}

const errorCodeOf = (error: unknown) =>
  error instanceof DebuggerError ? error.code : ("cdp_error" as const);

/** Aplica ediciones sin distinguir mayúsculas: `null` elimina, otro valor reemplaza o añade. */
export function mergeHeaders(base: FetchHeaderEntry[], edits: HeaderEdit[]): FetchHeaderEntry[] {
  let result = [...base];
  for (const edit of edits) {
    const key = edit.name.toLowerCase();
    result = result.filter((h) => h.name.toLowerCase() !== key);
    if (edit.value !== null) result.push({ name: edit.name, value: edit.value });
  }
  return result;
}

const utf8Length = (text: string) => new TextEncoder().encode(text).length;

function base64Length(b64: string) {
  const padding = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - padding;
}

function toView(headers: FetchHeaderEntry[]): Header[] {
  return headers.slice(0, MAX_VIEW_HEADERS).map((h) => ({
    name: h.name.slice(0, 1024) || "?",
    value:
      h.value.length > MAX_VIEW_HEADER_VALUE
        ? `${h.value.slice(0, MAX_VIEW_HEADER_VALUE - 1)}…`
        : h.value,
  }));
}

/** Intercepción mínima con el dominio Fetch de CDP (FR-006 a FR-012). */
export function createFetchInterceptor(options: FetchInterceptorOptions): FetchInterceptor {
  const { debugger: cdp } = options;
  const tabs = new Map<number, TabState>();

  const state = (tabId: number): TabState => {
    let tab = tabs.get(tabId);
    if (!tab) {
      tab = {
        patterns: [],
        pauseTimeoutSeconds: DEFAULT_PAUSE_TIMEOUT_SECONDS,
        fetchEnabled: false,
        paused: new Map(),
      };
      tabs.set(tabId, tab);
    }
    return tab;
  };

  /** Saca la pausa del mapa (la primera resolución gana) y devuelve lo necesario para cerrarla. */
  const take = (tabId: number, pausedId: string): Paused | undefined => {
    const tab = tabs.get(tabId);
    const entry = tab?.paused.get(pausedId);
    if (!entry || !tab) return undefined;
    tab.paused.delete(pausedId);
    clearTimeout(entry.timer);
    return entry;
  };

  const send = (tabId: number, entry: Paused, headers?: FetchHeaderEntry[]) => {
    const { stage, pausedId, statusCode } = entry.view;
    if (stage === "request") {
      return cdp.send(tabId, "Fetch.continueRequest", {
        requestId: pausedId,
        ...(headers ? { headers } : {}),
      });
    }
    // Chrome exige status y headers juntos: "Cannot override only status or headers".
    return cdp.send(tabId, "Fetch.continueResponse", {
      requestId: pausedId,
      ...(headers ? { responseCode: statusCode, responseHeaders: headers } : {}),
    });
  };

  /** Continúa sin cambios; ante interceptación inválida el request ya no existe. */
  const continueUnchanged = async (
    tabId: number,
    entry: Paused,
    outcome: Outcome,
  ): Promise<ResolvedResult> => {
    const pausedId = entry.view.pausedId;
    try {
      await send(tabId, entry);
      return { pausedId, outcome };
    } catch (error) {
      return errorCodeOf(error) === "invalid_interception"
        ? { pausedId, outcome: "abandoned" }
        : { pausedId, outcome: "failed", errorKey: "error_cdp_error" };
    }
  };

  const resolveWith = async (tabId: number, entry: Paused, edits?: HeaderEdit[]) => {
    const pausedId = entry.view.pausedId;
    let result: ResolvedResult;
    if (!edits || edits.length === 0) {
      result = await continueUnchanged(tabId, entry, "continued");
    } else {
      try {
        await send(tabId, entry, mergeHeaders(entry.headers, edits));
        result = { pausedId, outcome: "modified" };
      } catch (error) {
        if (errorCodeOf(error) === "invalid_interception") {
          result = { pausedId, outcome: "abandoned" };
        } else {
          // Fallar de forma segura (principio II): reintento único sin cambios.
          const retry = await continueUnchanged(tabId, entry, "failed");
          result =
            retry.outcome === "abandoned"
              ? retry
              : { pausedId, outcome: "failed", errorKey: "error_cdp_error" };
        }
      }
    }
    options.onResolved(tabId, result);
  };

  const describeBody = async (
    tabId: number,
    event: RequestPausedEvent,
    stage: Stage,
    headers: FetchHeaderEntry[],
  ): Promise<{ bodyAvailable: boolean; bodySize: number | null }> => {
    if (stage === "request") {
      if (event.request.postData !== undefined) {
        return { bodyAvailable: true, bodySize: utf8Length(event.request.postData) };
      }
      return { bodyAvailable: event.request.hasPostData === true, bodySize: null };
    }
    const status = event.responseStatusCode ?? 0;
    if (status >= 300 && status < 400) return { bodyAvailable: false, bodySize: null };
    const contentLength = Number(
      headers.find((h) => h.name.toLowerCase() === "content-length")?.value ?? NaN,
    );
    if (contentLength > MAX_BODY_BYTES) return { bodyAvailable: true, bodySize: contentLength };
    try {
      const body = await cdp.send<GetResponseBodyResult>(tabId, "Fetch.getResponseBody", {
        requestId: event.requestId,
      });
      return {
        bodyAvailable: true,
        bodySize: body.base64Encoded ? base64Length(body.body) : utf8Length(body.body),
      };
    } catch {
      return { bodyAvailable: false, bodySize: null };
    }
  };

  const onRequestPaused = async (tabId: number, event: RequestPausedEvent) => {
    if (event.responseErrorReason !== undefined) {
      // Falló la red: no hay respuesta que editar, se deja seguir el error tal cual.
      await cdp
        .send(tabId, "Fetch.continueRequest", { requestId: event.requestId })
        .catch(() => {});
      return;
    }
    const tab = state(tabId);
    const stage: Stage = event.responseStatusCode === undefined ? "request" : "response";
    const headers =
      stage === "request"
        ? Object.entries(event.request.headers).map(([name, value]) => ({ name, value }))
        : (event.responseHeaders ?? []);
    const pausedAt = Date.now();
    const timeoutMs = tab.pauseTimeoutSeconds * 1000;
    const entry: Paused = {
      headers,
      timer: setTimeout(() => {
        const taken = take(tabId, event.requestId);
        if (taken) {
          void continueUnchanged(tabId, taken, "timed_out").then((r) =>
            options.onResolved(tabId, r),
          );
        }
      }, timeoutMs),
      view: {
        pausedId: event.requestId,
        tabId,
        stage,
        method: event.request.method,
        url: event.request.url,
        headers: toView(headers),
        statusCode: event.responseStatusCode ?? null,
        bodyAvailable: false,
        bodySize: null,
        pausedAt,
        expiresAt: pausedAt + timeoutMs,
      },
    };
    tab.paused.set(event.requestId, entry);
    const body = await describeBody(tabId, event, stage, headers);
    if (!tab.paused.has(event.requestId)) return; // se resolvió mientras se leía el body
    entry.view = { ...entry.view, ...body };
    options.onPaused(tabId, entry.view);
  };

  cdp.onEvent((tabId, method, params) => {
    if (method === "Fetch.requestPaused") void onRequestPaused(tabId, params as RequestPausedEvent);
  });

  const continueAll = async (tabId: number) => {
    const tab = tabs.get(tabId);
    if (!tab) return;
    await Promise.all(
      [...tab.paused.keys()].map(async (id) => {
        const entry = take(tabId, id);
        if (entry) await resolveWith(tabId, entry);
      }),
    );
  };

  return {
    async setPatterns(tabId, patterns) {
      if (!options.isAttached(tabId)) return { ok: false, code: "not_attached" };
      const unique = patterns.filter(
        (p, i) =>
          patterns.findIndex((q) => q.urlPattern === p.urlPattern && q.stage === p.stage) === i,
      );
      if (unique.length > MAX_PATTERNS) return { ok: false, code: "pattern_invalid" };
      const tab = state(tabId);
      try {
        if (unique.length === 0) {
          await continueAll(tabId);
          if (tab.fetchEnabled) await cdp.send(tabId, "Fetch.disable");
          tab.fetchEnabled = false;
        } else {
          await cdp.send(tabId, "Fetch.enable", {
            patterns: unique.map((p) => ({
              urlPattern: p.urlPattern,
              requestStage: p.stage === "request" ? "Request" : "Response",
            })),
          });
          tab.fetchEnabled = true;
        }
      } catch {
        return { ok: false, code: "cdp_error" };
      }
      tab.patterns = unique;
      return { ok: true };
    },

    setPauseTimeout(tabId, seconds) {
      if (
        !Number.isInteger(seconds) ||
        seconds < MIN_PAUSE_TIMEOUT_SECONDS ||
        seconds > MAX_PAUSE_TIMEOUT_SECONDS
      ) {
        return { ok: false, code: "timeout_out_of_range" };
      }
      state(tabId).pauseTimeoutSeconds = seconds;
      return { ok: true };
    },

    async continue(tabId, pausedId, edits) {
      const entry = take(tabId, pausedId);
      if (!entry) return { ok: false, code: "unknown_paused_id" };
      await resolveWith(tabId, entry, edits);
      return { ok: true };
    },

    getConfig(tabId) {
      const tab = tabs.get(tabId);
      return {
        patterns: tab ? [...tab.patterns] : [],
        pauseTimeoutSeconds: tab?.pauseTimeoutSeconds ?? DEFAULT_PAUSE_TIMEOUT_SECONDS,
      };
    },

    sessionEnded(tabId) {
      const tab = tabs.get(tabId);
      if (!tab) return;
      for (const id of [...tab.paused.keys()]) {
        if (take(tabId, id)) options.onResolved(tabId, { pausedId: id, outcome: "abandoned" });
      }
      tab.patterns = [];
      tab.fetchEnabled = false;
    },

    forget(tabId) {
      this.sessionEnded(tabId);
      tabs.delete(tabId);
    },
  };
}
