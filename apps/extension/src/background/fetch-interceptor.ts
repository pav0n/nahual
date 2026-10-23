import type { FetchPattern } from "@nahual/domain";
import type { DebuggerPort, RequestPausedEvent } from "./debugger-port.ts";
import { logger } from "./logger.ts";
import { isLabTab } from "./test-hooks.ts";

export interface FetchInterceptorOptions {
  debugger: DebuggerPort;
  /** Decide qué hacer con un request pausado (RuleEngine). Debe resolverlo siempre. */
  onRequestPaused(tabId: number, event: RequestPausedEvent): Promise<void>;
}

export interface FetchInterceptor {
  /**
   * Habilita Fetch con estos patrones o lo deshabilita si no hay ninguno (principio VI). Solo
   * llama a CDP si cambian. Nunca lanza.
   */
  applyPatterns(tabId: number, patterns: FetchPattern[]): Promise<void>;
  /** La sesión terminó: Fetch quedó deshabilitado con ella. */
  sessionEnded(tabId: number): void;
}

const key = (patterns: FetchPattern[]) => JSON.stringify(patterns);

/** Habilita el dominio Fetch con los patrones de las reglas activas y despacha sus pausas. */
export function createFetchInterceptor(options: FetchInterceptorOptions): FetchInterceptor {
  const { debugger: cdp } = options;
  const applied = new Map<number, string>();

  cdp.onEvent((tabId, method, params) => {
    if (method !== "Fetch.requestPaused" || isLabTab(tabId)) return;
    const event = params as RequestPausedEvent;
    options.onRequestPaused(tabId, event).catch(async () => {
      // Fallar de forma segura (principio II): el request sigue sin cambios.
      logger.warn("Error al evaluar un request pausado; continúa sin cambios.");
      const command =
        event.responseStatusCode === undefined && event.responseErrorReason === undefined
          ? "Fetch.continueRequest"
          : "Fetch.continueResponse";
      await cdp.send(tabId, command, { requestId: event.requestId }).catch(() => {});
    });
  });

  return {
    async applyPatterns(tabId, patterns) {
      const next = key(patterns);
      if ((applied.get(tabId) ?? key([])) === next) return;
      try {
        if (patterns.length === 0) await cdp.send(tabId, "Fetch.disable");
        else await cdp.send(tabId, "Fetch.enable", { patterns });
        applied.set(tabId, next);
      } catch {
        logger.warn("No se pudieron aplicar los patrones de Fetch.");
      }
    },
    sessionEnded(tabId) {
      applied.delete(tabId);
    },
  };
}
