import {
  MAX_PANEL_MESSAGE_CHARS,
  makeEvent,
  parsePanelMessage,
  type ErrorCode,
  type Issue,
  type PanelMessage,
  type SwMessage,
} from "@nahual/protocol";
import { logger } from "./logger.ts";

export const PANEL_PORT_NAME = "nahual-panel";

/** Lo mínimo de `chrome.runtime.Port` que usa el SW (permite probar con un puerto simulado). */
export interface PortLike {
  name: string;
  sender?: { id?: string; url?: string };
  postMessage(message: unknown): void;
  disconnect(): void;
  onMessage: { addListener(listener: (message: unknown) => void): void };
  onDisconnect: { addListener(listener: () => void): void };
}

export interface RuntimeLike {
  id: string;
  getURL(path: string): string;
  onConnect: { addListener(listener: (port: PortLike) => void): void };
}

export type CommandResult = { ok: true } | { ok: false; code: ErrorCode; issues?: Issue[] };

export type PanelCommand = Exclude<PanelMessage, { type: "hello" }>;

export interface PanelPortOptions {
  runtime: RuntimeLike;
  /** Ruta del panel dentro de la extensión, p. ej. `src/panel/panel.html`. */
  panelPath: string;
  /** Los mensajes esperan a esta promesa (limpieza de huérfanas al arrancar). */
  ready: Promise<void>;
  /** Tras el `ack` de `hello`: el SW envía el estado actual de la pestaña. */
  onHello(tabId: number): void;
  onCommand(tabId: number, command: PanelCommand): Promise<CommandResult>;
  /** Solo cuando se cierra el puerto dueño actual de la pestaña. */
  onPanelClosed(tabId: number): void;
  log?: (message: string) => void;
}

export interface PanelPort {
  /** Envía un evento al panel dueño de la pestaña, si hay uno conectado. */
  send(tabId: number, event: SwMessage): void;
  /** Pestañas con un panel conectado. */
  tabs(): number[];
}

/**
 * Puerto validado panel ↔ service worker (contracts/panel-protocol.md). Solo acepta
 * `onConnect` desde el panel de esta misma extensión; nunca `onConnectExternal`.
 * El listener se registra en cuanto se llama (requisito de MV3 para despertar al SW) y el
 * procesamiento espera a `ready`.
 */
export function createPanelPort(options: PanelPortOptions): PanelPort {
  const { runtime, ready } = options;
  const log = options.log ?? ((message: string) => logger.warn(message));
  const panelUrl = runtime.getURL(options.panelPath);
  const owners = new Map<number, PortLike>();

  const post = (port: PortLike, event: SwMessage) => {
    try {
      port.postMessage(event);
    } catch {
      // El panel se cerró entre medias: no hay a quién avisar.
    }
  };

  const isTrusted = (port: PortLike) => {
    const url = port.sender?.url ?? "";
    return (
      port.name === PANEL_PORT_NAME &&
      port.sender?.id === runtime.id &&
      (url === panelUrl || url.startsWith(`${panelUrl}?`) || url.startsWith(`${panelUrl}#`))
    );
  };

  runtime.onConnect.addListener((port) => {
    if (!isTrusted(port)) {
      log("Puerto rechazado: remitente no confiable.");
      port.disconnect();
      return;
    }

    let tabId: number | null = null;
    let queue = ready;

    const handle = async (raw: unknown) => {
      if (isTooLarge(raw)) {
        log("Mensaje descartado: demasiado grande.");
        return;
      }
      const parsed = parsePanelMessage(raw);
      if (!parsed.ok) {
        log(`Mensaje descartado: ${parsed.error}`);
        return;
      }
      const message = parsed.message;

      if (tabId === null) {
        if (message.type !== "hello") {
          log("Mensaje antes de hello: puerto cerrado.");
          port.disconnect();
          return;
        }
        tabId = message.payload.tabId;
        const previous = owners.get(tabId);
        owners.set(tabId, port);
        if (previous && previous !== port) previous.disconnect();
        post(port, makeEvent("ack", {}, message.id));
        options.onHello(tabId);
        return;
      }

      if (message.type === "hello") {
        post(port, error("invalid_message", message.id));
        return;
      }

      let result: CommandResult;
      try {
        result = await options.onCommand(tabId, message);
      } catch {
        result = { ok: false, code: "cdp_error" };
      }
      post(
        port,
        result.ok
          ? makeEvent("ack", {}, message.id)
          : error(result.code, message.id, result.issues),
      );
    };

    // Procesa en orden de llegada: cada mensaje espera al anterior (y a `ready`).
    port.onMessage.addListener((raw) => {
      queue = queue.then(() => handle(raw)).catch(() => {});
    });

    port.onDisconnect.addListener(() => {
      if (tabId !== null && owners.get(tabId) === port) {
        owners.delete(tabId);
        options.onPanelClosed(tabId);
      }
    });
  });

  return {
    send(tabId, event) {
      const owner = owners.get(tabId);
      if (owner) post(owner, event);
    },
    tabs: () => [...owners.keys()],
  };
}

function error(code: ErrorCode, correlationId: string, issues?: Issue[]) {
  const payload = { code, messageKey: `error_${code}` };
  return makeEvent(
    "error",
    issues && issues.length > 0 ? { ...payload, issues: issues.slice(0, 50) } : payload,
    correlationId,
  );
}

/** Límite de 6 MB antes de parsear (contracts/panel-protocol.md). */
function isTooLarge(raw: unknown): boolean {
  try {
    return JSON.stringify(raw).length > MAX_PANEL_MESSAGE_CHARS;
  } catch {
    return true;
  }
}
