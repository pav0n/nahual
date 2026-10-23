import type { Condition } from "../schemas/condition.ts";
import { matchValues } from "./text.ts";

type QueryCondition = Extract<Condition, { kind: "query" }>;

export function queryValues(url: string, name: string): string[] {
  try {
    return new URL(url).searchParams.getAll(name);
  } catch {
    return [];
  }
}

export function matchQuery(condition: QueryCondition, url: string): boolean {
  return matchValues(condition.op, queryValues(url, condition.name), condition.value);
}
