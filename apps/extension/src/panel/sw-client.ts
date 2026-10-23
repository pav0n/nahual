import {
  makeCommand,
  parseSwMessage,
  type Issue,
  type PanelMessage,
  type PanelMessageType,
  type PanelPayload,
  type SwMessage,
  type ErrorCode,
} from "@nahual/protocol";

const PORT_NAME = "nahual-panel";
const RECONNECT_DELAY_MS = 500;

export type CommandType = Exclude<PanelMessageType, "hello">;
export type Reply =
  | { ok: true; events: SwMessage[] }
  | { ok: false; code: ErrorCode; messageKey: string; issues: Issue[] };

interface Pending {
  resolve(reply: Reply): void;
  events: SwMessage[];
}

export interface SwClientHandlers {
  onEvent(message: SwMessage): void;
  /** El puerto se abrió (o se reabrió tras un reinicio del SW) y `hello` fue aceptado. */
  onConnected(reconnected: boolean): void;
}

/**
 * Puerto con el service worker. Valida cada mensaje entrante (principio I), relaciona cada
 * comando con su `ack`/`error` por `correlationId` y, si el puerto se cae porque el SW se
 * reinició, lo reabre y repite `hello`.
 */
export function createSwClient() {
  let port: chrome.runtime.Port | null = null;
  let disposed = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const pending = new Map<string, Pending>();

  const failPending = () => {
    for (const p of pending.values()) {
      p.resolve({ ok: false, code: "cdp_error", messageKey: "error_cdp_error", issues: [] });
    }
    pending.clear();
  };

  function connect(tabId: number, handlers: SwClientHandlers, reconnected = false) {
    disposed = false;
    let next: chrome.runtime.Port;
    try {
      next = chrome.runtime.connect({ name: PORT_NAME });
    } catch {
      return; // La extensión se recargó: este panel ya no puede hablar con ella.
    }
    port = next;
    const hello = makeCommand("hello", { tabId });

    next.onMessage.addListener((raw: unknown) => {
      const parsed = parseSwMessage(raw);
      if (!parsed.ok) {
        console.warn(`[nahual] Mensaje del SW descartado: ${parsed.error}`);
        return;
      }
      const message = parsed.message;
      const correlationId = message.correlationId;
      if (correlationId === hello.id) {
        if (message.type === "ack") handlers.onConnected(reconnected);
        return;
      }
      const waiting = correlationId === undefined ? undefined : pending.get(correlationId);
      if (waiting && correlationId !== undefined) {
        if (message.type === "ack") {
          pending.delete(correlationId);
          waiting.resolve({ ok: true, events: waiting.events });
          return;
        }
        if (message.type === "error") {
          pending.delete(correlationId);
          waiting.resolve({
            ok: false,
            code: message.payload.code,
            messageKey: message.payload.messageKey,
            issues: message.payload.issues ?? [],
          });
          return;
        }
        // Respuesta asociada a un comando (p. ej. `body` de `getBody`).
        waiting.events.push(message);
      }
      handlers.onEvent(message);
    });

    next.onDisconnect.addListener(() => {
      if (port === next) port = null;
      failPending();
      if (!disposed) timer = setTimeout(() => connect(tabId, handlers, true), RECONNECT_DELAY_MS);
    });

    next.postMessage(hello);
  }

  return {
    connect: (tabId: number, handlers: SwClientHandlers) => connect(tabId, handlers),
    disconnect() {
      disposed = true;
      clearTimeout(timer);
      port?.disconnect();
      port = null;
      failPending();
    },
    send<T extends CommandType>(type: T, payload: PanelPayload<T>): Promise<Reply> {
      const current = port;
      if (!current) {
        return Promise.resolve({
          ok: false,
          code: "cdp_error",
          messageKey: "error_disconnected",
          issues: [],
        });
      }
      const command: PanelMessage = makeCommand(type, payload as never);
      return new Promise<Reply>((resolve) => {
        pending.set(command.id, { resolve, events: [] });
        try {
          current.postMessage(command);
        } catch {
          pending.delete(command.id);
          resolve({ ok: false, code: "cdp_error", messageKey: "error_disconnected", issues: [] });
        }
      });
    },
  };
}

/** Cliente único del panel: un panel inspecciona una sola pestaña. */
export const sw = createSwClient();
