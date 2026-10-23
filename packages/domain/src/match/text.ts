import { LIMITS } from "../schemas/limits.ts";

export type TextOp = "exists" | "notExists" | "equals" | "contains" | "matches";

const regexCache = new Map<string, RegExp>();

/** Regex compilada una vez y reutilizada (research R4, R19). */
export function cachedRegex(pattern: string): RegExp {
  let regex = regexCache.get(pattern);
  if (!regex) {
    regex = new RegExp(pattern);
    if (regexCache.size > 500) regexCache.clear();
    regexCache.set(pattern, regex);
  }
  return regex;
}

/** El texto evaluado se acota para que una regex o comparación no recorra megabytes. */
export const bounded = (text: string, max: number = LIMITS.evalTextMax) =>
  text.length > max ? text.slice(0, max) : text;

/**
 * Operadores de texto sobre una lista de valores (headers o query params repetidos): basta con
 * que uno cumpla; `notExists` exige que no haya ninguno.
 */
export function matchValues(op: TextOp, values: string[], expected = ""): boolean {
  switch (op) {
    case "exists":
      return values.length > 0;
    case "notExists":
      return values.length === 0;
    case "equals":
      return values.some((v) => bounded(v) === expected);
    case "contains":
      return values.some((v) => bounded(v).includes(expected));
    case "matches": {
      const regex = cachedRegex(expected);
      return values.some((v) => regex.test(bounded(v)));
    }
  }
}
