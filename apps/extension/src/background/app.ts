import { computeFetchPatterns, type Rule, type Settings } from "@nahual/domain";
import { makeEvent } from "@nahual/protocol";
import { createActionExecutor } from "./action-executor.ts";
import { createCorsRelaxer, createRelaxingExecutor } from "./cors-relaxer.ts";
import { createDebuggerManager } from "./debugger-manager.ts";
import type { DebuggerPort } from "./debugger-port.ts";
import { createFetchInterceptor } from "./fetch-interceptor.ts";
import { createFrameOrigins } from "./frame-origins.ts";
import { createNetworkCapture } from "./network-capture.ts";
import {
  createPanelPort,
  type CommandResult,
  type PanelCommand,
  type RuntimeLike,
} from "./panel-port.ts";
import { createRuleEngine } from "./rule-engine.ts";
import { createRuleStore } from "./rule-store.ts";
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
  const frames = createFrameOrigins({ debugger: cdp });

  const attachedTabs = () => port.tabs().filter((tabId) => manager.isAttached(tabId));

  const sendState = (tabId: number) => {
    const { status, cause, attachedAt } = manager.get(tabId);
    const site = manager.siteOf(tabId);
    port.send(
      tabId,
      makeEvent("state", {
        status,
        cause,
        attachedAt,
        site,
        activeRuleCount: rules.forSite(site).filter((r) => r.enabled).length,
        queueSize: engine.queueSize(tabId),
        globalPaused: settings.get().globalPaused,
        relaxationCount: relaxer.count(tabId),
      }),
    );
  };

  /** Fetch solo con los patrones de las reglas activas del sitio (principio VI, research R3). */
  const applyPatterns = (tabId: number) => {
    if (!manager.isAttached(tabId)) return;
    const patterns = computeFetchPatterns(rules.all(), {
      site: manager.siteOf(tabId),
      globalPaused: settings.get().globalPaused,
      relaxedApiOrigins: relaxer.patterns(tabId),
    });
    void interceptor.applyPatterns(tabId, patterns);
  };

  const sendRules = (tabId: number, list: Rule[]) =>
    port.send(tabId, makeEvent("rules", { rules: list, discarded: rules.discarded() }));

  const sendRelaxations = (tabId: number) =>
    port.send(tabId, makeEvent("relaxations", { items: relaxer.views(tabId) }));

  const notice = (messageKey: string) => {
    const event = makeEvent("notice", { messageKey });
    for (const tabId of port.tabs()) port.send(tabId, event);
  };

  const settings = createSettingsStore({
    storage: deps.localStorage,
    onChange: (value: Settings) => {
      // Producción y "pausar Nahual" cambian las relajaciones antes de recalcular patrones.
      relaxer.settingsChanged();
      for (const tabId of port.tabs()) {
        port.send(tabId, makeEvent("settings", value));
        applyPatterns(tabId);
        sendState(tabId);
      }
    },
    onNotice: notice,
  });

  const rules = createRuleStore({
    storage: deps.localStorage,
    onChange: (list) => {
      for (const tabId of port.tabs()) {
        sendRules(tabId, list);
        applyPatterns(tabId);
        sendState(tabId);
      }
    },
    onNotice: notice,
  });

  /** Relajaciones CORS por pestaña, solo en memoria (003, research R10). */
  const relaxer = createCorsRelaxer({
    settings: () => settings.get(),
    productionListReadable: () => settings.productionListReadable(),
    isAttached: (tabId) => manager.isAttached(tabId),
    hasFrameOrigin: (tabId, origin) => frames.hasOrigin(tabId, origin),
    onChange: (tabId) => {
      sendRelaxations(tabId);
      applyPatterns(tabId);
      sendState(tabId);
    },
    onNotice: (tabId, messageKey) => port.send(tabId, makeEvent("notice", { messageKey })),
  });

  const capture = createNetworkCapture({
    debugger: cdp,
    onUpdates: (tabId, updates) => port.send(tabId, makeEvent("exchanges", { updates })),
    frameOriginOf: (tabId, frameId) => frames.originOf(tabId, frameId),
    onCorsFailure: (tabId, _exchangeId, diagnosis, url) =>
      relaxer.noteFailure(tabId, url, diagnosis),
  });

  const engine = createRuleEngine({
    debugger: cdp,
    rules: () => rules.all(),
    settings: () => settings.get(),
    siteOf: (tabId) => manager.siteOf(tabId),
    capture,
    // La relajación CORS es el último paso antes de entregar cada respuesta (research R9).
    executor: createRelaxingExecutor({
      base: createActionExecutor({ debugger: cdp }),
      relaxer,
      frameOriginOf: (tabId, frameId) => frames.originOf(tabId, frameId),
      onRelaxed: (tabId, exchangeId, info) => capture.relaxed(tabId, exchangeId, info),
    }),
    onPaused: (tabId, view) => port.send(tabId, makeEvent("paused", view)),
    onResolved: (tabId, result) => port.send(tabId, makeEvent("resolved", result)),
    onQueueChange: (tabId) => sendState(tabId),
  });

  const interceptor = createFetchInterceptor({
    debugger: cdp,
    onRequestPaused: (tabId, event) => engine.handle(tabId, event),
  });

  const manager = createDebuggerManager({
    debugger: cdp,
    registry,
    onStateChange: sendState,
    onSessionEnded: (tabId) => {
      engine.sessionEnded(tabId);
      interceptor.sessionEnded(tabId);
      relaxer.sessionEnded(tabId);
      capture.sessionEnded(tabId);
      frames.sessionEnded(tabId);
      sendState(tabId);
    },
    onAttached: (tabId) => {
      void frames.seed(tabId);
      applyPatterns(tabId);
      sendState(tabId);
    },
    onNavigated: (tabId, site, url) => {
      engine.navigated(tabId);
      relaxer.refresh(tabId);
      port.send(tabId, makeEvent("navigated", { site, url }));
      applyPatterns(tabId);
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
      case "saveRule":
        return rules.save(command.payload.rule, manager.siteOf(tabId));
      case "deleteRule":
        return rules.remove(command.payload.ruleId);
      case "restoreRule":
        return rules.restore(command.payload.ruleId);
      case "setRuleEnabled":
        return rules.setEnabled(command.payload.ruleId, command.payload.enabled);
      case "reorderRules":
        return rules.reorder(command.payload.site, command.payload.ruleIds);
      case "resolvePaused": {
        const { pausedId, action, edit, mock } = command.payload;
        return engine.resolve(tabId, {
          pausedId,
          action,
          ...(edit ? { edit } : {}),
          ...(mock ? { mock } : {}),
        });
      }
      case "continueAll":
        await engine.continueAll(tabId);
        return { ok: true };
      case "relaxCors": {
        const result = relaxer.create(tabId, command.payload);
        return result.ok ? { ok: true } : result;
      }
      case "endRelaxation":
        relaxer.end(tabId, command.payload.relaxationId ?? null, "user");
        return { ok: true };
      case "getBody": {
        const { exchangeId, side } = command.payload;
        const body = await capture.getBody(tabId, exchangeId, side);
        if (!body.ok) return { ok: false, code: "body_unavailable" };
        port.send(
          tabId,
          makeEvent(
            "body",
            { exchangeId, side, encoding: body.encoding, content: body.content, size: body.size },
            command.id,
          ),
        );
        return { ok: true };
      }
      // 005: el servicio del repeater y la lista de ignorados llegan en US1 y US2.
      case "repeaterSend":
      case "repeaterCancel":
      case "getIgnores":
      case "setIgnores":
        return { ok: false, code: "invalid_message" };
    }
  }

  const ready = Promise.all([
    cleanupOrphans({ debugger: cdp, registry }),
    settings.ready,
    rules.ready,
  ]).then(() => {});

  const port = createPanelPort({
    runtime: deps.runtime,
    panelPath: deps.panelPath ?? "src/panel/panel.html",
    ready,
    onHello: (tabId) => {
      port.send(tabId, makeEvent("settings", settings.get()));
      sendRules(tabId, rules.all());
      sendRelaxations(tabId);
      sendState(tabId);
    },
    onCommand,
    onPanelClosed: (tabId) => {
      // Principio I: el debugger solo está adjunto mientras el panel está abierto (FR-004).
      void manager.detach(tabId, "panel_closed");
    },
  });

  return { ready, manager, settings, rules, engine, frames, relaxer, attachedTabs };
}
