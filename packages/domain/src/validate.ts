import type { z } from "zod";
import { compileJsonPath } from "./jsonpath.ts";
import { QueueMockActionSchema, type MockAction } from "./schemas/action.ts";
import type { Stage } from "./schemas/common.ts";
import { PausedEditSchema, type PausedEdit } from "./schemas/paused.ts";
import { RuleDraftSchema, type RuleDraft } from "./schemas/rule.ts";

/** Problema de un campo, con la clave i18n que explica la causa (FR-013). */
export interface ValidationIssue {
  path: string;
  messageKey: string;
}

export type Validation<T> = { ok: true; value: T } | { ok: false; issues: ValidationIssue[] };

/** Traduce los issues de Zod a pares ruta + clave i18n, sin incluir nunca el valor. */
function toIssues(error: z.ZodError): ValidationIssue[] {
  const seen = new Set<string>();
  const issues: ValidationIssue[] = [];
  for (const issue of error.issues) {
    const path = issue.path.join(".");
    const messageKey = issue.message.startsWith("rule_error_")
      ? issue.message
      : "rule_error_invalid";
    const key = `${path}|${messageKey}`;
    if (seen.has(key)) continue;
    seen.add(key);
    issues.push({ path, messageKey });
  }
  return issues.slice(0, 50);
}

/** Valida el borrador de una regla al guardarla: schema + rutas JSONPath compilables. */
export function validateRuleDraft(input: unknown): Validation<RuleDraft> {
  const parsed = RuleDraftSchema.safeParse(input);
  if (!parsed.success) return { ok: false, issues: toIssues(parsed.error) };
  const issues: ValidationIssue[] = [];
  parsed.data.conditions.forEach((condition, index) => {
    if (condition.kind === "jsonPath" && !compileJsonPath(condition.path).ok) {
      issues.push({ path: `conditions.${index}.path`, messageKey: "rule_error_jsonpath" });
    }
  });
  return issues.length > 0 ? { ok: false, issues } : { ok: true, value: parsed.data };
}

const REQUEST_ONLY = ["method", "url"] as const;
const RESPONSE_ONLY = ["status"] as const;

/** Valida una edición de la cola según su etapa (edge case de valores editados inválidos). */
export function validatePausedEdit(input: unknown, stage: Stage): Validation<PausedEdit> {
  const parsed = PausedEditSchema.safeParse(input);
  const issues = parsed.success ? [] : toIssues(parsed.error);
  if (typeof input === "object" && input !== null) {
    const forbidden = stage === "request" ? RESPONSE_ONLY : REQUEST_ONLY;
    for (const field of forbidden) {
      if (field in input) issues.push({ path: field, messageKey: "rule_error_stage_field" });
    }
  }
  if (issues.length > 0 || !parsed.success) {
    return {
      ok: false,
      issues: issues.length > 0 ? issues : [{ path: "", messageKey: "rule_error_invalid" }],
    };
  }
  return { ok: true, value: parsed.data };
}

/** Valida el mock que el dev crea desde la cola (body ≤ 5 MB, no se guarda). */
export function validateQueueMock(input: unknown): Validation<MockAction> {
  const parsed = QueueMockActionSchema.safeParse(input);
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false, issues: toIssues(parsed.error) };
}
