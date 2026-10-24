import type { DebuggerPort } from "../debugger-port.ts";
import {
  PAGE_ABORT,
  PAGE_SEND,
  type PageSendArgument,
  type PageSendResult,
} from "./page-template.ts";

export interface PageSender {
  /** Ejecuta `PAGE_SEND` en el mundo aislado del marco principal (research R1). */
  send(tabId: number, argument: PageSendArgument): Promise<PageSendResult>;
  /** Aborta el `fetch` de un envío en curso (research R4). */
  abort(tabId: number, sendId: string): Promise<void>;
  /** El documento cambió: el próximo envío crea un mundo nuevo. */
  invalidate(tabId: number): void;
}

const WORLD_NAME = "nahual-repeater";
/** Mensaje de CDP cuando el `executionContextId` ya no existe (antes de ejecutar nada). */
const NOT_FOUND = /Cannot find context/i;

interface FrameTree {
  frameTree: { frame: { id: string } };
}

/**
 * Envío en contexto de página (005, research R1): un mundo aislado comparte cookies y origen con
 * la página pero no sus globales, así que la página no puede reemplazar el `fetch` que usa la
 * plantilla. El request viaja solo en `arguments`.
 */
export function createPageSender(options: { debugger: DebuggerPort }): PageSender {
  const { debugger: cdp } = options;
  const worlds = new Map<number, number>();

  const world = async (tabId: number) => {
    const known = worlds.get(tabId);
    if (known !== undefined) return known;
    const { frameTree } = await cdp.send<FrameTree>(tabId, "Page.getFrameTree");
    const { executionContextId } = await cdp.send<{ executionContextId: number }>(
      tabId,
      "Page.createIsolatedWorld",
      { frameId: frameTree.frame.id, worldName: WORLD_NAME },
    );
    worlds.set(tabId, executionContextId);
    return executionContextId;
  };

  const call = async <T>(tabId: number, declaration: string, value: unknown): Promise<T> => {
    const executionContextId = await world(tabId);
    const reply = await cdp.send<{ result: { value?: unknown }; exceptionDetails?: unknown }>(
      tabId,
      "Runtime.callFunctionOn",
      {
        executionContextId,
        functionDeclaration: declaration,
        arguments: [{ value }],
        awaitPromise: true,
        returnByValue: true,
      },
    );
    if (reply.exceptionDetails) throw new Error("exception");
    return reply.result.value as T;
  };

  return {
    async send(tabId, argument) {
      // Un mundo que ya no existe (navegación, recarga) se recrea una vez. Solo si el error dice
      // que el contexto no se encontró, es decir, antes de ejecutar: si se destruyó a mitad del
      // envío, el request pudo salir y reintentar lo enviaría dos veces.
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          return await call<PageSendResult>(tabId, PAGE_SEND, argument);
        } catch (error) {
          worlds.delete(tabId);
          if (!NOT_FOUND.test(error instanceof Error ? error.message : "")) break;
        }
      }
      return { ok: false, errorName: "ContextLost", message: "execution context unavailable" };
    },

    async abort(tabId, sendId) {
      if (!worlds.has(tabId)) return;
      await call(tabId, PAGE_ABORT, sendId).catch(() => undefined);
    },

    invalidate(tabId) {
      worlds.delete(tabId);
    },
  };
}
