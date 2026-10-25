import {
  RepeaterRequestSchema,
  forbiddenHeaders,
  utf8Bytes,
  type RepeaterError,
  type RepeaterErrorCode,
  type RepeaterMode,
  type RepeaterOutcome,
  type RepeaterRequest,
} from "@nahual/domain";
import type { BodyResult, ExchangeSnapshot } from "../network-capture.ts";
import type { CleanSendResult } from "./clean-send.ts";
import type { PageSender } from "./page-send.ts";
import type { PageSendArgument, PageSendResult } from "./page-template.ts";

/** `repeaterResult` sin el sobre (contracts/panel-protocol.md). */
export type RepeaterResultPayload = RepeaterOutcome & {
  sendId: string;
  state: "done" | "failed" | "cancelled";
};

export interface RepeaterServiceOptions {
  pageSender: PageSender;
  cleanSender: { send(argument: PageSendArgument, signal: AbortSignal): Promise<CleanSendResult> };
  isAttached(tabId: number): boolean;
  capture: {
    snapshot(tabId: number, exchangeId: string): ExchangeSnapshot | null;
    getBody(tabId: number, exchangeId: string, side: "response"): Promise<BodyResult>;
  };
  onResult(tabId: number, result: RepeaterResultPayload): void;
  /** Sin respuesta en este tiempo ⇒ `timeout` (research R4; cubre pausas de 002 de hasta 300 s). */
  timeoutMs?: number;
  /** Espera a que la captura cierre el intercambio tras responder la plantilla. */
  settleGraceMs?: number;
  now?(): number;
}

export interface RepeaterService {
  send(tabId: number, payload: { sendId: string; mode: RepeaterMode; request: unknown }): void;
  cancel(tabId: number, sendId: string): void;
  /** Envío en contexto de página en curso: la captura marca su request (research R2). */
  currentPageSend(tabId: number): string | null;
  onRepeaterRequest(tabId: number, sendId: string, exchangeId: string): void;
  onRepeaterSettled(tabId: number, sendId: string, exchangeId: string): void;
  /** Navegación del marco principal, detach o cierre: los envíos de página se pierden. */
  contextLost(tabId: number): void;
}

interface Pending {
  sendId: string;
  tabId: number;
  mode: RepeaterMode;
  argument: PageSendArgument;
  notSent: string[];
  startedAt: number;
  controller: AbortController;
  timer: ReturnType<typeof setTimeout> | null;
  exchangeId: string | null;
  settled: boolean;
  onSettled: (() => void) | null;
  cancelled: boolean;
  done: boolean;
}

const EMPTY: Omit<RepeaterOutcome, "notSentHeaders"> = {
  response: null,
  error: null,
  durationMs: null,
  size: null,
  preflight: null,
  ruleEffects: [],
  relaxed: false,
  cors: null,
  exchangeId: null,
};

const failure = (code: RepeaterErrorCode, params?: string[]): RepeaterError => ({
  code,
  messageKey: `repeater_error_${code}`,
  ...(params && params.length > 0
    ? { params: params.map((p) => p.slice(0, 512)).slice(0, 5) }
    : {}),
});

function toArgument(sendId: string, request: RepeaterRequest): PageSendArgument {
  const { body } = request;
  return {
    sendId,
    method: request.method,
    url: request.url,
    headers: request.headers.filter((h) => h.enabled).map((h) => [h.name, h.value]),
    body:
      body.kind === "text"
        ? { kind: "text", text: body.text }
        : body.kind === "original"
          ? { kind: "original", base64: body.base64 }
          : { kind: "none" },
  };
}

/**
 * Servicio del repeater del SW (005): valida cada envío con su propio schema (no confía en el
 * panel), elige el modo efectivo, ejecuta los de contexto de página de uno en uno por pestaña
 * (así la captura sabe a qué envío pertenece cada request, research R2) y garantiza que todo
 * envío termina: respuesta, error con causa, cancelado o `timeout` (principio II).
 */
export function createRepeaterService(options: RepeaterServiceOptions): RepeaterService {
  const timeoutMs = options.timeoutMs ?? 300_000;
  const settleGraceMs = options.settleGraceMs ?? 3_000;
  const now = options.now ?? (() => Date.now());
  const pending = new Map<string, Pending>();
  const queues = new Map<number, Pending[]>();
  const current = new Map<number, Pending>();

  const finish = (
    item: Pending,
    result: Omit<RepeaterResultPayload, "sendId" | "notSentHeaders">,
  ) => {
    if (item.done) return;
    item.done = true;
    if (item.timer) clearTimeout(item.timer);
    pending.delete(item.sendId);
    options.onResult(item.tabId, { ...result, sendId: item.sendId, notSentHeaders: item.notSent });
    if (current.get(item.tabId) === item) {
      current.delete(item.tabId);
      next(item.tabId);
    } else {
      const queue = queues.get(item.tabId);
      if (queue)
        queues.set(
          item.tabId,
          queue.filter((q) => q !== item),
        );
    }
  };

  const fail = (item: Pending, error: RepeaterError, extra: Partial<RepeaterOutcome> = {}) =>
    finish(item, {
      ...EMPTY,
      durationMs: now() - item.startedAt,
      ...extra,
      error,
      state: error.code === "cancelled" ? "cancelled" : "failed",
    });

  const waitSettled = (item: Pending) =>
    new Promise<void>((resolve) => {
      if (item.settled || item.exchangeId === null) return resolve();
      const grace = setTimeout(resolve, settleGraceMs);
      item.onSettled = () => {
        clearTimeout(grace);
        resolve();
      };
    });

  async function completePage(item: Pending, result: PageSendResult) {
    if (item.done) return;
    if (item.cancelled) return fail(item, failure("cancelled"));
    if (!result.ok && result.errorName === "ContextLost")
      return fail(item, failure("context_lost"));
    await waitSettled(item);
    if (item.done) return;
    const snap = item.exchangeId ? options.capture.snapshot(item.tabId, item.exchangeId) : null;
    const base: Partial<RepeaterOutcome> = {
      exchangeId: item.exchangeId,
      durationMs: snap?.durationMs ?? now() - item.startedAt,
      ruleEffects: snap?.effects ?? [],
      relaxed: snap?.relaxed ?? false,
      cors: snap?.diagnosis ?? null,
      preflight: snap?.preflight
        ? { status: snap.preflight.status, blocked: snap.diagnosis !== null }
        : null,
    };
    const metadataResponse = (
      reason: "none" | "binary" | "tooLarge" | "evicted" | "unknown" | "redirect",
    ) =>
      snap && snap.status !== null
        ? {
            status: snap.status,
            headers: snap.responseHeaders,
            body: {
              encoding: "none" as const,
              info: {
                available: false,
                size: snap.decodedSize > 0 ? snap.decodedSize : null,
                reason,
              },
            },
            mimeType: snap.mimeType,
          }
        : null;
    if (!result.ok) {
      if (snap?.diagnosis) {
        return fail(item, failure("cors_blocked"), { ...base, response: metadataResponse("none") });
      }
      return fail(item, failure("network", [snap?.errorText ?? result.message]), base);
    }
    const body = item.exchangeId
      ? await options.capture.getBody(item.tabId, item.exchangeId, "response")
      : ({ ok: false, reason: "unknown" } as const);
    if (item.done) return;
    const status = snap?.status ?? result.status;
    const response = body.ok
      ? {
          status,
          headers: snap?.responseHeaders ?? [],
          body: { encoding: "text" as const, text: body.content },
          mimeType: snap?.mimeType ?? null,
        }
      : (metadataResponse(body.reason) ?? {
          status,
          headers: [],
          body: {
            encoding: "none" as const,
            info: { available: false, size: null, reason: body.reason },
          },
          mimeType: null,
        });
    finish(item, {
      ...EMPTY,
      ...base,
      response,
      size: body.ok
        ? utf8Bytes(body.content)
        : snap && snap.decodedSize > 0
          ? snap.decodedSize
          : null,
      state: "done",
    });
  }

  function startTimer(item: Pending) {
    item.timer = setTimeout(() => {
      if (item.mode === "page") void options.pageSender.abort(item.tabId, item.sendId);
      item.controller.abort();
      fail(item, failure("timeout"));
    }, timeoutMs);
  }

  function next(tabId: number) {
    if (current.has(tabId)) return;
    const queue = queues.get(tabId) ?? [];
    const item = queue.shift();
    if (!item) return;
    current.set(tabId, item);
    // El tiempo cuenta desde que sale, no desde que entró en la cola.
    startTimer(item);
    void options.pageSender
      .send(tabId, item.argument)
      .then((result) => completePage(item, result))
      .catch(() => fail(item, failure("context_lost")));
  }

  async function runClean(item: Pending) {
    const result = await options.cleanSender.send(item.argument, item.controller.signal);
    if (item.done) return;
    if (!result.ok) return fail(item, result.error);
    finish(item, {
      ...EMPTY,
      response: result.response,
      size: result.size,
      durationMs: now() - item.startedAt,
      state: "done",
    });
  }

  return {
    send(tabId, { sendId, mode, request }) {
      const item: Pending = {
        sendId,
        tabId,
        mode,
        argument: { sendId, method: "", url: "", headers: [], body: { kind: "none" } },
        notSent: [],
        startedAt: now(),
        controller: new AbortController(),
        timer: null,
        exchangeId: null,
        settled: false,
        onSettled: null,
        cancelled: false,
        done: false,
      };
      if (pending.has(sendId)) return fail(item, failure("invalid_request", ["sendId"]));
      const parsed = RepeaterRequestSchema.safeParse(request);
      if (!parsed.success) {
        const paths = [...new Set(parsed.error.issues.map((i) => i.path.join(".")))];
        return fail(item, failure("invalid_request", paths));
      }
      if (mode === "page" && !options.isAttached(tabId)) return fail(item, failure("not_attached"));
      item.argument = toArgument(sendId, parsed.data);
      item.notSent = forbiddenHeaders(parsed.data.headers);
      pending.set(sendId, item);
      if (mode === "clean") {
        startTimer(item);
        void runClean(item).catch(() => fail(item, failure("network")));
        return;
      }
      queues.set(tabId, [...(queues.get(tabId) ?? []), item]);
      next(tabId);
    },

    cancel(tabId, sendId) {
      const item = pending.get(sendId);
      if (!item || item.tabId !== tabId) return;
      item.cancelled = true;
      if (item.mode === "clean") {
        item.controller.abort();
        return;
      }
      if (current.get(tabId) === item) void options.pageSender.abort(tabId, sendId);
      else fail(item, failure("cancelled"));
    },

    currentPageSend: (tabId) => current.get(tabId)?.sendId ?? null,

    onRepeaterRequest(tabId, sendId, exchangeId) {
      const item = pending.get(sendId);
      // Una redirección abre un intercambio nuevo: vale el último salto.
      if (item && item.tabId === tabId) item.exchangeId = exchangeId;
    },

    onRepeaterSettled(tabId, sendId, exchangeId) {
      const item = pending.get(sendId);
      if (!item || item.tabId !== tabId || item.exchangeId !== exchangeId) return;
      item.settled = true;
      item.onSettled?.();
    },

    contextLost(tabId) {
      const lost = [current.get(tabId), ...(queues.get(tabId) ?? [])].filter(
        (item): item is Pending => item !== undefined,
      );
      queues.delete(tabId);
      current.delete(tabId);
      options.pageSender.invalidate(tabId);
      for (const item of lost) fail(item, failure("context_lost"));
    },
  };
}
