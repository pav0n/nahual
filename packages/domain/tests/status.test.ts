import { describe, expect, it } from "vitest";
import { matchStatus } from "../src/match/status.ts";

type StatusCondition = Parameters<typeof matchStatus>[0];

describe("condición de status (FR-010)", () => {
  it.each([
    ["eq", 500, 500, true],
    ["eq", 500, 501, false],
    ["ne", 500, 501, true],
    ["lt", 400, 399, true],
    ["lt", 400, 400, false],
    ["lte", 400, 400, true],
    ["gt", 499, 500, true],
    ["gte", 500, 500, true],
    ["gte", 500, 499, false],
  ] as const)("%s %d con %d ⇒ %s", (op, value, status, expected) => {
    expect(matchStatus({ kind: "status", op, value }, status)).toBe(expected);
  });

  it("between es inclusivo", () => {
    const c: StatusCondition = { kind: "status", op: "between", range: [400, 499] };
    expect(matchStatus(c, 400)).toBe(true);
    expect(matchStatus(c, 499)).toBe(true);
    expect(matchStatus(c, 500)).toBe(false);
  });

  it("in con lista", () => {
    const c: StatusCondition = { kind: "status", op: "in", list: [500, 502, 503] };
    expect(matchStatus(c, 502)).toBe(true);
    expect(matchStatus(c, 501)).toBe(false);
  });
});
