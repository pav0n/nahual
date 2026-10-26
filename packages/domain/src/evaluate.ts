import { graphqlHasErrors, graphqlOperations } from "./graphql.ts";
import { matchJsonPath } from "./jsonpath.ts";
import { matchHeader } from "./match/headers.ts";
import { matchPrefilter } from "./match/prefilter.ts";
import { matchQuery } from "./match/query.ts";
import { matchStatus } from "./match/status.ts";
import { cachedRegex } from "./match/text.ts";
import type { Header, Stage } from "./schemas/common.ts";
import type { Condition } from "./schemas/condition.ts";
import type { UnevaluableReason } from "./schemas/exchange.ts";
import type { Rule } from "./schemas/rule.ts";

/** Body tal como lo tiene el SW: `unknown` si aún no se pidió (research R4). */
export type BodyAccess =
  | { kind: "text"; text: string }
  | { kind: "none" }
  | { kind: "binary" }
  | { kind: "tooLarge" }
  | { kind: "unknown" };

/** Lo que una regla puede mirar de un intercambio pausado. */
export interface ExchangeView {
  method: string;
  url: string;
  resourceType: string;
  requestHeaders: Header[];
  requestBody: BodyAccess;
  /** Solo en etapa Response. */
  status: number | null;
  responseHeaders: Header[];
  responseBody: BodyAccess;
}

export interface SelectContext {
  site: string | null;
  stage: Stage;
  globalPaused: boolean;
}

/** 006 (research R8): la regla de 002 o la cadena de reglas con hook. */
export type ChainSelection =
  | { kind: "match"; rule: Rule }
  | { kind: "chain"; rules: Rule[] }
  | { kind: "needsBody" }
  | { kind: "none"; unevaluable?: { rule: Rule; reason: UnevaluableReason } };

export type Selection =
  | { kind: "match"; rule: Rule }
  | { kind: "needsBody" }
  | { kind: "none"; unevaluable?: { rule: Rule; reason: UnevaluableReason } };

type Outcome =
  | { kind: "pass" }
  | { kind: "fail" }
  | { kind: "needsBody" }
  | { kind: "unevaluable"; reason: UnevaluableReason };

const PASS: Outcome = { kind: "pass" };
const FAIL: Outcome = { kind: "fail" };
const NEEDS_BODY: Outcome = { kind: "needsBody" };

/** Condiciones baratas primero; las que necesitan body, al final (research R4). */
const COST: Record<Condition["kind"], number> = {
  method: 0,
  status: 0,
  header: 1,
  query: 1,
  graphqlOperation: 2,
  jsonPath: 3,
  graphqlErrors: 3,
};

const jsonCache = new WeakMap<object, { ok: true; value: unknown } | { ok: false }>();

function parseJson(body: { kind: "text"; text: string }) {
  let cached = jsonCache.get(body);
  if (!cached) {
    try {
      cached = { ok: true, value: JSON.parse(body.text) };
    } catch {
      cached = { ok: false };
    }
    jsonCache.set(body, cached);
  }
  return cached;
}

function jsonOf(body: BodyAccess): Outcome | { kind: "json"; value: unknown } {
  switch (body.kind) {
    case "unknown":
      return NEEDS_BODY;
    case "none":
      return { kind: "unevaluable", reason: "no_body" };
    case "binary":
      return { kind: "unevaluable", reason: "binary" };
    case "tooLarge":
      return { kind: "unevaluable", reason: "too_large" };
    case "text": {
      const parsed = parseJson(body);
      return parsed.ok
        ? { kind: "json", value: parsed.value }
        : { kind: "unevaluable", reason: "invalid_json" };
    }
  }
}

function operationsOf(view: ExchangeView): Outcome | { kind: "ops"; ops: (string | null)[] } {
  const isGet = view.method.toUpperCase() === "GET";
  if (!isGet) {
    if (view.requestBody.kind === "unknown") return NEEDS_BODY;
    if (view.requestBody.kind === "binary") return { kind: "unevaluable", reason: "binary" };
    if (view.requestBody.kind === "tooLarge") return { kind: "unevaluable", reason: "too_large" };
  }
  const ops = graphqlOperations({
    method: view.method,
    url: view.url,
    body: view.requestBody.kind === "text" ? view.requestBody.text : null,
  });
  return ops === null ? { kind: "unevaluable", reason: "not_graphql" } : { kind: "ops", ops };
}

function evaluateCondition(condition: Condition, view: ExchangeView, stage: Stage): Outcome {
  const ok = (value: boolean) => (value ? PASS : FAIL);
  switch (condition.kind) {
    case "method":
      return ok(condition.values.includes(view.method.toUpperCase() as never));
    case "status":
      return ok(view.status !== null && matchStatus(condition, view.status));
    case "header":
      return ok(
        matchHeader(condition, stage === "request" ? view.requestHeaders : view.responseHeaders),
      );
    case "query":
      return ok(matchQuery(condition, view.url));
    case "jsonPath": {
      const json = jsonOf(stage === "request" ? view.requestBody : view.responseBody);
      return json.kind === "json" ? ok(matchJsonPath(condition, json.value)) : json;
    }
    case "graphqlOperation": {
      const ops = operationsOf(view);
      if (ops.kind !== "ops") return ops;
      return ok(
        ops.ops.some((name) => {
          const value = name ?? "";
          if (condition.op === "equals") return value === condition.value;
          if (condition.op === "notEquals") return value !== condition.value;
          return cachedRegex(condition.value).test(value);
        }),
      );
    }
    case "graphqlErrors": {
      const ops = operationsOf(view);
      if (ops.kind !== "ops") return ops;
      const json = jsonOf(view.responseBody);
      return json.kind === "json" ? ok(graphqlHasErrors(json.value) === condition.present) : json;
    }
  }
}

const sorted = new WeakMap<Rule, Condition[]>();
const byCost = (rule: Rule) => {
  let list = sorted.get(rule);
  if (!list) {
    list = [...rule.conditions].sort((a, b) => COST[a.kind] - COST[b.kind]);
    sorted.set(rule, list);
  }
  return list;
};

function evaluateRule(rule: Rule, view: ExchangeView, stage: Stage): Outcome {
  if (rule.methods.length > 0 && !rule.methods.includes(view.method.toUpperCase() as never))
    return FAIL;
  if (rule.resourceTypes.length > 0 && !rule.resourceTypes.includes(view.resourceType as never))
    return FAIL;
  if (!matchPrefilter(rule.prefilter, view.url)) return FAIL;
  for (const condition of byCost(rule)) {
    const outcome = evaluateCondition(condition, view, stage);
    if (outcome.kind !== "pass") return outcome;
  }
  return PASS;
}

/**
 * Regla que se aplica a un intercambio en una etapa (FR-016): la primera activa del sitio por
 * `order` que se cumple. `needsBody` si una regla de mayor prioridad necesita el body para
 * decidir; el SW lo pide una vez y vuelve a llamar. Una condición no evaluable no se cumple y se
 * informa (FR-012).
 */
export function selectRule(rules: Rule[], view: ExchangeView, context: SelectContext): Selection {
  if (context.globalPaused || context.site === null) return { kind: "none" };
  const candidates = rules
    .filter((r) => r.enabled && r.site === context.site && r.stage === context.stage)
    .sort((a, b) => a.order - b.order);
  let unevaluable: { rule: Rule; reason: UnevaluableReason } | undefined;
  for (const rule of candidates) {
    const outcome = evaluateRule(rule, view, context.stage);
    if (outcome.kind === "pass") return { kind: "match", rule };
    if (outcome.kind === "needsBody") return { kind: "needsBody" };
    if (outcome.kind === "unevaluable") unevaluable ??= { rule, reason: outcome.reason };
  }
  return unevaluable ? { kind: "none", unevaluable } : { kind: "none" };
}

/**
 * Como `selectRule`, pero con hooks (006, FR-012): si la primera regla que se cumple es de otra
 * acción, se aplica sola; si es un hook, se encadenan todas las reglas con hook que se cumplen, en
 * orden de prioridad, y las de otras acciones que se cumplen por debajo no se aplican.
 */
export function selectChain(
  rules: Rule[],
  view: ExchangeView,
  context: SelectContext,
): ChainSelection {
  if (context.globalPaused || context.site === null) return { kind: "none" };
  const candidates = rules
    .filter((r) => r.enabled && r.site === context.site && r.stage === context.stage)
    .sort((a, b) => a.order - b.order);
  let unevaluable: { rule: Rule; reason: UnevaluableReason } | undefined;
  let chain: Rule[] | null = null;
  for (const rule of candidates) {
    if (chain && rule.action.kind !== "hook") continue;
    const outcome = evaluateRule(rule, view, context.stage);
    if (outcome.kind === "needsBody") return { kind: "needsBody" };
    if (outcome.kind === "unevaluable") unevaluable ??= { rule, reason: outcome.reason };
    if (outcome.kind !== "pass") continue;
    if (chain) chain.push(rule);
    else if (rule.action.kind === "hook") chain = [rule];
    else return { kind: "match", rule };
  }
  if (chain) return { kind: "chain", rules: chain };
  return unevaluable ? { kind: "none", unevaluable } : { kind: "none" };
}
