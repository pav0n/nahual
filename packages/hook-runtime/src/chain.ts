import type { RuleResult } from "@nahual/domain";
import type { HookContextData, HookErrorType, HookHeaders } from "./schemas.ts";
import type { HookEffect } from "./validate.ts";

/** Resultado final de una cadena para el SW (contracts/panel-protocol.md, `hookResult.final`). */
export type ChainFinal =
  | { kind: "unchanged" }
  | {
      kind: "edit";
      request?: { method: string; url: string; headers: HookHeaders; body?: string };
      response?: { status: number; headers: HookHeaders; body?: string };
    }
  | { kind: "respond"; status: number; headers: HookHeaders; body: string };

export interface ChainExecution {
  ruleId: string;
  result: Extract<
    RuleResult,
    "hooked" | "hook_unchanged" | "hook_failed" | "hook_responded" | "hook_skipped_suspended"
  >;
  errorType?: HookErrorType;
}

const RESULT = {
  unchanged: "hook_unchanged",
  edit: "hooked",
  respond: "hook_responded",
  error: "hook_failed",
} as const;

/**
 * Pliega una cadena de hooks (R8, FR-010, FR-012): cada hook recibe lo acumulado; uno que falla no
 * aporta; uno que responde la termina. El resultado es la diferencia con el original.
 */
export function createChainFold(original: HookContextData) {
  let current = original;
  let responded: Extract<HookEffect, { kind: "respond" }> | null = null;
  const executions: ChainExecution[] = [];

  return {
    current: () => current,
    done: () => responded !== null,
    skip(ruleId: string) {
      executions.push({ ruleId, result: "hook_skipped_suspended" });
    },
    step(ruleId: string, effect: HookEffect) {
      executions.push(
        effect.kind === "error"
          ? { ruleId, result: RESULT.error, errorType: effect.type }
          : { ruleId, result: RESULT[effect.kind] },
      );
      if (effect.kind === "edit") current = effect.context;
      else if (effect.kind === "respond") responded = effect;
    },
    result(): { final: ChainFinal; executions: ChainExecution[] } {
      if (responded) {
        const { status, headers, body } = responded;
        return { final: { kind: "respond", status, headers, body }, executions };
      }
      return { final: diffOf(original, current), executions };
    },
  };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function diffOf(original: HookContextData, current: HookContextData): ChainFinal {
  if (original.stage === "request") {
    const b = original.request;
    const a = current.request;
    const body = a.body.kind === "text" && !same(a.body, b.body) ? a.body.text : undefined;
    if (
      b.method === a.method &&
      b.url === a.url &&
      same(b.headers, a.headers) &&
      body === undefined
    )
      return { kind: "unchanged" };
    return {
      kind: "edit",
      request: {
        method: a.method,
        url: a.url,
        headers: a.headers,
        ...(body === undefined ? {} : { body }),
      },
    };
  }
  const b = original.response;
  const a = current.response;
  if (!a || !b) return { kind: "unchanged" };
  const body = a.body.kind === "text" && !same(a.body, b.body) ? a.body.text : undefined;
  if (a.status === b.status && same(a.headers, b.headers) && body === undefined)
    return { kind: "unchanged" };
  return {
    kind: "edit",
    response: { status: a.status, headers: a.headers, ...(body === undefined ? {} : { body }) },
  };
}
