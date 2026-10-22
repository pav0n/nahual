import type { Cause, SessionStatus } from "@nahual/protocol";
import type { CommandResult } from "./panel-port.ts";
import { DebuggerError, type DebuggerPort, type DetachReason } from "./debugger-port.ts";
import type { SessionRegistry } from "./session-registry.ts";

export interface SessionSnapshot {
  status: SessionStatus;
  cause: Cause | null;
  attachedAt: number | null;
}

export interface DebuggerManagerOptions {
  debugger: DebuggerPort;
  registry: SessionRegistry;
  now?: () => number;
  onStateChange(tabId: number, snapshot: SessionSnapshot): void;
  /** La sesión dejó de estar adjunta: el interceptor abandona sus pausas. */
  onSessionEnded(tabId: number): void;
}

export interface DebuggerManager {
  get(tabId: number): SessionSnapshot;
  isAttached(tabId: number): boolean;
  attach(tabId: number): Promise<CommandResult>;
  /** Solo por acción explícita del panel (FR-003): nunca se reconecta solo. */
  reconnect(tabId: number): Promise<CommandResult>;
  detach(tabId: number, cause: "user" | "panel_closed"): Promise<CommandResult>;
}

const DETACHED: SessionSnapshot = { status: "detached", cause: null, attachedAt: null };

function causeFromReason(reason: DetachReason): Cause {
  if (reason === "canceled_by_user") return "canceled_by_user";
  if (reason === "target_closed") return "target_closed";
  return "unknown";
}

/** Sesiones de debugger por pestaña (data-model.md, DebuggerSession). */
export function createDebuggerManager(options: DebuggerManagerOptions): DebuggerManager {
  const { debugger: cdp, registry } = options;
  const now = options.now ?? Date.now;
  const sessions = new Map<number, SessionSnapshot>();

  const get = (tabId: number) => sessions.get(tabId) ?? DETACHED;

  const set = (tabId: number, snapshot: SessionSnapshot) => {
    sessions.set(tabId, snapshot);
    options.onStateChange(tabId, snapshot);
  };

  const end = (tabId: number, cause: Cause) => {
    set(tabId, { status: "detached", cause, attachedAt: null });
    void registry.remove(tabId);
    options.onSessionEnded(tabId);
  };

  cdp.onDetach((tabId, reason) => {
    if (get(tabId).status === "attached") end(tabId, causeFromReason(reason));
  });

  const attach = async (tabId: number): Promise<CommandResult> => {
    const current = get(tabId).status;
    if (current === "attached" || current === "attaching") return { ok: true };
    set(tabId, { status: "attaching", cause: null, attachedAt: null });
    try {
      await cdp.attach(tabId);
    } catch (error) {
      const code = error instanceof DebuggerError ? error.code : "cdp_error";
      if (code === "already_attached") {
        set(tabId, { status: "conflict", cause: "already_attached", attachedAt: null });
        return { ok: false, code: "already_attached" };
      }
      if (code === "restricted_page") {
        set(tabId, { status: "detached", cause: "restricted_page", attachedAt: null });
        return { ok: false, code: "restricted_page" };
      }
      set(tabId, { status: "detached", cause: "unknown", attachedAt: null });
      return { ok: false, code: "cdp_error" };
    }
    set(tabId, { status: "attached", cause: null, attachedAt: now() });
    await registry.add(tabId);
    return { ok: true };
  };

  return {
    get,
    isAttached: (tabId) => get(tabId).status === "attached",
    attach,
    reconnect: attach,
    async detach(tabId, cause) {
      if (get(tabId).status !== "attached") return { ok: true };
      end(tabId, cause);
      try {
        await cdp.detach(tabId);
      } catch {
        // Chrome ya lo había soltado (pestaña cerrada, recarga): el estado final es el mismo.
      }
      return { ok: true };
    },
  };
}
