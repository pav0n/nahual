import { describe, expect, it } from "vitest";
import { compileJsonPath, matchJsonPath } from "../src/jsonpath.ts";
import type { Condition } from "../src/schemas/condition.ts";

type JsonOp = Extract<Condition, { kind: "jsonPath" }>["op"];
const m = (path: string, op: JsonOp, json: unknown, value?: string) =>
  matchJsonPath(
    value === undefined ? { kind: "jsonPath", path, op } : { kind: "jsonPath", path, op, value },
    json,
  );

const data = {
  items: [],
  user: { id: 7, name: "Ana", tags: ["admin", "dev"], email: null },
  list: [{ n: 1 }, { n: 5 }],
  note: "",
};

describe("JSONPath (research R5)", () => {
  it("compila rutas válidas y rechaza las inválidas", () => {
    expect(compileJsonPath("$.items[*]").ok).toBe(true);
    expect(compileJsonPath("$.[").ok).toBe(false);
    expect(compileJsonPath("items").ok).toBe(false);
  });

  it("exists / notExists según el nodelist", () => {
    expect(m("$.user.id", "exists", data)).toBe(true);
    expect(m("$.user.phone", "exists", data)).toBe(false);
    expect(m("$.user.phone", "notExists", data)).toBe(true);
    expect(m("$.user.email", "exists", data)).toBe(true);
  });

  it("empty exige que todos estén vacíos y que exista al menos uno", () => {
    expect(m("$.items", "empty", data)).toBe(true);
    expect(m("$.note", "empty", data)).toBe(true);
    expect(m("$.user.email", "empty", data)).toBe(true);
    expect(m("$", "empty", {})).toBe(true);
    expect(m("$", "empty", [])).toBe(true);
    expect(m("$.user", "empty", data)).toBe(false);
    expect(m("$.missing", "empty", data)).toBe(false);
    expect(m("$.items", "notEmpty", data)).toBe(false);
    expect(m("$.user.tags", "notEmpty", data)).toBe(true);
    expect(m("$.missing", "notEmpty", data)).toBe(false);
  });

  it("equals / notEquals comparan JSON canónico; texto si el valor no es JSON", () => {
    expect(m("$.user.id", "equals", data, "7")).toBe(true);
    expect(m("$.user.name", "equals", data, '"Ana"')).toBe(true);
    expect(m("$.user.name", "equals", data, "Ana")).toBe(true);
    expect(m("$.user.tags", "equals", data, '["admin", "dev"]')).toBe(true);
    expect(m("$.user", "equals", { user: { b: 1, a: 2 } }, '{"a":2,"b":1}')).toBe(true);
    expect(m("$.user.id", "notEquals", data, "8")).toBe(true);
    expect(m("$.user.id", "notEquals", data, "7")).toBe(false);
  });

  it("contains: subcadena en texto o elemento en arreglo", () => {
    expect(m("$.user.name", "contains", data, "An")).toBe(true);
    expect(m("$.user.tags", "contains", data, "dev")).toBe(true);
    expect(m("$.user.tags", "contains", data, "ops")).toBe(false);
  });

  it("matches con regex sobre el texto del valor", () => {
    expect(m("$.user.name", "matches", data, "^A.a$")).toBe(true);
    expect(m("$.user.id", "matches", data, "^7$")).toBe(true);
  });

  it("comparaciones numéricas: basta con que algún nodo cumpla", () => {
    expect(m("$.list[*].n", "gt", data, "4")).toBe(true);
    expect(m("$.list[*].n", "gt", data, "5")).toBe(false);
    expect(m("$.list[*].n", "gte", data, "5")).toBe(true);
    expect(m("$.list[*].n", "lt", data, "2")).toBe(true);
    expect(m("$.list[*].n", "lte", data, "0")).toBe(false);
    expect(m("$.user.name", "gt", data, "1")).toBe(false);
  });

  it("valores de más de 64 KB se truncan antes de comparar", () => {
    const big = { s: `${"x".repeat(70_000)}END` };
    expect(m("$.s", "contains", big, "END")).toBe(false);
  });
});
