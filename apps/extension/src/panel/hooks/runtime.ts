import type { Rule } from "@nahual/domain";
import { createHookConsole, createSuspensions } from "@nahual/hook-runtime";
import type { SwPayload } from "@nahual/protocol";
import { usePanelStore } from "../store/index.ts";
import { sw } from "../sw-client.ts";
import { createHookHost, type HookExecution } from "./hook-host.ts";
import { createSandboxClient } from "./sandbox-client.ts";

/**
 * Hooks del panel (006, research R1/R2/R9/R11): un sandbox, un `HookHost`, la consola y las
 * suspensiones por panel (es decir, por pestaña inspeccionada). Todo en memoria (FR-029).
 */
const sandbox = createSandboxClient();
const console_ = createHookConsole();
const suspensions = createSuspensions();
const store = () => usePanelStore.getState();

const syncConsole = () => store().setHookConsole(console_.entries(), console_.unreadErrors());
const syncSuspended = () => store().setHookSuspended(suspensions.suspended());

/** Registros y errores de las ejecuciones a la consola (FR-026), con el texto real. */
function toConsole(executions: HookExecution[]) {
  for (const e of executions) {
    const base = {
      ruleId: e.ruleId,
      ruleName: e.ruleName,
      request: e.request,
      exchangeId: e.exchangeId,
      at: e.at,
    };
    e.logs.forEach((log, i) => console_.add({ ...base, level: "log", text: e.revealed[i] ?? log }));
    if (e.error) console_.add({ ...base, level: "error", text: errorText(e.error) });
  }
  syncConsole();
}

/** Texto de un error para la consola: tipo, mensaje y línea, como Console. */
export function errorText(error: NonNullable<HookExecution["error"]>): string {
  return JSON.stringify(error);
}

export const hookHost = createHookHost({
  sandbox,
  send: (result) => void sw.send("hookResult", result),
  record: (executions) => {
    store().addHookExecutions(executions);
    toConsole(executions);
  },
  isSuspended: (ruleId) => suspensions.isSuspended(ruleId),
  onOutcome: (ruleId, failed) => {
    if (!suspensions.record(ruleId, failed)) return;
    syncSuspended();
    const rule = store().rules.find((r) => r.id === ruleId);
    store().pushToast(
      {
        messageKey: "hook_suspended_toast",
        params: [rule?.name ?? ""],
        actionKey: "hook_resume",
        onAction: () => resumeHook(ruleId),
      },
      10_000,
    );
  },
});

export function runHookChain(payload: SwPayload<"hookRun">): void {
  void hookHost.run(payload);
}

/** Precalienta el sandbox si hay reglas con hook activas en el sitio (research R2, FR-020). */
export function warmHooks(rules: Rule[], site: string | null): void {
  if (site === null) return;
  if (rules.some((r) => r.site === site && r.enabled && r.action.kind === "hook"))
    void sandbox.warm();
}

/** Un hook cuyo código cambió deja de estar suspendido (FR-022). */
export function hooksChanged(previous: Rule[], next: Rule[]): void {
  let changed = false;
  for (const rule of next) {
    if (rule.action.kind !== "hook" || !suspensions.isSuspended(rule.id)) continue;
    const before = previous.find((r) => r.id === rule.id);
    if (before?.action.kind === "hook" && before.action.source === rule.action.source) continue;
    suspensions.sourceChanged(rule.id);
    changed = true;
  }
  if (changed) syncSuspended();
}

export function resumeHook(ruleId: string): void {
  suspensions.resume(ruleId);
  syncSuspended();
}

export function markHookConsoleRead(): void {
  console_.markRead();
  syncConsole();
}

/** "Limpiar consola" con "Deshacer" durante 10 s (FR-026). */
export function clearHookConsole(): void {
  const previous = console_.clear();
  syncConsole();
  store().pushToast(
    {
      messageKey: "hook_console_cleared",
      actionKey: "action_undo",
      onAction: () => {
        console_.restore(previous);
        syncConsole();
      },
    },
    10_000,
  );
}

/** "Vaciar estado" con "Deshacer" durante 10 s (FR-008). */
export function clearHookState(): void {
  const previous = hookHost.state.clear();
  store().pushToast(
    {
      messageKey: "hook_state_cleared",
      actionKey: "action_undo",
      onAction: () => hookHost.state.restore(previous),
    },
    10_000,
  );
}
