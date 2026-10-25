import type { Rule } from "@nahual/domain";
import type { SwPayload } from "@nahual/protocol";
import { usePanelStore } from "../store/index.ts";
import { sw } from "../sw-client.ts";
import { createHookHost } from "./hook-host.ts";
import { createSandboxClient } from "./sandbox-client.ts";

/**
 * Hooks del panel (006, research R1/R2): un sandbox y un `HookHost` por panel (es decir, por
 * pestaña inspeccionada). El sandbox se crea al primer uso o al precalentarlo.
 */
const sandbox = createSandboxClient();

export const hookHost = createHookHost({
  sandbox,
  send: (result) => void sw.send("hookResult", result),
  record: (executions) => usePanelStore.getState().addHookExecutions(executions),
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
