import type { Settings } from "@nahual/domain";
import { makeEvent } from "@nahual/protocol";
import { createDebuggerManager } from "./debugger-manager.ts";
import type { DebuggerPort } from "./debugger-port.ts";
import { createFetchInterceptor } from "./fetch-interceptor.ts";
import {
  createPanelPort,
  type CommandResult,
  type PanelCommand,
  type RuntimeLike,
} from "./panel-port.ts";
import { createSessionRegistry, type SessionStorageLike } from "./session-registry.ts";
import { createSettingsStore } from "./settings-store.ts";
import { cleanupOrphans } from "./startup-cleanup.ts";
import type { LocalStorageLike } from "./storage-port.ts";

export interface BackgroundDeps {
  debugger: DebuggerPort;
  runtime: RuntimeLike;
  sessionStorage: SessionStorageLike;
  localStorage: LocalStorageLike;
  panelPath?: string;
}

/**
 * Cableado del service worker. Recibe sus adaptadores para poder probarse con el CDP y el
 * storage simulados; `index.ts` lo arranca con los de Chrome. Todo listener se registra de forma
 * síncrona (requisito de MV3) y el procesamiento espera a `ready`.
 */
export function createBackground(deps: BackgroundDeps) {
  const { debugger: cdp } = deps;
  const registry = createSessionRegistry(deps.sessionStorage);

  const sendState = (tabId: number) => {
    const { status, cause, attachedAt } = manager.get(tabId);
    port.send(
      tabId,
      makeEvent("state", {
        status,
        cause,
        attachedAt,
        site: manager.siteOf(tabId),
        activeRuleCount: 0,
        queueSize: 0,
        globalPaused: settings.get().globalPaused,
      }),
    );
  };

  const broadcastSettings = (value: Settings) => {
    for (const tabId of port.tabs()) {
      port.send(tabId, makeEvent("settings", value));
      sendState(tabId);
    }
  };

  const notice = (tabId: number | null, messageKey: string) => {
    const event = makeEvent("notice", { messageKey });
    for (const tab of tabId === null ? port.tabs() : [tabId]) port.send(tab, event);
  };

  const settings = createSettingsStore({
    storage: deps.localStorage,
    onChange: broadcastSettings,
    onNotice: (key) => notice(null, key),
  });

  const interceptor = createFetchInterceptor({
    debugger: cdp,
    // Sin reglas todavía: todo continúa sin cambios (las reglas llegan con la historia 2).
    onRequestPaused: async (tabId, event) => {
      const command =
        event.responseStatusCode === undefined && event.responseErrorReason === undefined
          ? "Fetch.continueRequest"
          : "Fetch.continueResponse";
      await cdp.send(tabId, command, { requestId: event.requestId });
    },
  });

  const manager = createDebuggerManager({
    debugger: cdp,
    registry,
    onStateChange: sendState,
    onSessionEnded: (tabId) => {
      interceptor.sessionEnded(tabId);
      sendState(tabId);
    },
    onAttached: (tabId) => {
      void interceptor.applyPatterns(tabId, []);
      sendState(tabId);
    },
    onNavigated: (tabId, site, url) => {
      port.send(tabId, makeEvent("navigated", { site, url }));
      sendState(tabId);
    },
  });

  async function onCommand(tabId: number, command: PanelCommand): Promise<CommandResult> {
    switch (command.type) {
      case "attach": {
        const result = await manager.attach(tabId);
        if (result.ok && command.payload.consent && !settings.get().attachConsent) {
          await settings.update({ attachConsent: true });
        }
        return result;
      }
      case "reconnect":
        return manager.reconnect(tabId);
      case "detach":
        return manager.detach(tabId, "user");
      case "updateSettings":
        return settings.update(command.payload);
      default:
        return { ok: false, code: "invalid_message" };
    }
  }

  const ready = Promise.all([cleanupOrphans({ debugger: cdp, registry }), settings.ready]).then(
    () => {},
  );

  const port = createPanelPort({
    runtime: deps.runtime,
    panelPath: deps.panelPath ?? "src/panel/panel.html",
    ready,
    onHello: (tabId) => {
      port.send(tabId, makeEvent("settings", settings.get()));
      port.send(tabId, makeEvent("rules", { rules: [], discarded: [] }));
      sendState(tabId);
    },
    onCommand,
    onPanelClosed: (tabId) => {
      // Principio I: el debugger solo está adjunto mientras el panel está abierto (FR-004).
      void manager.detach(tabId, "panel_closed");
    },
  });

  return { ready, manager, settings };
}
