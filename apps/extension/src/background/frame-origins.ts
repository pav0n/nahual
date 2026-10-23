import { parseOrigin } from "@nahual/domain";
import type { DebuggerPort } from "./debugger-port.ts";

export interface FrameOrigins {
  /** Origen del frame que hizo un request, o `null` si no se conoce o es opaco. */
  originOf(tabId: number, frameId: string | undefined): string | null;
  /** Algún frame de la pestaña tiene este origen (estado `idle` de una relajación). */
  hasOrigin(tabId: number, origin: string): boolean;
  /** Lee el árbol de frames al adjuntar: los frames anteriores no emiten `frameNavigated`. */
  seed(tabId: number): Promise<void>;
  sessionEnded(tabId: number): void;
}

interface CdpFrame {
  id: string;
  url: string;
  parentId?: string;
  securityOrigin?: string;
}

interface FrameTree {
  frame: CdpFrame;
  childFrames?: FrameTree[];
}

const originOfFrame = (frame: CdpFrame) =>
  (frame.securityOrigin ? parseOrigin(frame.securityOrigin) : null) ??
  (() => {
    try {
      return parseOrigin(new URL(frame.url).origin);
    } catch {
      return null;
    }
  })();

/**
 * Origen de cada frame por pestaña (003, research R4): el origen de la app de un request es el de
 * su frame, así un iframe de otro origen no queda cubierto por la relajación de la página.
 */
export function createFrameOrigins(options: { debugger: DebuggerPort }): FrameOrigins {
  const { debugger: cdp } = options;
  const tabs = new Map<number, Map<string, string | null>>();

  const tab = (tabId: number) => {
    let frames = tabs.get(tabId);
    if (!frames) tabs.set(tabId, (frames = new Map()));
    return frames;
  };

  const add = (tabId: number, frame: CdpFrame) => {
    if (frame.parentId === undefined) tab(tabId).clear();
    tab(tabId).set(frame.id, originOfFrame(frame));
  };

  cdp.onEvent((tabId, method, params) => {
    if (method === "Page.frameNavigated") add(tabId, (params as { frame: CdpFrame }).frame);
    else if (method === "Page.frameDetached")
      tabs.get(tabId)?.delete((params as { frameId: string }).frameId);
  });

  return {
    originOf: (tabId, frameId) =>
      frameId === undefined ? null : (tabs.get(tabId)?.get(frameId) ?? null),
    hasOrigin: (tabId, origin) => [...(tabs.get(tabId)?.values() ?? [])].includes(origin),
    async seed(tabId) {
      try {
        const { frameTree } = await cdp.send<{ frameTree: FrameTree }>(tabId, "Page.getFrameTree");
        const walk = (node: FrameTree) => {
          add(tabId, node.frame);
          node.childFrames?.forEach(walk);
        };
        walk(frameTree);
      } catch {
        // Sin árbol, el origen sale de los frameNavigated siguientes o del header Origin.
      }
    },
    sessionEnded(tabId) {
      tabs.delete(tabId);
    },
  };
}
