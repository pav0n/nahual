import { validatePausedEdit, validateQueueMock, type Header } from "@nahual/domain";
import type { HookErrorType } from "./schemas.ts";
import type { HookBody, HookContextData, HookHeaders, HookRespond } from "./schemas.ts";

export type HookPart = "method" | "url" | "headers" | "body" | "status";

export interface HookPermissions {
  changeDestination: boolean;
  readSensitive: boolean;
}

/** Resultado validado de un hook (data-model, `HookEffect`). */
export type HookEffect =
  | { kind: "unchanged" }
  | { kind: "edit"; parts: HookPart[]; context: HookContextData }
  | { kind: "respond"; status: number; headers: HookHeaders; body: string }
  | { kind: "error"; type: HookErrorType; message: string; field?: string; line?: number | null };

const invalid = (field: string, message: string): HookEffect => ({
  kind: "error",
  type: "invalid_result",
  message,
  field,
});

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Origen de una URL ya validada como http(s) absoluta. */
const originOf = (url: string) => new URL(url).origin;

/** Lista para las validaciones de 002 (`set-cookie` separado por líneas). */
const listOf = (headers: HookHeaders): Header[] =>
  Object.entries(headers).flatMap(([name, value]) =>
    (name === "set-cookie" ? value.split("\n") : [value]).map((v) => ({ name, value: v })),
  );

const bodyChanged = (before: HookBody, after: HookBody) =>
  after.kind === "text" && (before.kind !== "text" || before.text !== after.text);

/** Primer problema de 002 como campo + clave; `headers.3.name` cuenta como `headers`. */
function firstIssue(issues: { path: string; messageKey: string }[]): HookEffect {
  const issue = issues[0];
  return invalid(issue?.path.split(".")[0] || "result", issue?.messageKey ?? "rule_error_invalid");
}

/**
 * Valida lo que devolvió un hook frente al contexto original (R6, FR-010, FR-011): forma por
 * etapa, campos de solo lectura, reglas de 002 y permiso para cambiar el origen.
 */
export function validateHookResult(
  before: HookContextData,
  after: HookContextData,
  respond: HookRespond | null,
  permissions: HookPermissions,
): HookEffect {
  for (const field of ["stage", "resourceType", "site"] as const) {
    if (before[field] !== after[field]) return invalid(field, "hook_error_readonly");
  }
  if (!same(before.request.graphql, after.request.graphql))
    return invalid("graphql", "hook_error_readonly");

  if (before.stage === "response") {
    if (respond) return invalid("respond", "hook_error_respond_stage");
    if (!same(before.request, after.request)) return invalid("request", "hook_error_readonly");
    if (!before.response || !after.response) return invalid("response", "hook_error_readonly");
    const parts: HookPart[] = [];
    if (before.response.status !== after.response.status) parts.push("status");
    if (!same(before.response.headers, after.response.headers)) parts.push("headers");
    if (bodyChanged(before.response.body, after.response.body)) parts.push("body");
    if (parts.length === 0) return { kind: "unchanged" };
    const edit = {
      ...(parts.includes("status") ? { status: after.response.status } : {}),
      ...(parts.includes("headers") ? { headers: listOf(after.response.headers) } : {}),
      ...(parts.includes("body") && after.response.body.kind === "text"
        ? { body: after.response.body.text }
        : {}),
    };
    const checked = validatePausedEdit(edit, "response");
    return checked.ok ? { kind: "edit", parts, context: after } : firstIssue(checked.issues);
  }

  if (after.response !== null) return invalid("response", "hook_error_readonly");
  if (respond) {
    const checked = validateQueueMock({
      kind: "mock",
      status: respond.status,
      headers: listOf(respond.headers),
      body: respond.body,
      bodyEncoding: "text",
    });
    return checked.ok ? { kind: "respond", ...respond } : firstIssue(checked.issues);
  }
  const b = before.request;
  const a = after.request;
  const parts: HookPart[] = [];
  if (b.method !== a.method) parts.push("method");
  if (b.url !== a.url) parts.push("url");
  if (!same(b.headers, a.headers)) parts.push("headers");
  if (bodyChanged(b.body, a.body)) parts.push("body");
  if (parts.length === 0) return { kind: "unchanged" };
  const edit = {
    ...(parts.includes("method") ? { method: a.method } : {}),
    ...(parts.includes("url") ? { url: a.url } : {}),
    ...(parts.includes("headers") ? { headers: listOf(a.headers) } : {}),
    ...(parts.includes("body") && a.body.kind === "text" ? { body: a.body.text } : {}),
  };
  const checked = validatePausedEdit(edit, "request");
  if (!checked.ok) return firstIssue(checked.issues);
  if (
    parts.includes("url") &&
    originOf(a.url) !== originOf(b.url) &&
    !permissions.changeDestination
  )
    return invalid("url", "hook_error_destination");
  return { kind: "edit", parts, context: after };
}
