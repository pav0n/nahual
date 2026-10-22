import {
  makeCommand,
  parseSwMessage,
  type ErrorCode,
  type PanelMessageType,
  type PanelPayload,
  type PausedRequestView,
  type SessionState,
  type SwPayload,
} from "@nahual/protocol";
import { useCallback, useEffect, useRef, useState } from "react";

const PORT_NAME = "nahual-panel";
const RECONNECT_DELAY_MS = 500;
const MAX_RECENT = 5;

export type Resolved = SwPayload<"resolved"> & { url: string };

export interface SwConnection {
  state: SessionState | null;
  paused: PausedRequestView[];
  recent: Resolved[];
  error: { code: ErrorCode; messageKey: string } | null;
  send<T extends Exclude<PanelMessageType, "hello">>(type: T, payload: PanelPayload<T>): void;
  clearError(): void;
}

/**
 * Puerto con el service worker. Valida cada mensaje entrante (principio I) y, si el puerto se
 * cae porque el SW se reinició, lo reabre y repite `hello`.
 */
export function useSwConnection(tabId: number | null): SwConnection {
  const [state, setState] = useState<SessionState | null>(null);
  const [paused, setPaused] = useState<PausedRequestView[]>([]);
  const [recent, setRecent] = useState<Resolved[]>([]);
  const [error, setError] = useState<SwConnection["error"]>(null);
  const portRef = useRef<chrome.runtime.Port | null>(null);
  // URL de cada pausa, para mostrarla junto al resultado cuando ya salió de la lista.
  const urlsRef = useRef(new Map<string, string>());

  useEffect(() => {
    if (tabId === null) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      let port: chrome.runtime.Port;
      try {
        port = chrome.runtime.connect({ name: PORT_NAME });
      } catch {
        return; // La extensión se recargó: este panel ya no puede hablar con ella.
      }
      portRef.current = port;
      setPaused([]);

      port.onMessage.addListener((raw: unknown) => {
        const parsed = parseSwMessage(raw);
        if (!parsed.ok) {
          console.warn(`[nahual] Mensaje del SW descartado: ${parsed.error}`);
          return;
        }
        const message = parsed.message;
        switch (message.type) {
          case "state":
            setState(message.payload);
            if (message.payload.status !== "attached") setPaused([]);
            break;
          case "paused": {
            const view = message.payload;
            urlsRef.current.set(view.pausedId, view.url);
            setPaused((list) => [...list.filter((p) => p.pausedId !== view.pausedId), view]);
            break;
          }
          case "resolved": {
            const { pausedId } = message.payload;
            const url = urlsRef.current.get(pausedId) ?? "";
            urlsRef.current.delete(pausedId);
            setPaused((list) => list.filter((p) => p.pausedId !== pausedId));
            setRecent((list) => [{ ...message.payload, url }, ...list].slice(0, MAX_RECENT));
            break;
          }
          case "error":
            setError(message.payload);
            break;
          case "ack":
            break;
        }
      });

      port.onDisconnect.addListener(() => {
        portRef.current = null;
        if (!disposed) timer = setTimeout(connect, RECONNECT_DELAY_MS);
      });

      port.postMessage(makeCommand("hello", { tabId }));
    };

    connect();
    return () => {
      disposed = true;
      clearTimeout(timer);
      portRef.current?.disconnect();
      portRef.current = null;
    };
  }, [tabId]);

  const send = useCallback<SwConnection["send"]>((type, payload) => {
    setError(null);
    portRef.current?.postMessage(makeCommand(type, payload as never));
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return { state, paused, recent, error, send, clearError };
}
