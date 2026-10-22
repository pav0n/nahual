import { makeEvent } from "@nahual/protocol";
import { createChromeDebugger } from "./chrome-debugger.ts";
import { createDebuggerManager } from "./debugger-manager.ts";
import { createFetchInterceptor } from "./fetch-interceptor.ts";
import {
  createPanelPort,
  type CommandResult,
  type PanelCommand,
  type RuntimeLike,
} from "./panel-port.ts";
import { createSessionRegistry } from "./session-registry.ts";
import { cleanupOrphans } from "./startup-cleanup.ts";

// Todo se registra de forma síncrona al cargar el SW (requisito de MV3 para que los eventos de
// chrome.debugger y runtime.onConnect lo despierten); el procesamiento espera a la limpieza.

const cdp = createChromeDebugger();
const registry = createSessionRegistry(chrome.storage.session);

const sendState = (tabId: number) => {
  const { status, cause, attachedAt } = manager.get(tabId);
  const { patterns, pauseTimeoutSeconds } = interceptor.getConfig(tabId);
  port.send(
    tabId,
    makeEvent("state", { status, cause, attachedAt, patterns, pauseTimeoutSeconds }),
  );
};

const manager = createDebuggerManager({
  debugger: cdp,
  registry,
  onStateChange: sendState,
  onSessionEnded: (tabId) => {
    interceptor.sessionEnded(tabId);
    sendState(tabId);
  },
});

const interceptor = createFetchInterceptor({
  debugger: cdp,
  isAttached: (tabId) => manager.isAttached(tabId),
  onPaused: (tabId, view) => port.send(tabId, makeEvent("paused", view)),
  onResolved: (tabId, result) => port.send(tabId, makeEvent("resolved", result)),
});

async function onCommand(tabId: number, command: PanelCommand): Promise<CommandResult> {
  switch (command.type) {
    case "attach":
      return manager.attach(tabId);
    case "reconnect":
      return manager.reconnect(tabId);
    case "detach":
      return manager.detach(tabId, "user");
    case "setPatterns": {
      const result = await interceptor.setPatterns(tabId, command.payload.patterns);
      if (result.ok) sendState(tabId);
      return result;
    }
    case "setPauseTimeout": {
      const result = interceptor.setPauseTimeout(tabId, command.payload.seconds);
      if (result.ok) sendState(tabId);
      return result;
    }
    case "continue":
      return interceptor.continue(tabId, command.payload.pausedId, command.payload.headers);
  }
}

const ready = cleanupOrphans({ debugger: cdp, registry });

// Los callbacks de arriba usan `port`; solo se invocan tras cargar el módulo (eventos async).
const port = createPanelPort({
  runtime: chrome.runtime as unknown as RuntimeLike,
  panelPath: "src/panel/panel.html",
  ready,
  onHello: sendState,
  onCommand,
  onPanelClosed: (tabId) => {
    // Principio I: el debugger solo está adjunto mientras el panel está abierto (FR-004).
    void manager.detach(tabId, "panel_closed");
    interceptor.forget(tabId);
  },
});
