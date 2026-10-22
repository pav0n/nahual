/**
 * Frontera entre Nahual y CDP (principio V). La lógica del service worker solo depende de esta
 * interfaz; `chrome-debugger.ts` la implementa sobre `chrome.debugger` y las pruebas usan
 * `tests/fakes/fake-debugger.ts`.
 */

export type DebuggerErrorCode =
  "already_attached" | "restricted_page" | "not_attached" | "invalid_interception" | "cdp_error";

export class DebuggerError extends Error {
  constructor(
    readonly code: DebuggerErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "DebuggerError";
  }
}

/** Razón de `chrome.debugger.onDetach`. */
export type DetachReason = "canceled_by_user" | "target_closed" | (string & {});

export interface DebuggerTarget {
  tabId?: number;
  attached: boolean;
  /** Presente cuando el cliente adjunto es una extensión. */
  extensionId?: string;
}

export interface DebuggerPort {
  attach(tabId: number): Promise<void>;
  detach(tabId: number): Promise<void>;
  send<R = unknown>(tabId: number, method: string, params?: Record<string, unknown>): Promise<R>;
  getTargets(): Promise<DebuggerTarget[]>;
  /** Devuelve una función para dejar de escuchar. */
  onEvent(listener: (tabId: number, method: string, params: unknown) => void): () => void;
  onDetach(listener: (tabId: number, reason: DetachReason) => void): () => void;
}

// Tipos mínimos del dominio Fetch de CDP que usa Nahual.

export interface FetchRequestPattern {
  urlPattern: string;
  requestStage: "Request" | "Response";
}

export interface FetchHeaderEntry {
  name: string;
  value: string;
}

export interface RequestPausedEvent {
  requestId: string;
  request: { url: string; method: string; headers: Record<string, string> };
  resourceType: string;
  responseStatusCode?: number;
  responseHeaders?: FetchHeaderEntry[];
  responseErrorReason?: string;
  networkId?: string;
}

export interface GetResponseBodyResult {
  body: string;
  base64Encoded: boolean;
}
