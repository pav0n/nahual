import {
  LIMITS,
  MAX_BODY_BYTES,
  classifyCorsFailure,
  decodeBody,
  parseOrigin,
  type CorsDiagnosis,
  type CorsRelaxedInfo,
  isTextualContentType,
  utf8ByteLength,
  type BodyInfo,
  type ExchangeFields,
  type ExchangeUpdate,
  type Header,
  type RuleEffect,
} from "@nahual/domain";
import type { DebuggerPort } from "./debugger-port.ts";
import { logger } from "./logger.ts";
import { injectedFault } from "./test-hooks.ts";

export type BodyResult =
  | { ok: true; encoding: "text"; content: string; size: number }
  | { ok: false; reason: "unknown" | "redirect" | "binary" | "tooLarge" | "evicted" | "none" };

export interface NetworkCaptureOptions {
  debugger: DebuggerPort;
  onUpdates(tabId: number, updates: ExchangeUpdate[]): void;
  /** Agrupación de updates (research R11). */
  batchMs?: number;
  maxBatch?: number;
  /** Origen del frame que hizo el request (003, research R4). */
  frameOriginOf?(tabId: number, frameId: string | undefined): string | null;
  /** Un request se bloqueó por CORS (003): el CorsRelaxer aprende credenciales (research R5). */
  onCorsFailure?(tabId: number, exchangeId: string, diagnosis: CorsDiagnosis, url: string): void;
}

export interface NetworkCapture {
  /** Id del intercambio actual de un `requestId` de Network (`#n` tras redirecciones). */
  exchangeIdOf(tabId: number, networkId: string): string | null;
  /** Marca que una regla actuó sobre el intercambio (FR-002). */
  effect(tabId: number, exchangeId: string, effect: RuleEffect): void;
  /** Lo que la relajación CORS cambió en el intercambio (FR-026). */
  relaxed(tabId: number, exchangeId: string, info: CorsRelaxedInfo): void;
  /** Body bajo demanda: nunca viaja con la captura (research R1). */
  getBody(tabId: number, exchangeId: string, side: "request" | "response"): Promise<BodyResult>;
  /** Envía lo pendiente y olvida la pestaña. */
  sessionEnded(tabId: number): void;
}

const MAX_HEADERS = 500;
/** Espera máxima de la respuesta del preflight para el diagnóstico CORS (003). */
const PREFLIGHT_WAIT_MS = 500;
const PREFLIGHT_POLL_MS = 25;
/** Preflights a la espera de su request, por pestaña. */
const MAX_ORPHAN_PREFLIGHTS = 200;
const MAX_HEADER_VALUE = 65_536;
/** Entradas recordadas por pestaña para pedir bodies y marcar efectos (como el historial). */
const MAX_ENTRIES = LIMITS.historyMax;

interface Entry {
  id: string;
  networkId: string;
  /** Salto de redirección ya cerrado: no tiene body. */
  redirect: boolean;
  startTimestamp: number;
  decodedSize: number;
  status: number | null;
  mimeType: string | null;
  contentType: string | null;
  hasRequestBody: boolean;
  extraRequestHeaders: Header[] | null;
  extraResponseHeaders: Header[] | null;
  // 003: datos para el diagnóstico CORS.
  method?: string;
  url?: string;
  requestHeaders?: Header[];
  responseHeaders?: Header[];
  appOrigin?: string | null;
  /** En un request: su preflight observado. En un preflight: `Access-Control-Request-Headers`. */
  preflightId?: string;
  requestedHeaders?: string | undefined;
}

interface Tab {
  seq: number;
  /** Entradas por id de intercambio, en orden de llegada (para el tope). */
  entries: Map<string, Entry>;
  /** Id actual de cada `requestId` de Network. */
  current: Map<string, string>;
  redirects: Map<string, number>;
  /** Preflights que llegaron antes que su request: `requestId` del request ⇒ id del preflight. */
  orphanPreflights: Map<string, string>;
  pending: ExchangeUpdate[];
  timer: ReturnType<typeof setTimeout> | null;
}

interface CdpRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  postData?: string;
  hasPostData?: boolean;
}

interface CdpResponse {
  url: string;
  status: number;
  mimeType?: string;
  headers: Record<string, string>;
}

export function toHeaderList(headers: Record<string, string> | undefined): Header[] {
  if (!headers) return [];
  return Object.entries(headers)
    .slice(0, MAX_HEADERS)
    .map(([name, value]) => ({
      name: name.slice(0, 1024) || "?",
      value: value.length > MAX_HEADER_VALUE ? `${value.slice(0, MAX_HEADER_VALUE - 1)}…` : value,
    }));
}

const headerValue = (headers: Record<string, string> | undefined, name: string) => {
  if (!headers) return null;
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name);
  return key === undefined ? null : (headers[key] ?? null);
};

function truncateUrl(url: string): { url: string; urlTruncated: boolean } {
  return url.length > LIMITS.urlMax
    ? { url: `${url.slice(0, LIMITS.urlMax)}…`, urlTruncated: true }
    : { url, urlTruncated: false };
}

function responseBodyInfo(entry: Entry, encodedSize: number | null): BodyInfo {
  if (entry.redirect || (entry.status !== null && entry.status >= 300 && entry.status < 400)) {
    return { available: false, size: null, reason: "redirect" };
  }
  const size = entry.decodedSize > 0 ? entry.decodedSize : encodedSize;
  if (isTextualContentType(entry.mimeType ?? entry.contentType) === false) {
    return { available: false, size, reason: "binary" };
  }
  if (size !== null && size > MAX_BODY_BYTES) return { available: false, size, reason: "tooLarge" };
  return { available: true, size };
}

/**
 * Captura pasiva con el dominio Network (FR-001): traduce sus eventos a `ExchangeUpdate` y los
 * envía en lotes. No modifica ni retrasa nada; los bodies se piden solo bajo demanda.
 */
export function createNetworkCapture(options: NetworkCaptureOptions): NetworkCapture {
  const { debugger: cdp } = options;
  const batchMs = options.batchMs ?? 50;
  const maxBatch = options.maxBatch ?? 200;
  const tabs = new Map<number, Tab>();

  const tabOf = (tabId: number): Tab => {
    let tab = tabs.get(tabId);
    if (!tab) {
      tab = {
        seq: 0,
        entries: new Map(),
        current: new Map(),
        redirects: new Map(),
        orphanPreflights: new Map(),
        pending: [],
        timer: null,
      };
      tabs.set(tabId, tab);
    }
    return tab;
  };

  const flush = (tabId: number) => {
    const tab = tabs.get(tabId);
    if (!tab) return;
    if (tab.timer) clearTimeout(tab.timer);
    tab.timer = null;
    while (tab.pending.length > 0) options.onUpdates(tabId, tab.pending.splice(0, maxBatch));
  };

  const push = (tabId: number, update: ExchangeUpdate) => {
    const tab = tabOf(tabId);
    tab.pending.push(update);
    if (tab.pending.length >= maxBatch) {
      options.onUpdates(tabId, tab.pending.splice(0, maxBatch));
    }
    if (tab.pending.length > 0 && !tab.timer) {
      tab.timer = setTimeout(() => flush(tabId), batchMs);
    }
  };

  const remember = (tab: Tab, entry: Entry) => {
    tab.entries.set(entry.id, entry);
    if (tab.entries.size > MAX_ENTRIES) {
      const oldest = tab.entries.keys().next().value;
      if (oldest !== undefined) tab.entries.delete(oldest);
    }
  };

  const currentEntry = (tabId: number, networkId: string) => {
    const tab = tabs.get(tabId);
    const id = tab?.current.get(networkId);
    return id === undefined ? undefined : tab?.entries.get(id);
  };

  const onResponse = (tabId: number, entry: Entry, response: CdpResponse) => {
    entry.status = response.status;
    entry.mimeType = response.mimeType ?? null;
    entry.contentType = headerValue(response.headers, "content-type");
    entry.responseHeaders = entry.extraResponseHeaders ?? toHeaderList(response.headers);
    const fields: Partial<ExchangeFields> = {
      status: response.status,
      mimeType: entry.mimeType,
      responseHeaders: entry.responseHeaders,
    };
    push(tabId, { id: entry.id, kind: "response", fields });
  };

  const onRequestWillBeSent = (
    tabId: number,
    event: {
      requestId: string;
      type?: string;
      timestamp: number;
      wallTime?: number;
      request: CdpRequest;
      redirectResponse?: CdpResponse;
      frameId?: string;
      initiator?: { type?: string; requestId?: string };
    },
  ) => {
    const tab = tabOf(tabId);
    let id = event.requestId;
    const previous = currentEntry(tabId, event.requestId);
    if (event.redirectResponse && previous) {
      // Network reutiliza el requestId en cada salto: se cierra la entrada como 3xx sin body.
      onResponse(tabId, previous, event.redirectResponse);
      previous.redirect = true;
      push(tabId, {
        id: previous.id,
        kind: "finish",
        fields: {
          state: "complete",
          durationMs: Math.max(0, (event.timestamp - previous.startTimestamp) * 1000),
          responseBody: { available: false, size: null, reason: "redirect" },
        },
      });
      const hop = (tab.redirects.get(event.requestId) ?? 0) + 1;
      tab.redirects.set(event.requestId, hop);
      id = `${event.requestId}#${hop}`;
    }
    const { request } = event;
    const extra = previous && !event.redirectResponse ? previous.extraRequestHeaders : null;
    const pendingExtra = tab.entries.get(`extra:${event.requestId}`)?.extraRequestHeaders ?? null;
    const entry: Entry = {
      id,
      networkId: event.requestId,
      redirect: false,
      startTimestamp: event.timestamp,
      decodedSize: 0,
      status: null,
      mimeType: null,
      contentType: null,
      hasRequestBody: request.postData !== undefined || request.hasPostData === true,
      extraRequestHeaders: extra ?? pendingExtra,
      extraResponseHeaders: null,
    };
    tab.entries.delete(`extra:${event.requestId}`);
    tab.current.set(event.requestId, id);
    remember(tab, entry);
    const orphan = tab.orphanPreflights.get(event.requestId);
    if (orphan !== undefined) {
      tab.orphanPreflights.delete(event.requestId);
      entry.preflightId = orphan;
      push(tabId, { id: orphan, kind: "headers", fields: { preflightFor: id } });
    }
    const method = request.method || "GET";
    const isPreflight =
      method.toUpperCase() === "OPTIONS" &&
      headerValue(request.headers, "access-control-request-method") !== null;
    entry.method = method;
    entry.url = request.url;
    entry.requestHeaders = toHeaderList(request.headers);
    entry.appOrigin = options.frameOriginOf?.(tabId, event.frameId) ?? null;
    // El preflight llega por Network con el request real como iniciador (research R6, X2).
    let preflightFor: string | undefined;
    if (isPreflight && event.initiator?.type === "preflight" && event.initiator.requestId) {
      const owner = currentEntry(tabId, event.initiator.requestId);
      if (owner) {
        owner.preflightId = id;
        preflightFor = owner.id;
      } else {
        // Puede llegar antes que su request: se relacionan cuando llegue (research R6).
        tab.orphanPreflights.set(event.initiator.requestId, id);
        if (tab.orphanPreflights.size > MAX_ORPHAN_PREFLIGHTS) {
          const oldest = tab.orphanPreflights.keys().next().value;
          if (oldest !== undefined) tab.orphanPreflights.delete(oldest);
        }
      }
      entry.requestedHeaders =
        headerValue(request.headers, "access-control-request-headers") ?? undefined;
    }
    push(tabId, {
      id,
      kind: "start",
      fields: {
        seq: tab.seq++,
        method: method.slice(0, 64),
        ...truncateUrl(request.url),
        resourceType: (event.type ?? "Other").slice(0, 64),
        isPreflight,
        ...(preflightFor !== undefined ? { preflightFor } : {}),
        appOrigin: entry.appOrigin,
        requestHeaders: entry.extraRequestHeaders ?? toHeaderList(request.headers),
        responseHeaders: [],
        status: null,
        state: "pending",
        encodedSize: null,
        decodedSize: null,
        startedAt: event.wallTime !== undefined ? event.wallTime * 1000 : Date.now(),
        durationMs: null,
        mimeType: null,
        requestBody: entry.hasRequestBody
          ? {
              available: true,
              size: request.postData === undefined ? null : utf8ByteLength(request.postData),
            }
          : { available: false, size: null, reason: "none" },
        responseBody: { available: false, size: null, reason: "pending" },
      },
    });
  };

  const diagnose = (
    tabId: number,
    entry: Entry,
    status: { corsError: string; failedParameter?: string },
  ) => {
    const requestHeaders = entry.extraRequestHeaders ?? entry.requestHeaders ?? [];
    const originHeader = requestHeaders.find((h) => h.name.toLowerCase() === "origin")?.value;
    const preflight = entry.preflightId
      ? tabs.get(tabId)?.entries.get(entry.preflightId)
      : undefined;
    const diagnosis = classifyCorsFailure({
      corsError: status.corsError,
      failedParameter: status.failedParameter ?? "",
      method: entry.method ?? "GET",
      url: entry.url ?? "",
      appOrigin: entry.appOrigin ?? (originHeader ? parseOrigin(originHeader) : null),
      requestHeaders,
      responseStatus: entry.status,
      responseHeaders: entry.responseHeaders ?? [],
      preflight: preflight
        ? {
            exchangeId: preflight.id,
            status: preflight.status,
            headers: preflight.responseHeaders ?? [],
            ...(preflight.requestedHeaders !== undefined
              ? { requestedHeaders: preflight.requestedHeaders }
              : {}),
          }
        : null,
    });
    push(tabId, { id: entry.id, kind: "cors", fields: {}, cors: { diagnosis } });
    options.onCorsFailure?.(tabId, entry.id, diagnosis, entry.url ?? "");
  };

  /**
   * El bloqueo puede llegar antes que la respuesta de su preflight: se espera hasta
   * `PREFLIGHT_WAIT_MS` para diagnosticar con su status (research R6) y luego se diagnostica igual.
   */
  const diagnoseWhenReady = (
    tabId: number,
    entry: Entry,
    status: { corsError: string; failedParameter?: string },
    waited = 0,
  ) => {
    const preflight = entry.preflightId
      ? tabs.get(tabId)?.entries.get(entry.preflightId)
      : undefined;
    // Un error de preflight sin preflight visto todavía también espera: Network no ordena los
    // eventos del request y de su preflight.
    const pending = preflight
      ? preflight.status === null
      : /^Preflight|PreflightResponse$/.test(status.corsError);
    if (pending && waited < PREFLIGHT_WAIT_MS) {
      setTimeout(() => {
        if (tabs.has(tabId)) diagnoseWhenReady(tabId, entry, status, waited + PREFLIGHT_POLL_MS);
      }, PREFLIGHT_POLL_MS);
      return;
    }
    diagnose(tabId, entry, status);
  };

  cdp.onEvent((tabId, method, params) => {
    if (!method.startsWith("Network.")) return;
    try {
      if (injectedFault("capture")) throw new Error("fallo inyectado");
      onNetworkEvent(tabId, method, params);
    } catch {
      // La captura es pasiva: un error aquí no afecta al tráfico (principio II).
      logger.warn("Error al procesar un evento de captura.", { method });
    }
  });

  function onNetworkEvent(tabId: number, method: string, params: unknown) {
    switch (method) {
      case "Network.requestWillBeSent":
        onRequestWillBeSent(tabId, params as Parameters<typeof onRequestWillBeSent>[1]);
        return;
      case "Network.requestWillBeSentExtraInfo": {
        const event = params as { requestId: string; headers: Record<string, string> };
        const headers = toHeaderList(event.headers);
        const entry = currentEntry(tabId, event.requestId);
        if (entry) {
          entry.extraRequestHeaders = headers;
          push(tabId, { id: entry.id, kind: "headers", fields: { requestHeaders: headers } });
        } else {
          // Llegó antes que requestWillBeSent: se guarda para cuando llegue.
          const tab = tabOf(tabId);
          tab.entries.set(`extra:${event.requestId}`, {
            id: `extra:${event.requestId}`,
            networkId: event.requestId,
            redirect: false,
            startTimestamp: 0,
            decodedSize: 0,
            status: null,
            mimeType: null,
            contentType: null,
            hasRequestBody: false,
            extraRequestHeaders: headers,
            extraResponseHeaders: null,
          });
        }
        return;
      }
      case "Network.responseReceived": {
        const event = params as { requestId: string; response: CdpResponse };
        const entry = currentEntry(tabId, event.requestId);
        if (entry) onResponse(tabId, entry, event.response);
        return;
      }
      case "Network.responseReceivedExtraInfo": {
        const event = params as {
          requestId: string;
          headers: Record<string, string>;
          statusCode?: number;
        };
        const entry = currentEntry(tabId, event.requestId);
        if (!entry) return;
        entry.extraResponseHeaders = toHeaderList(event.headers);
        // Una respuesta bloqueada por CORS no emite responseReceived: el diagnóstico sale de aquí.
        entry.responseHeaders = entry.extraResponseHeaders;
        if (entry.status === null && typeof event.statusCode === "number")
          entry.status = event.statusCode;
        entry.contentType ??= headerValue(event.headers, "content-type");
        push(tabId, {
          id: entry.id,
          kind: "headers",
          fields: { responseHeaders: entry.extraResponseHeaders },
        });
        return;
      }
      case "Network.dataReceived": {
        const event = params as { requestId: string; dataLength: number };
        const entry = currentEntry(tabId, event.requestId);
        if (entry) entry.decodedSize += event.dataLength;
        return;
      }
      case "Network.loadingFinished": {
        const event = params as { requestId: string; timestamp: number; encodedDataLength: number };
        const entry = currentEntry(tabId, event.requestId);
        if (!entry) return;
        push(tabId, {
          id: entry.id,
          kind: "finish",
          fields: {
            state: "complete",
            encodedSize: Math.max(0, Math.round(event.encodedDataLength)),
            decodedSize: entry.decodedSize > 0 ? entry.decodedSize : null,
            durationMs: Math.max(0, (event.timestamp - entry.startTimestamp) * 1000),
            responseBody: responseBodyInfo(entry, Math.round(event.encodedDataLength)),
          },
        });
        return;
      }
      case "Network.loadingFailed": {
        const event = params as {
          requestId: string;
          timestamp: number;
          errorText: string;
          corsErrorStatus?: { corsError: string; failedParameter?: string };
        };
        const entry = currentEntry(tabId, event.requestId);
        if (!entry) return;
        push(tabId, {
          id: entry.id,
          kind: "fail",
          fields: {
            state: "failed",
            errorText: event.errorText.slice(0, 256),
            durationMs: Math.max(0, (event.timestamp - entry.startTimestamp) * 1000),
            responseBody: { available: false, size: null, reason: "none" },
          },
        });
        // Solo `corsErrorStatus` dice que es CORS; `blockedReason` es otra cosa (research R3).
        if (event.corsErrorStatus) diagnoseWhenReady(tabId, entry, event.corsErrorStatus);
        return;
      }
      default:
        return;
    }
  }

  return {
    exchangeIdOf: (tabId, networkId) => tabs.get(tabId)?.current.get(networkId) ?? null,

    effect(tabId, exchangeId, effect) {
      push(tabId, { id: exchangeId, kind: "effect", fields: {}, effect });
    },

    relaxed(tabId, exchangeId, info) {
      push(tabId, { id: exchangeId, kind: "cors", fields: {}, cors: { relaxed: info } });
    },

    async getBody(tabId, exchangeId, side) {
      const entry = tabs.get(tabId)?.entries.get(exchangeId);
      if (!entry || exchangeId.startsWith("extra:")) return { ok: false, reason: "unknown" };
      if (side === "request") {
        if (!entry.hasRequestBody) return { ok: false, reason: "none" };
        try {
          const { postData } = await cdp.send<{ postData: string }>(
            tabId,
            "Network.getRequestPostData",
            { requestId: entry.networkId },
          );
          const decoded = decodeBody({ body: postData, base64Encoded: false, contentType: null });
          return decoded.kind === "text"
            ? { ok: true, encoding: "text", content: decoded.text, size: decoded.size }
            : { ok: false, reason: decoded.kind };
        } catch {
          return { ok: false, reason: "evicted" };
        }
      }
      if (entry.redirect) return { ok: false, reason: "redirect" };
      try {
        const result = await cdp.send<{ body: string; base64Encoded: boolean }>(
          tabId,
          "Network.getResponseBody",
          { requestId: entry.networkId },
        );
        const decoded = decodeBody({
          body: result.body,
          base64Encoded: result.base64Encoded,
          contentType: entry.mimeType ?? entry.contentType,
        });
        return decoded.kind === "text"
          ? { ok: true, encoding: "text", content: decoded.text, size: decoded.size }
          : { ok: false, reason: decoded.kind };
      } catch {
        return { ok: false, reason: "evicted" };
      }
    },

    sessionEnded(tabId) {
      flush(tabId);
      tabs.delete(tabId);
    },
  };
}
