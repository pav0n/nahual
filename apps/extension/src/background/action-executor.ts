import {
  stripContentEncoding,
  textToBase64,
  utf8ByteLength,
  type FailReason,
  type Header,
  type MockAction,
  type PausedEdit,
  type Stage,
} from "@nahual/domain";
import { DebuggerError, type DebuggerPort } from "./debugger-port.ts";
import { injectedFault } from "./test-hooks.ts";

/** Lo que hace falta de un request pausado para resolverlo con CDP. */
export interface PausedTarget {
  requestId: string;
  stage: Stage;
  /** Status original (etapa Response). */
  status: number | null;
  /** Headers originales: base de una edición y de un reintento. */
  requestHeaders: Header[];
  responseHeaders: Header[];
  // 003: contexto para la relajación CORS (research R9).
  url?: string;
  method?: string;
  frameId?: string | undefined;
  exchangeId?: string;
}

export type ExecResult =
  | { ok: true }
  /** El cambio no se aplicó: el request continuó sin cambios (FR-021). */
  | { ok: false; outcome: "apply_failed"; errorKey: string }
  /** El request ya no existe (navegación, pestaña cerrada). */
  | { ok: false; outcome: "gone" };

export interface ActionExecutor {
  continueUnchanged(tabId: number, target: PausedTarget): Promise<ExecResult>;
  continueEdited(tabId: number, target: PausedTarget, edit: PausedEdit): Promise<ExecResult>;
  mock(tabId: number, target: PausedTarget, mock: MockAction): Promise<ExecResult>;
  fail(tabId: number, target: PausedTarget, reason: FailReason): Promise<ExecResult>;
  /** Respuesta local con estos headers (preflight 204 de la relajación CORS). */
  respond(
    tabId: number,
    target: PausedTarget,
    status: number,
    headers: Header[],
    base64Body: string,
  ): Promise<ExecResult>;
}

/** Errores de red de FR-019 ⇒ `Network.ErrorReason` de CDP (research R7). */
export const ERROR_REASONS: Record<FailReason, string> = {
  failed: "Failed",
  aborted: "Aborted",
  timedOut: "TimedOut",
  connectionRefused: "ConnectionRefused",
  nameNotResolved: "NameNotResolved",
  accessDenied: "AccessDenied",
  internetDisconnected: "InternetDisconnected",
};

const isGone = (error: unknown) =>
  error instanceof DebuggerError && error.code === "invalid_interception";

/**
 * Aplica acciones y ediciones con el dominio Fetch (research R7). Si un comando falla, reintenta
 * una vez sin cambios (principio II) para que el request nunca quede colgado.
 */
export function createActionExecutor(options: { debugger: DebuggerPort }): ActionExecutor {
  const { debugger: cdp } = options;

  const unchanged = (tabId: number, target: PausedTarget) =>
    cdp.send(
      tabId,
      target.stage === "request" ? "Fetch.continueRequest" : "Fetch.continueResponse",
      { requestId: target.requestId },
    );

  const run = async (tabId: number, target: PausedTarget, command: () => Promise<unknown>) => {
    try {
      if (injectedFault("apply")) throw new DebuggerError("cdp_error", "fallo inyectado");
      await command();
      return { ok: true } as const;
    } catch (error) {
      if (isGone(error)) return { ok: false, outcome: "gone" } as const;
      try {
        await unchanged(tabId, target);
      } catch (retryError) {
        if (isGone(retryError)) return { ok: false, outcome: "gone" } as const;
      }
      return { ok: false, outcome: "apply_failed", errorKey: "error_cdp_error" } as const;
    }
  };

  const fulfill = (
    tabId: number,
    target: PausedTarget,
    status: number,
    headers: Header[],
    base64Body: string,
  ) =>
    cdp.send(tabId, "Fetch.fulfillRequest", {
      requestId: target.requestId,
      responseCode: status,
      responseHeaders: headers,
      body: base64Body,
    });

  return {
    async continueUnchanged(tabId, target) {
      try {
        await unchanged(tabId, target);
        return { ok: true };
      } catch (error) {
        return isGone(error)
          ? { ok: false, outcome: "gone" }
          : { ok: false, outcome: "apply_failed", errorKey: "error_cdp_error" };
      }
    },

    continueEdited(tabId, target, edit) {
      if (target.stage === "request") {
        return run(tabId, target, () =>
          cdp.send(tabId, "Fetch.continueRequest", {
            requestId: target.requestId,
            ...(edit.method !== undefined ? { method: edit.method } : {}),
            ...(edit.url !== undefined ? { url: edit.url } : {}),
            headers: edit.headers ?? target.requestHeaders,
            ...(edit.body !== undefined ? { postData: textToBase64(edit.body) } : {}),
          }),
        );
      }
      const status = edit.status ?? target.status ?? 200;
      const headers = edit.headers ?? target.responseHeaders;
      if (edit.body !== undefined) {
        // El body editado ya va descomprimido: sin Content-Encoding y con su longitud real.
        const body = edit.body;
        return run(tabId, target, () =>
          fulfill(
            tabId,
            target,
            status,
            stripContentEncoding(headers, utf8ByteLength(body)),
            textToBase64(body),
          ),
        );
      }
      // Chrome exige status y headers juntos (001-D6b).
      return run(tabId, target, () =>
        cdp.send(tabId, "Fetch.continueResponse", {
          requestId: target.requestId,
          responseCode: status,
          responseHeaders: headers,
        }),
      );
    },

    mock(tabId, target, mock) {
      const body = mock.bodyEncoding === "base64" ? mock.body : textToBase64(mock.body);
      return run(tabId, target, () => fulfill(tabId, target, mock.status, mock.headers, body));
    },

    respond(tabId, target, status, headers, base64Body) {
      return run(tabId, target, () => fulfill(tabId, target, status, headers, base64Body));
    },

    fail(tabId, target, reason) {
      return run(tabId, target, () =>
        cdp.send(tabId, "Fetch.failRequest", {
          requestId: target.requestId,
          errorReason: ERROR_REASONS[reason],
        }),
      );
    },
  };
}
