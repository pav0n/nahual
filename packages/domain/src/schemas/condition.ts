import { z } from "zod";
import {
  HeaderNameSchema,
  HttpMethodSchema,
  StatusCodeSchema,
  uniqueArray,
  HTTP_METHODS,
} from "./common.ts";
import { LIMITS, isCompilableRegex } from "./limits.ts";

/** Operadores que no llevan `value`. */
const VALUELESS = new Set(["exists", "notExists", "empty", "notEmpty"]);
const NUMERIC = new Set(["lt", "lte", "gt", "gte"]);

export const TEXT_OPS = ["exists", "notExists", "equals", "contains", "matches"] as const;
export const JSONPATH_OPS = [
  "exists",
  "notExists",
  "equals",
  "notEquals",
  "contains",
  "matches",
  "empty",
  "notEmpty",
  "lt",
  "lte",
  "gt",
  "gte",
] as const;
export const GRAPHQL_OPS = ["equals", "notEquals", "matches"] as const;
export const STATUS_OPS = ["eq", "ne", "lt", "lte", "gt", "gte", "between", "in"] as const;

/** Exige `value` según el operador y, con `matches`, una regex compilable ≤ 512. */
function checkValue(
  data: { op: string; value?: string | undefined },
  ctx: z.RefinementCtx,
  maxLength: number,
) {
  if (VALUELESS.has(data.op)) return;
  if (data.value === undefined || data.value === "") {
    ctx.addIssue({ code: "custom", path: ["value"], message: "rule_error_required" });
    return;
  }
  if (data.op === "matches") {
    if (data.value.length > LIMITS.regexMax) {
      ctx.addIssue({ code: "custom", path: ["value"], message: "rule_error_regex_too_long" });
    } else if (!isCompilableRegex(data.value)) {
      ctx.addIssue({ code: "custom", path: ["value"], message: "rule_error_regex_invalid" });
    }
  } else if (data.value.length > maxLength) {
    ctx.addIssue({ code: "custom", path: ["value"], message: "rule_error_too_long" });
  }
  if (NUMERIC.has(data.op) && !Number.isFinite(Number(data.value))) {
    ctx.addIssue({ code: "custom", path: ["value"], message: "rule_error_number" });
  }
}

const OptionalValue = z.string().optional();

export const MethodConditionSchema = z.strictObject({
  kind: z.literal("method"),
  values: uniqueArray(HttpMethodSchema, HTTP_METHODS.length).min(1, {
    error: "rule_error_required",
  }),
});

export const HeaderConditionSchema = z
  .strictObject({
    kind: z.literal("header"),
    name: HeaderNameSchema,
    op: z.enum(TEXT_OPS),
    value: OptionalValue,
  })
  .superRefine((d, ctx) => checkValue(d, ctx, LIMITS.headerValueMax));

export const QueryConditionSchema = z
  .strictObject({
    kind: z.literal("query"),
    name: z
      .string()
      .min(1, { error: "rule_error_required" })
      .max(LIMITS.headerNameMax, { error: "rule_error_too_long" }),
    op: z.enum(TEXT_OPS),
    value: OptionalValue,
  })
  .superRefine((d, ctx) => checkValue(d, ctx, LIMITS.headerValueMax));

/**
 * La ruta se compila en `validate.ts` (necesita json-p3); aquí solo se acota. Así los schemas
 * siguen sin depender del motor de JSONPath.
 */
export const JsonPathConditionSchema = z
  .strictObject({
    kind: z.literal("jsonPath"),
    path: z
      .string()
      .min(1, { error: "rule_error_required" })
      .max(LIMITS.jsonPathMax, { error: "rule_error_too_long" }),
    op: z.enum(JSONPATH_OPS),
    value: OptionalValue,
  })
  .superRefine((d, ctx) => checkValue(d, ctx, LIMITS.jsonValueMax));

export const GraphqlOperationConditionSchema = z
  .strictObject({
    kind: z.literal("graphqlOperation"),
    op: z.enum(GRAPHQL_OPS),
    value: z.string(),
  })
  .superRefine((d, ctx) => checkValue(d, ctx, LIMITS.graphqlNameMax));

export const GraphqlErrorsConditionSchema = z.strictObject({
  kind: z.literal("graphqlErrors"),
  present: z.boolean(),
});

export const StatusConditionSchema = z
  .strictObject({
    kind: z.literal("status"),
    op: z.enum(STATUS_OPS),
    value: StatusCodeSchema.optional(),
    range: z.tuple([StatusCodeSchema, StatusCodeSchema]).optional(),
    list: z
      .array(StatusCodeSchema)
      .min(1, { error: "rule_error_required" })
      .max(LIMITS.statusListMax, { error: "rule_error_too_many" })
      .optional(),
  })
  .superRefine((d, ctx) => {
    if (d.op === "between") {
      if (!d.range)
        ctx.addIssue({ code: "custom", path: ["range"], message: "rule_error_required" });
      else if (d.range[0] > d.range[1]) {
        ctx.addIssue({ code: "custom", path: ["range"], message: "rule_error_range" });
      }
    } else if (d.op === "in") {
      if (!d.list) ctx.addIssue({ code: "custom", path: ["list"], message: "rule_error_required" });
    } else if (d.value === undefined) {
      ctx.addIssue({ code: "custom", path: ["value"], message: "rule_error_required" });
    }
  });

export const ConditionSchema = z.discriminatedUnion("kind", [
  MethodConditionSchema,
  HeaderConditionSchema,
  QueryConditionSchema,
  JsonPathConditionSchema,
  GraphqlOperationConditionSchema,
  GraphqlErrorsConditionSchema,
  StatusConditionSchema,
]);
export type Condition = z.infer<typeof ConditionSchema>;
export type ConditionKind = Condition["kind"];

/** Condiciones válidas por etapa (data-model.md). */
export const CONDITIONS_BY_STAGE = {
  request: ["method", "header", "query", "jsonPath", "graphqlOperation"],
  response: ["header", "jsonPath", "graphqlOperation", "graphqlErrors", "status"],
} as const satisfies Record<"request" | "response", readonly ConditionKind[]>;
