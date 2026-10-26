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
import {
  chromeCleanSendDeps,
  createCleanSender,
  type CleanSendDeps,
} from "./repeater/clean-send.ts";
import { createIgnoresStore } from "./repeater/ignores-store.ts";
import { createPageSender } from "./repeater/page-send.ts";
import { createRepeaterService } from "./repeater/repeater-service.ts";
import { createActiveProfiles } from "./active-profiles.ts";
import { createHookRunner } from "./hook-runner.ts";
import { createImportService } from "./import-service.ts";
import { createProfileStore } from "./profile-store.ts";
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
  /** Red y permiso de host del contexto limpio del repeater (005); por defecto, los de Chrome. */
  cleanSend?: CleanSendDeps;
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
    const profile = active.get(tabId);
    port.send(
      tabId,
      makeEvent("state", {
        status,
        cause,
        attachedAt,
        site,
        // 007 (FR-024): solo las reglas que actúan con el perfil activo de la pestaña.
        activeRuleCount: rules
          .forSite(site)
          .filter((r) => r.enabled && (profile === null || r.profileIds.includes(profile))).length,
        queueSize: engine.queueSize(tabId),
        globalPaused: settings.get().globalPaused,
        relaxationCount: relaxer.count(tabId),
        activeProfileId: profile,
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
      activeProfileId: active.get(tabId),
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
    profileIdsOf: (site) => profiles.idsOf(site),
  });

  /** 007: perfiles por sitio (contracts/storage.md) y el activo de cada pestaña (research R13). */
  const profiles = createProfileStore({
    storage: deps.localStorage,
    rules,
    onChange: (view) => {
      for (const tabId of port.tabs()) {
        port.send(tabId, makeEvent("profiles", view));
        applyPatterns(tabId);
        sendState(tabId);
      }
    },
    onNotice: notice,
  });

  /** 007: configuración portable y Requestly, en una sola escritura (research R10). */
  const imports = createImportService({
    rules,
    profiles,
    settings,
    renamed: (name) =>
      globalThis.chrome?.i18n?.getMessage("profile_imported_name", name) || `${name} (imported)`,
  });

  const active = createActiveProfiles({
    lastActive: () => profiles.lastActive(),
    siteOfProfile: (id) => profiles.all().find((p) => p.id === id)?.site ?? null,
    remember: (site, id) => void profiles.setLastActive(site, id),
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
    repeaterSendFor: (tabId) => repeater.currentPageSend(tabId),
    onRepeaterRequest: (tabId, sendId, exchangeId) =>
      repeater.onRepeaterRequest(tabId, sendId, exchangeId),
    onRepeaterSettled: (tabId, sendId, exchangeId) =>
      repeater.onRepeaterSettled(tabId, sendId, exchangeId),
  });

  /** Rutas y headers ignorados en el diff, por endpoint (005, research R10). */
  const ignores = createIgnoresStore({ storage: deps.localStorage, onNotice: notice });

  /** Repeater (005): envíos en contexto de página por la pestaña y en contexto limpio por el SW. */
  const repeater = createRepeaterService({
    pageSender: createPageSender({ debugger: cdp }),
    cleanSender: createCleanSender(deps.cleanSend ?? chromeCleanSendDeps),
    isAttached: (tabId) => manager.isAttached(tabId),
    capture,
    onResult: (tabId, result) => port.send(tabId, makeEvent("repeaterResult", result)),
  });

  // La relajación CORS es el último paso antes de entregar cada respuesta (research R9).
  const executor = createRelaxingExecutor({
    base: createActionExecutor({ debugger: cdp }),
    relaxer,
    frameOriginOf: (tabId, frameId) => frames.originOf(tabId, frameId),
    onRelaxed: (tabId, exchangeId, info) => capture.relaxed(tabId, exchangeId, info),
  });

  /** Hooks (006): el panel ejecuta la cadena en el sandbox y devuelve el resultado. */
  const hooks = createHookRunner({
    executor,
    siteOf: (tabId) => manager.siteOf(tabId),
    send: (tabId, event) => {
      if (!port.tabs().includes(tabId)) return false;
      port.send(tabId, makeEvent("hookRun", event));
      return true;
    },
    effect: (tabId, exchangeId, effect) => capture.effect(tabId, exchangeId, effect),
  });

  const engine = createRuleEngine({
    debugger: cdp,
    rules: () => rules.all(),
    settings: () => settings.get(),
    siteOf: (tabId) => manager.siteOf(tabId),
    activeProfileOf: (tabId) => active.get(tabId),
    capture,
    executor,
    hooks,
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
      repeater.contextLost(tabId);
      engine.sessionEnded(tabId);
      hooks.sessionEnded(tabId);
      interceptor.sessionEnded(tabId);
      relaxer.sessionEnded(tabId);
      capture.sessionEnded(tabId);
      frames.sessionEnded(tabId);
      sendState(tabId);
    },
    onAttached: (tabId) => {
      active.onNavigate(tabId, manager.siteOf(tabId));
      void frames.seed(tabId);
      applyPatterns(tabId);
      sendState(tabId);
    },
    onNavigated: (tabId, site, url) => {
      // El documento cambió: el mundo aislado del repeater ya no existe (research R4).
      repeater.contextLost(tabId);
      engine.navigated(tabId);
      relaxer.refresh(tabId);
      active.onNavigate(tabId, site);
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
        const { exchangeId, side, binary } = command.payload;
        const body = await capture.getBody(tabId, exchangeId, side, { binary: binary === true });
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
      case "repeaterSend":
        // El tabId sale del remitente (el puerto de la pestaña), nunca del payload.
        repeater.send(tabId, command.payload);
        return { ok: true };
      case "repeaterCancel":
        repeater.cancel(tabId, command.payload.sendId);
        return { ok: true };
      case "hookResult":
        return hooks.onResult(tabId, command.payload);
      // 007: perfiles (contracts/panel-protocol.md).
      case "saveProfile":
        return profiles.save(command.payload, manager.siteOf(tabId));
      case "duplicateProfile":
        return profiles.duplicate(command.payload.id, command.payload.name);
      case "deleteProfile": {
        const result = await profiles.remove(command.payload.id);
        if (result.ok) {
          for (const affected of active.onProfileDeleted(command.payload.id)) {
            port.send(
              affected,
              makeEvent("notice", { messageKey: "notice_profile_deleted_active" }),
            );
            applyPatterns(affected);
            sendState(affected);
          }
        }
        return result;
      }
      case "restoreProfile":
        return profiles.restore(command.payload.id);
      case "setActiveProfile": {
        if (!active.set(tabId, manager.siteOf(tabId), command.payload.profileId))
          return { ok: false, code: "profile_not_found" };
        applyPatterns(tabId);
        sendState(tabId);
        return { ok: true };
      }
      case "setRuleProfiles":
        return rules.setProfiles(command.payload.ruleId, command.payload.profileIds);
      case "importConfig":
        return imports.importConfig(command.payload);
      case "undoImport": {
        const result = await imports.undoImport(command.payload.importId);
        if (result.ok)
          for (const other of port.tabs())
            if (other !== tabId)
              port.send(other, makeEvent("notice", { messageKey: "notice_import_undone" }));
        return result;
      }
      case "importHook":
        return rules.importHook(
          command.payload,
          manager.siteOf(tabId),
          globalThis.chrome?.i18n?.getMessage("hook_imported_name") || "Hook",
        );
      case "getIgnores":
      case "setIgnores": {
        const { method, url } = command.payload;
        try {
          const value =
            command.type === "getIgnores"
              ? await ignores.get(method, url)
              : await ignores.set(method, url, command.payload);
          port.send(tabId, makeEvent("ignores", { method, url, ...value }, command.id));
          return { ok: true };
        } catch {
          return { ok: false, code: "ignores_invalid" };
        }
      }
    }
  }

  const ready = Promise.all([
    cleanupOrphans({ debugger: cdp, registry }),
    settings.ready,
    rules.ready,
    profiles.ready,
  ]).then(() => {});

  const port = createPanelPort({
    runtime: deps.runtime,
    panelPath: deps.panelPath ?? "src/panel/panel.html",
    ready,
    onHello: (tabId) => {
      active.onHello(tabId, manager.siteOf(tabId));
      port.send(tabId, makeEvent("settings", settings.get()));
      sendRules(tabId, rules.all());
      port.send(tabId, makeEvent("profiles", profiles.view()));
      sendRelaxations(tabId);
      sendState(tabId);
    },
    onCommand,
    onPanelClosed: (tabId) => {
      active.forget(tabId);
      // Principio I: el debugger solo está adjunto mientras el panel está abierto (FR-004).
      void manager.detach(tabId, "panel_closed");
    },
  });

  return { ready, manager, settings, rules, engine, frames, relaxer, attachedTabs };
}
