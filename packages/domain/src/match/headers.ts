import type { Header } from "../schemas/common.ts";
import type { Condition } from "../schemas/condition.ts";
import { matchValues } from "./text.ts";

type HeaderCondition = Extract<Condition, { kind: "header" }>;

/** Valores de un header por nombre, sin distinguir mayúsculas. */
export const headerValues = (headers: Header[], name: string) => {
  const key = name.toLowerCase();
  return headers.filter((h) => h.name.toLowerCase() === key).map((h) => h.value);
};

export function matchHeader(condition: HeaderCondition, headers: Header[]): boolean {
  return matchValues(condition.op, headerValues(headers, condition.name), condition.value);
}
