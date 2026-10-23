import { JSONPathError, compile, type JSONPathQuery } from "json-p3";
import { bounded, cachedRegex } from "./match/text.ts";
import type { Condition } from "./schemas/condition.ts";
import { LIMITS } from "./schemas/limits.ts";

type JsonPathCondition = Extract<Condition, { kind: "jsonPath" }>;

const queryCache = new Map<string, JSONPathQuery>();

/** Compila una ruta JSONPath (RFC 9535, sin `eval`: research R5). */
export function compileJsonPath(path: string): { ok: true; query: JSONPathQuery } | { ok: false } {
  const cached = queryCache.get(path);
  if (cached) return { ok: true, query: cached };
  try {
    const query = compile(path);
    if (queryCache.size > 500) queryCache.clear();
    queryCache.set(path, query);
    return { ok: true, query };
  } catch (error) {
    if (error instanceof JSONPathError) return { ok: false };
    return { ok: false };
  }
}

const isEmpty = (value: unknown) =>
  value === null ||
  value === "" ||
  (Array.isArray(value) && value.length === 0) ||
  (typeof value === "object" && value !== null && Object.keys(value).length === 0);

/** JSON canónico: objetos con claves ordenadas, para comparar sin depender del orden. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0,
    );
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/** Texto del valor para `contains` y `matches`: los textos tal cual, el resto como JSON. */
const asText = (value: unknown) =>
  bounded(typeof value === "string" ? value : canonical(value), LIMITS.jsonValueMax);

function expectedCanonical(expected: string): string {
  try {
    return canonical(JSON.parse(expected));
  } catch {
    return canonical(expected);
  }
}

/**
 * Evalúa una condición JSONPath (research R5): `exists`/`notExists` por nodelist; `empty` exige
 * que todos los nodos estén vacíos y que exista al menos uno; los demás operadores se cumplen si
 * algún nodo los cumple.
 */
export function matchJsonPath(condition: JsonPathCondition, json: unknown): boolean {
  const compiled = compileJsonPath(condition.path);
  if (!compiled.ok) return false;
  const values = Array.from(
    compiled.query.query(json as never).values(),
    (node) => (node as { value: unknown }).value,
  );
  const expected = condition.value ?? "";
  switch (condition.op) {
    case "exists":
      return values.length > 0;
    case "notExists":
      return values.length === 0;
    case "empty":
      return values.length > 0 && values.every(isEmpty);
    case "notEmpty":
      return values.length > 0 && values.every((v) => !isEmpty(v));
    case "equals": {
      const target = expectedCanonical(expected);
      return values.some((v) => canonical(v) === target);
    }
    case "notEquals": {
      const target = expectedCanonical(expected);
      return values.length > 0 && values.every((v) => canonical(v) !== target);
    }
    case "contains":
      return values.some((v) =>
        Array.isArray(v)
          ? v.some((item) => canonical(item) === expectedCanonical(expected))
          : asText(v).includes(expected),
      );
    case "matches": {
      const regex = cachedRegex(expected);
      return values.some((v) => regex.test(asText(v)));
    }
    case "lt":
    case "lte":
    case "gt":
    case "gte": {
      const limit = Number(expected);
      return values.some((v) => {
        if (typeof v !== "number") return false;
        if (condition.op === "lt") return v < limit;
        if (condition.op === "lte") return v <= limit;
        if (condition.op === "gt") return v > limit;
        return v >= limit;
      });
    }
  }
}
