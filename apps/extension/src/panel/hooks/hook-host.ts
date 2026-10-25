import { LIMITS, redactLogText, type Stage } from "@nahual/domain";
import {
  createChainFold,
  createHookState,
  hashSource,
  maskSensitive,
  mergeMasked,
  validateHookResult,
  type ChainExecution,
  type ChainFinal,
  type HookContextData,
  type HookEffect,
  type HookOutcome,
  type HookPart,
  type HookPermissions,
} from "@nahual/hook-runtime";
import type { RunRequest } from "./sandbox-client.ts";

/** Un eslabón de `hookRun` (contracts/panel-protocol.md). */
export interface HookChainItem {
  ruleId: string;
  ruleName: string;
  source: string;
  permissions: HookPermissions;
}

export interface HookRunPayload {
  runId: string;
  exchangeId: string;
  stage: Stage;
  chain: HookChainItem[];
  context: HookContextData;
}

export interface HookResultPayload {
  runId: string;
  final: ChainFinal;
  executions: (ChainExecution & { durationMs: number })[];
}

/** Una ejecución tal como la guarda el panel para la pestaña Hooks y la consola (data-model). */
export interface HookExecution {
  id: string;
  runId: string;
  exchangeId: string;
  ruleId: string;
  ruleName: string;
  stage: Stage;
  result: ChainExecution["result"];
  durationMs: number;
  parts: HookPart[];
  /** Registros con los valores sensibles redactados por nombre (FR-030). */
  logs: string[];
  /** Texto real de cada registro que tuvo algo redactado (índice ⇒ texto). Solo memoria. */
  revealed: Record<number, string>;
  destination?: { from: string; to: string };
  error?: { type: string; message: string; line: number | null; field?: string };
  at: number;
}

export interface HookHostOptions {
  sandbox: { run(request: RunRequest): Promise<HookOutcome> };
  send(result: HookResultPayload): void;
  record(executions: HookExecution[]): void;
  /** ¿La regla está suspendida? (FR-022; US2). */
  isSuspended?(ruleId: string): boolean;
  /** Resultado de cada ejecución, para la suspensión (US2). */
  onOutcome?(ruleId: string, failed: boolean): void;
  now?(): number;
}

/** Registros redactados por nombre (FR-030) y, aparte, el texto real de los que cambiaron. */
function redactLogs(logs: string[]): { logs: string[]; revealed: Record<number, string> } {
  const revealed: Record<number, string> = {};
  const redacted = logs.map((log, index) => {
    const safe = redactLogText(log);
    if (safe !== log) revealed[index] = log;
    return safe;
  });
  return { logs: redacted, revealed };
}

const errorEffect = (outcome: Extract<HookOutcome, { kind: "error" }>): HookEffect => ({
  kind: "error",
  type: outcome.type,
  message: outcome.message,
  line: outcome.line,
});

/**
 * Ejecuta las cadenas de hooks que pide el SW (006, research R1, R5–R7): enmascara según los
 * permisos de cada regla, ejecuta en el sandbox, valida y combina cada resultado, guarda `state`
 * con concurrencia optimista (los reintentos van de uno en uno) y devuelve un único resultado.
 */
export function createHookHost(options: HookHostOptions) {
  const state = createHookState();
  const now = options.now ?? (() => performance.now());
  /** Los reintentos por conflicto de `state` van en serie (research R7). */
  let retries: Promise<unknown> = Promise.resolve();
  let seq = 0;

  async function attempt(
    item: HookChainItem,
    current: HookContextData,
    deadline: number,
  ): Promise<{ effect: HookEffect; logs: string[] } | { conflict: true; logs: string[] }> {
    const remaining = Math.max(1, Math.min(LIMITS.hookTimeoutMs, Math.round(deadline - now())));
    const snapshot = state.snapshot();
    const outcome = await options.sandbox.run({
      execId: `x${++seq}`,
      ruleId: item.ruleId,
      codeHash: hashSource(item.source),
      source: item.source,
      context: maskSensitive(current, item.permissions.readSensitive),
      state: snapshot.value,
      timeoutMs: remaining,
    });
    if (outcome.kind === "error") return { effect: errorEffect(outcome), logs: outcome.logs };
    const merged = mergeMasked(current, outcome.context);
    const effect = validateHookResult(current, merged, outcome.respond, item.permissions);
    if (effect.kind !== "error" && outcome.stateChanged) {
      const saved = state.commit(snapshot.version, outcome.state as Record<string, unknown>);
      if (saved === "conflict") return { conflict: true, logs: outcome.logs };
      if (saved === "too_large")
        return {
          effect: { kind: "error", type: "state_too_large", message: "hook_error_state_too_large" },
          logs: outcome.logs,
        };
    }
    return { effect, logs: outcome.logs };
  }

  async function execute(item: HookChainItem, current: HookContextData) {
    const started = now();
    const deadline = started + LIMITS.hookTimeoutMs;
    let result = await attempt(item, current, deadline);
    for (let tries = 1; "conflict" in result && tries < LIMITS.hookStateAttempts; tries++) {
      // Un reintento a la vez, con el `state` recién leído.
      const next = retries.then(() => attempt(item, current, deadline));
      retries = next.catch(() => undefined);
      result = await next;
    }
    const effect: HookEffect =
      "conflict" in result
        ? { kind: "error", type: "state_conflict", message: "hook_error_state_conflict" }
        : result.effect;
    return { effect, logs: result.logs, durationMs: now() - started };
  }

  return {
    state,
    async run(payload: HookRunPayload) {
      const fold = createChainFold(payload.context);
      const executions: HookExecution[] = [];
      const summary: HookResultPayload["executions"] = [];
      for (const item of payload.chain) {
        if (fold.done()) break;
        const base = {
          id: `${payload.runId}:${item.ruleId}`,
          runId: payload.runId,
          exchangeId: payload.exchangeId,
          ruleId: item.ruleId,
          ruleName: item.ruleName,
          stage: payload.stage,
          at: Date.now(),
        };
        if (options.isSuspended?.(item.ruleId)) {
          fold.skip(item.ruleId);
          summary.push({ ruleId: item.ruleId, result: "hook_skipped_suspended", durationMs: 0 });
          executions.push({
            ...base,
            result: "hook_skipped_suspended",
            durationMs: 0,
            parts: [],
            logs: [],
            revealed: {},
          });
          continue;
        }
        const before = fold.current();
        const { effect, logs, durationMs } = await execute(item, before);
        fold.step(item.ruleId, effect);
        const last = fold.result().executions.at(-1) as ChainExecution;
        options.onOutcome?.(item.ruleId, effect.kind === "error");
        summary.push({ ...last, durationMs });
        executions.push({
          ...base,
          result: last.result,
          durationMs,
          parts: effect.kind === "edit" ? effect.parts : [],
          ...redactLogs(logs),
          ...(effect.kind === "edit" && effect.parts.includes("url")
            ? { destination: { from: before.request.url, to: effect.context.request.url } }
            : {}),
          ...(effect.kind === "error"
            ? {
                error: {
                  type: effect.type,
                  message: effect.message,
                  line: effect.line ?? null,
                  ...(effect.field ? { field: effect.field } : {}),
                },
              }
            : {}),
        });
      }
      options.record(executions);
      options.send({ runId: payload.runId, final: fold.result().final, executions: summary });
    },
  };
}

export type HookHost = ReturnType<typeof createHookHost>;
