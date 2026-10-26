import {
  LIMITS,
  mockHeadersFor,
  validatePausedEdit,
  validateQueueMock,
  type Rule,
  type RuleEffect,
  type RuleResult,
  type Stage,
} from "@nahual/domain";
import { buildHookContext, toHeaderList, type HookExchange } from "@nahual/hook-runtime";
import type { PanelPayload, SwPayload } from "@nahual/protocol";
import type { ActionExecutor, ExecResult, PausedTarget } from "./action-executor.ts";
import type { CommandResult } from "./panel-port.ts";

export type HookRunEvent = SwPayload<"hookRun">;
export type HookResult = PanelPayload<"hookResult">;

export interface HookRunnerOptions {
  executor: ActionExecutor;
  siteOf(tabId: number): string | null;
  /** Envía `hookRun` al panel de la pestaña; `false` si no hay panel conectado. */
  send(tabId: number, event: HookRunEvent): boolean;
  effect(tabId: number, exchangeId: string, effect: RuleEffect): void;
  uuid?(): string;
}

export interface HookChainRun {
  rules: Rule[];
  stage: Stage;
  target: PausedTarget;
  exchangeId: string;
  exchange: HookExchange;
}

interface Pending {
  tabId: number;
  run: HookChainRun;
  timer: ReturnType<typeof setTimeout>;
  finish(): void;
}

/** Margen del SW sobre los 2 s por hook: cubre un arranque en frío del sandbox (research R1). */
const COLD_START_MS = 3_000;

/**
 * Lado del SW de los hooks (006, research R1, contracts/panel-protocol.md): manda la cadena al
 * panel en un `hookRun`, espera su `hookResult`, lo vuelve a validar con las reglas de 002 y el
 * permiso de destino, y lo aplica con el ejecutor (la relajación CORS de 003 actúa después).
 * Si el panel no responde a tiempo o se va, el intercambio sigue sin cambios (principio II).
 */
export function createHookRunner(options: HookRunnerOptions) {
  const pending = new Map<string, Pending>();
  const uuid = options.uuid ?? (() => crypto.randomUUID());

  const effects = (
    tabId: number,
    run: HookChainRun,
    results: { ruleId: string; result: RuleResult; durationMs?: number; errorKey?: string }[],
    destination?: { from: string; to: string },
  ) => {
    for (const r of results) {
      const rule = run.rules.find((x) => x.id === r.ruleId);
      if (!rule) continue;
      options.effect(tabId, run.exchangeId, {
        stage: run.stage,
        ruleId: rule.id,
        ruleName: rule.name,
        result: r.result,
        ...(r.durationMs !== undefined ? { durationMs: r.durationMs } : {}),
        ...(r.errorKey ? { errorKey: r.errorKey } : {}),
        ...(destination && r.result === "hooked" ? { destination } : {}),
      });
    }
  };

  /** El cambio no se aplicó: todos los hooks de la cadena cuentan como fallidos. */
  const failAll = (tabId: number, run: HookChainRun, errorKey: string) =>
    effects(
      tabId,
      run,
      run.rules.map((rule) => ({ ruleId: rule.id, result: "hook_failed", errorKey })),
    );

  const unchanged = async (tabId: number, run: HookChainRun, errorKey: string) => {
    await options.executor.continueUnchanged(tabId, run.target);
    failAll(tabId, run, errorKey);
  };

  async function apply(tabId: number, run: HookChainRun, result: HookResult): Promise<void> {
    const { final } = result;
    const results = result.executions.map((e) => ({
      ruleId: e.ruleId,
      result: e.result,
      durationMs: e.durationMs,
    }));
    if (final.kind === "unchanged") {
      await options.executor.continueUnchanged(tabId, run.target);
      effects(tabId, run, results);
      return;
    }
    let exec: ExecResult;
    let destination: { from: string; to: string } | undefined;
    if (final.kind === "respond") {
      if (run.stage !== "request") return unchanged(tabId, run, "hook_error_respond_stage");
      const mock = validateQueueMock({
        kind: "mock",
        status: final.status,
        headers: toHeaderList(final.headers, []),
        body: final.body,
        bodyEncoding: "text",
      });
      if (!mock.ok)
        return unchanged(tabId, run, mock.issues[0]?.messageKey ?? "rule_error_invalid");
      exec = await options.executor.mock(tabId, run.target, {
        ...mock.value,
        headers: mockHeadersFor(mock.value.headers, {
          pageOrigin: options.siteOf(tabId),
          requestUrl: run.exchange.url,
        }),
      });
    } else if (run.stage === "request" && final.request) {
      const edit = {
        method: final.request.method,
        url: final.request.url,
        headers: toHeaderList(final.request.headers, run.target.requestHeaders),
        ...(final.request.body !== undefined ? { body: final.request.body } : {}),
      };
      const checked = validatePausedEdit(edit, "request");
      if (!checked.ok)
        return unchanged(tabId, run, checked.issues[0]?.messageKey ?? "rule_error_invalid");
      // El permiso de destino se comprueba también aquí, en la autoridad (FR-010).
      if (new URL(edit.url).origin !== new URL(run.exchange.url).origin) {
        const allowed = result.executions.some(
          (e) =>
            e.result === "hooked" &&
            run.rules.some(
              (r) =>
                r.id === e.ruleId &&
                r.action.kind === "hook" &&
                r.action.permissions.changeDestination,
            ),
        );
        if (!allowed) return unchanged(tabId, run, "hook_error_destination");
        destination = { from: run.exchange.url, to: edit.url };
      }
      exec = await options.executor.continueEdited(tabId, run.target, checked.value);
    } else if (run.stage === "response" && final.response) {
      const edit = {
        status: final.response.status,
        headers: toHeaderList(final.response.headers, run.target.responseHeaders),
        ...(final.response.body !== undefined ? { body: final.response.body } : {}),
      };
      const checked = validatePausedEdit(edit, "response");
      if (!checked.ok)
        return unchanged(tabId, run, checked.issues[0]?.messageKey ?? "rule_error_invalid");
      exec = await options.executor.continueEdited(tabId, run.target, checked.value, {
        fromHook: true,
      });
    } else {
      return unchanged(tabId, run, "rule_error_invalid");
    }
    if (exec.ok) {
      effects(tabId, run, results, destination);
    } else {
      // El cambio no llegó a aplicarse: el ejecutor ya continuó sin cambios (002).
      effects(
        tabId,
        run,
        results.map((r) =>
          r.result === "hooked" || r.result === "hook_responded"
            ? { ...r, result: "apply_failed" as const }
            : r,
        ),
      );
    }
  }

  return {
    /** Ejecuta una cadena: el intercambio queda pausado hasta que llega el resultado. */
    run(tabId: number, run: HookChainRun): Promise<void> {
      const site = options.siteOf(tabId);
      if (site === null) return unchanged(tabId, run, "hook_error_no_panel");
      const runId = uuid();
      const event: HookRunEvent = {
        runId,
        exchangeId: run.exchangeId,
        stage: run.stage,
        chain: run.rules.flatMap((rule) =>
          rule.action.kind === "hook"
            ? [
                {
                  ruleId: rule.id,
                  ruleName: rule.name,
                  source: rule.action.source,
                  permissions: rule.action.permissions,
                },
              ]
            : [],
        ),
        context: buildHookContext(run.exchange, run.stage, site),
      };
      return new Promise<void>((resolve) => {
        const timer = setTimeout(
          () => {
            pending.delete(runId);
            void unchanged(tabId, run, "hook_error_timeout").then(resolve);
          },
          LIMITS.hookTimeoutMs * event.chain.length + COLD_START_MS,
        );
        pending.set(runId, { tabId, run, timer, finish: resolve });
        if (!options.send(tabId, event)) {
          clearTimeout(timer);
          pending.delete(runId);
          void unchanged(tabId, run, "hook_error_no_panel").then(resolve);
        }
      });
    },

    /** `hookResult` del panel. */
    async onResult(tabId: number, result: HookResult): Promise<CommandResult> {
      const entry = pending.get(result.runId);
      if (!entry || entry.tabId !== tabId) return { ok: false, code: "invalid_message" };
      pending.delete(result.runId);
      clearTimeout(entry.timer);
      try {
        await apply(tabId, entry.run, result);
      } finally {
        entry.finish();
      }
      return { ok: true };
    },

    /** La sesión terminó: Chrome ya liberó los intercambios; sin CDP. */
    sessionEnded(tabId: number) {
      for (const [runId, entry] of pending) {
        if (entry.tabId !== tabId) continue;
        clearTimeout(entry.timer);
        pending.delete(runId);
        failAll(tabId, entry.run, "hook_error_no_panel");
        entry.finish();
      }
    },

    pendingCount: () => pending.size,
  };
}

export type HookRunner = ReturnType<typeof createHookRunner>;
