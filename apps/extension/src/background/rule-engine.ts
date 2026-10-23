import {
  LIMITS,
  QueueMockActionSchema,
  decodeBody,
  headerValues,
  selectRule,
  validatePausedEdit,
  validateQueueMock,
  type BodyAccess,
  type BodyInfo,
  type ExchangeView,
  type Header,
  type PausedItemView,
  type Rule,
  type RuleEffect,
  type RuleResult,
  type Settings,
  type Stage,
} from "@nahual/domain";
import type { RESOLVE_ACTIONS } from "@nahual/protocol";
import type { ActionExecutor, ExecResult, PausedTarget } from "./action-executor.ts";
import type { DebuggerPort, RequestPausedEvent } from "./debugger-port.ts";
import { toHeaderList } from "./network-capture.ts";
import type { CommandResult } from "./panel-port.ts";
import { createPauseQueue, type QueueEntry } from "./pause-queue.ts";
import { injectedFault } from "./test-hooks.ts";

export interface ResolveRequest {
  pausedId: string;
  action: (typeof RESOLVE_ACTIONS)[number];
  edit?: Record<string, unknown>;
  mock?: Record<string, unknown>;
}

export interface RuleEngineOptions {
  debugger: DebuggerPort;
  rules(): Rule[];
  settings(): Settings;
  siteOf(tabId: number): string | null;
  capture: {
    exchangeIdOf(tabId: number, networkId: string): string | null;
    effect(tabId: number, exchangeId: string, effect: RuleEffect): void;
  };
  executor: ActionExecutor;
  onPaused(tabId: number, view: PausedItemView): void;
  onResolved(
    tabId: number,
    result: { pausedId: string; outcome: RuleResult; errorKey?: string },
  ): void;
  onQueueChange(tabId: number): void;
}

export interface RuleEngine {
  /** `Fetch.requestPaused` ⇒ regla ⇒ acción. Resuelve siempre el request. */
  handle(tabId: number, event: RequestPausedEvent): Promise<void>;
  resolve(tabId: number, request: ResolveRequest): Promise<CommandResult>;
  continueAll(tabId: number): Promise<void>;
  /** Commit de una navegación: los pausados del documento anterior salen de la cola (FR-025). */
  navigated(tabId: number): void;
  /** La sesión terminó: Chrome ya liberó las pausas, sin llamar a CDP. */
  sessionEnded(tabId: number): void;
  queueSize(tabId: number): number;
}

interface Queued extends QueueEntry {
  exchangeId: string;
  rule: Rule;
  target: PausedTarget;
  view: PausedItemView;
}

interface Bodies {
  request: BodyAccess;
  response: BodyAccess;
}

const contentTypeOf = (headers: Header[]) => headerValues(headers, "content-type")[0] ?? null;

function bodyInfoOf(body: BodyAccess): { text: string | null; info: BodyInfo } {
  switch (body.kind) {
    case "text":
      return {
        text: body.text,
        info: { available: true, size: new TextEncoder().encode(body.text).length },
      };
    case "binary":
      return { text: null, info: { available: false, size: null, reason: "binary" } };
    case "tooLarge":
      return { text: null, info: { available: false, size: null, reason: "tooLarge" } };
    default:
      return { text: null, info: { available: false, size: null, reason: "none" } };
  }
}

/**
 * Motor de reglas del SW (research R4): arma la vista del intercambio, elige la regla con
 * `selectRule`, pide el body una sola vez si una regla lo necesita y ejecuta la acción. Todo
 * request que no cumple una regla sigue al instante (FR-026).
 */
export function createRuleEngine(options: RuleEngineOptions): RuleEngine {
  const { debugger: cdp, executor, capture } = options;

  const effect = (
    tabId: number,
    item: { exchangeId: string; rule: Rule; stage: Stage },
    result: RuleResult,
    extra: Partial<RuleEffect> = {},
  ) =>
    capture.effect(tabId, item.exchangeId, {
      stage: item.stage,
      ruleId: item.rule.id,
      ruleName: item.rule.name,
      result,
      ...extra,
    });

  const finish = (tabId: number, item: Queued, outcome: RuleResult, errorKey?: string) => {
    effect(tabId, { ...item, stage: item.view.stage }, outcome, errorKey ? { errorKey } : {});
    options.onResolved(
      tabId,
      errorKey
        ? { pausedId: item.pausedId, outcome, errorKey }
        : { pausedId: item.pausedId, outcome },
    );
    options.onQueueChange(tabId);
  };

  const outcomeOf = (result: ExecResult, success: RuleResult): [RuleResult, string?] => {
    if (result.ok) return [success];
    if (result.outcome === "gone") return ["apply_failed", "error_request_gone"];
    return ["apply_failed", result.errorKey];
  };

  const queue = createPauseQueue<Queued>({
    onExpire: (tabId, item) => {
      void executor
        .continueUnchanged(tabId, item.target)
        .then(() => finish(tabId, item, "timed_out"));
    },
  });

  const loadRequestBody = async (
    tabId: number,
    event: RequestPausedEvent,
    headers: Header[],
  ): Promise<BodyAccess> => {
    if (event.request.postData !== undefined) {
      const decoded = decodeBody({
        body: event.request.postData,
        base64Encoded: false,
        contentType: contentTypeOf(headers),
      });
      return decoded.kind === "text"
        ? { kind: "text", text: decoded.text }
        : { kind: decoded.kind };
    }
    if (!event.request.hasPostData || !event.networkId) return { kind: "none" };
    try {
      const { postData } = await cdp.send<{ postData: string }>(
        tabId,
        "Network.getRequestPostData",
        {
          requestId: event.networkId,
        },
      );
      const decoded = decodeBody({
        body: postData,
        base64Encoded: false,
        contentType: contentTypeOf(headers),
      });
      return decoded.kind === "text"
        ? { kind: "text", text: decoded.text }
        : { kind: decoded.kind };
    } catch {
      return { kind: "none" };
    }
  };

  const loadResponseBody = async (
    tabId: number,
    event: RequestPausedEvent,
    headers: Header[],
  ): Promise<BodyAccess> => {
    const status = event.responseStatusCode ?? 0;
    if (status >= 300 && status < 400) return { kind: "none" };
    const length = Number(headerValues(headers, "content-length")[0] ?? NaN);
    if (length > LIMITS.bodyBytes) return { kind: "tooLarge" };
    try {
      const result = await cdp.send<{ body: string; base64Encoded: boolean }>(
        tabId,
        "Fetch.getResponseBody",
        {
          requestId: event.requestId,
        },
      );
      const decoded = decodeBody({
        body: result.body,
        base64Encoded: result.base64Encoded,
        contentType: contentTypeOf(headers),
      });
      return decoded.kind === "text"
        ? { kind: "text", text: decoded.text }
        : { kind: decoded.kind };
    } catch {
      return { kind: "none" };
    }
  };

  const pause = async (
    tabId: number,
    event: RequestPausedEvent,
    stage: Stage,
    rule: Rule,
    exchangeId: string,
    target: PausedTarget,
    view: ExchangeView,
    bodies: Bodies,
  ) => {
    // El editor necesita los bodies aunque la regla no los evaluara.
    if (bodies.request.kind === "unknown")
      bodies.request = await loadRequestBody(tabId, event, target.requestHeaders);
    if (stage === "response" && bodies.response.kind === "unknown") {
      bodies.response = await loadResponseBody(tabId, event, target.responseHeaders);
    }
    const request = bodyInfoOf(bodies.request);
    const response = bodyInfoOf(bodies.response);
    const timeoutMs = options.settings().pauseTimeoutSeconds * 1000;
    const item: Queued = {
      pausedId: event.requestId,
      pausedAt: 0,
      expiresAt: 0,
      exchangeId,
      rule,
      target,
      view: {
        pausedId: event.requestId,
        exchangeId,
        stage,
        ruleId: rule.id,
        ruleName: rule.name,
        pausedAt: 0,
        expiresAt: 0,
        request: {
          method: view.method,
          url: view.url,
          headers: target.requestHeaders,
          body: request.text,
          bodyInfo: request.info,
        },
        response:
          stage === "response"
            ? {
                status: target.status ?? 200,
                headers: target.responseHeaders,
                body: response.text,
                bodyInfo: response.info,
              }
            : null,
      },
    };
    if (!queue.add(tabId, item, timeoutMs)) {
      // Cola llena (FR-023): continúa sin cambios y se registra.
      await executor.continueUnchanged(tabId, target);
      effect(tabId, { exchangeId, rule, stage }, "queue_full");
      return;
    }
    item.view.pausedAt = item.pausedAt;
    item.view.expiresAt = item.expiresAt;
    effect(tabId, { exchangeId, rule, stage }, "paused");
    options.onPaused(tabId, item.view);
    options.onQueueChange(tabId);
  };

  async function handle(tabId: number, event: RequestPausedEvent): Promise<void> {
    if (injectedFault("engine")) throw new Error("fallo inyectado");
    if (event.responseErrorReason !== undefined) {
      // Falló la red: no hay respuesta que editar, se deja seguir el error tal cual.
      await cdp
        .send(tabId, "Fetch.continueRequest", { requestId: event.requestId })
        .catch(() => {});
      return;
    }
    const stage: Stage = event.responseStatusCode === undefined ? "request" : "response";
    const requestHeaders = toHeaderList(event.request.headers);
    const responseHeaders = event.responseHeaders ?? [];
    const target: PausedTarget = {
      requestId: event.requestId,
      stage,
      status: event.responseStatusCode ?? null,
      requestHeaders,
      responseHeaders,
    };
    const exchangeId =
      (event.networkId ? capture.exchangeIdOf(tabId, event.networkId) : null) ??
      event.networkId ??
      event.requestId;
    const bodies: Bodies = {
      request:
        event.request.postData !== undefined || event.request.hasPostData
          ? { kind: "unknown" }
          : { kind: "none" },
      response: stage === "response" ? { kind: "unknown" } : { kind: "none" },
    };
    if (event.request.postData !== undefined)
      bodies.request = await loadRequestBody(tabId, event, requestHeaders);
    const view = (): ExchangeView => ({
      method: event.request.method,
      url: event.request.url,
      resourceType: event.resourceType,
      requestHeaders,
      requestBody: bodies.request,
      status: event.responseStatusCode ?? null,
      responseHeaders,
      responseBody: bodies.response,
    });
    const context = {
      site: options.siteOf(tabId),
      stage,
      globalPaused: options.settings().globalPaused,
    };
    let selection = selectRule(options.rules(), view(), context);
    if (selection.kind === "needsBody") {
      if (bodies.request.kind === "unknown")
        bodies.request = await loadRequestBody(tabId, event, requestHeaders);
      if (bodies.response.kind === "unknown")
        bodies.response = await loadResponseBody(tabId, event, responseHeaders);
      selection = selectRule(options.rules(), view(), context);
    }

    if (selection.kind !== "match") {
      await executor.continueUnchanged(tabId, target);
      if (selection.kind === "none" && selection.unevaluable) {
        const { rule, reason } = selection.unevaluable;
        effect(tabId, { exchangeId, rule, stage }, "unevaluable", { reason });
      }
      return;
    }

    const { rule } = selection;
    switch (rule.action.kind) {
      case "pause":
        await pause(tabId, event, stage, rule, exchangeId, target, view(), bodies);
        return;
      default:
        // Las demás acciones llegan con la historia 4; mientras, continúa sin cambios.
        await executor.continueUnchanged(tabId, target);
        return;
    }
  }

  return {
    handle,

    async resolve(tabId, request) {
      const item = queue.get(tabId, request.pausedId);
      if (!item) return { ok: false, code: "unknown_paused_id" };
      const stage = item.view.stage;
      if (request.action === "continue" && request.edit && Object.keys(request.edit).length > 0) {
        const validation = validatePausedEdit(request.edit, stage);
        if (!validation.ok) return { ok: false, code: "edit_invalid", issues: validation.issues };
        if (!queue.take(tabId, request.pausedId)) return { ok: false, code: "unknown_paused_id" };
        const [outcome, errorKey] = outcomeOf(
          await executor.continueEdited(tabId, item.target, validation.value),
          "modified",
        );
        finish(tabId, item, outcome, errorKey);
        return { ok: true };
      }
      if (request.action === "mock") {
        const validation = validateQueueMock(request.mock);
        if (!validation.ok) return { ok: false, code: "edit_invalid", issues: validation.issues };
        if (!queue.take(tabId, request.pausedId)) return { ok: false, code: "unknown_paused_id" };
        const mock = QueueMockActionSchema.parse(validation.value);
        const [outcome, errorKey] = outcomeOf(
          await executor.mock(tabId, item.target, mock),
          "mocked",
        );
        finish(tabId, item, outcome, errorKey);
        return { ok: true };
      }
      if (!queue.take(tabId, request.pausedId)) return { ok: false, code: "unknown_paused_id" };
      if (request.action === "abort") {
        const [outcome, errorKey] = outcomeOf(
          await executor.fail(tabId, item.target, "aborted"),
          "aborted",
        );
        finish(tabId, item, outcome, errorKey);
        return { ok: true };
      }
      const [outcome, errorKey] = outcomeOf(
        await executor.continueUnchanged(tabId, item.target),
        "continued",
      );
      finish(tabId, item, outcome, errorKey);
      return { ok: true };
    },

    async continueAll(tabId) {
      await Promise.all(
        queue.takeAll(tabId).map(async (item) => {
          const [outcome, errorKey] = outcomeOf(
            await executor.continueUnchanged(tabId, item.target),
            "continued",
          );
          finish(tabId, item, outcome, errorKey);
        }),
      );
    },

    navigated(tabId) {
      const commit = Date.now();
      for (const item of queue.takeWhere(tabId, (i) => i.pausedAt < commit)) {
        void executor
          .continueUnchanged(tabId, item.target)
          .then(() => finish(tabId, item, "discarded_navigation"));
      }
    },

    sessionEnded(tabId) {
      for (const item of queue.takeAll(tabId)) finish(tabId, item, "continued_on_detach");
    },

    queueSize: (tabId) => queue.size(tabId),
  };
}
