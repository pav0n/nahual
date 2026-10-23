import type { Condition } from "../schemas/condition.ts";

type StatusCondition = Extract<Condition, { kind: "status" }>;

/** Comparación, rango inclusivo o lista (FR-010). */
export function matchStatus(condition: StatusCondition, status: number): boolean {
  const value = condition.value ?? 0;
  switch (condition.op) {
    case "eq":
      return status === value;
    case "ne":
      return status !== value;
    case "lt":
      return status < value;
    case "lte":
      return status <= value;
    case "gt":
      return status > value;
    case "gte":
      return status >= value;
    case "between": {
      const [min, max] = condition.range ?? [0, -1];
      return status >= min && status <= max;
    }
    case "in":
      return (condition.list ?? []).includes(status);
  }
}
