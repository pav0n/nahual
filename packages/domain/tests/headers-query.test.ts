import { describe, expect, it } from "vitest";
import { matchHeader } from "../src/match/headers.ts";
import { matchQuery } from "../src/match/query.ts";

const headers = [
  { name: "Content-Type", value: "application/json" },
  { name: "X-Tag", value: "a" },
  { name: "x-tag", value: "b" },
];

describe("condición de header (FR-009, FR-010)", () => {
  const h = (
    op: "exists" | "notExists" | "equals" | "contains" | "matches",
    name: string,
    value?: string,
  ) =>
    matchHeader(
      value === undefined ? { kind: "header", name, op } : { kind: "header", name, op, value },
      headers,
    );

  it("exists / notExists por nombre sin distinguir mayúsculas", () => {
    expect(h("exists", "content-type")).toBe(true);
    expect(h("exists", "authorization")).toBe(false);
    expect(h("notExists", "authorization")).toBe(true);
    expect(h("notExists", "CONTENT-TYPE")).toBe(false);
  });

  it("equals, contains y matches sobre el valor (distingue mayúsculas)", () => {
    expect(h("equals", "content-type", "application/json")).toBe(true);
    expect(h("equals", "content-type", "Application/JSON")).toBe(false);
    expect(h("contains", "content-type", "json")).toBe(true);
    expect(h("matches", "content-type", "^application/(json|xml)$")).toBe(true);
    expect(h("matches", "content-type", "^text/")).toBe(false);
  });

  it("headers repetidos: basta con que uno cumpla", () => {
    expect(h("equals", "x-tag", "b")).toBe(true);
    expect(h("equals", "x-tag", "c")).toBe(false);
  });

  it("el valor evaluado se acota a 8 KB (research R19)", () => {
    const long = [{ name: "x-long", value: `${"a".repeat(9000)}END` }];
    expect(
      matchHeader({ kind: "header", name: "x-long", op: "matches", value: "END$" }, long),
    ).toBe(false);
    expect(
      matchHeader({ kind: "header", name: "x-long", op: "contains", value: "END" }, long),
    ).toBe(false);
  });
});

describe("condición de query param (FR-009)", () => {
  const url = "https://api.test/search?q=hola%20mundo&tag=a&tag=b&empty=";
  const q = (
    op: "exists" | "notExists" | "equals" | "contains" | "matches",
    name: string,
    value?: string,
  ) =>
    matchQuery(
      value === undefined ? { kind: "query", name, op } : { kind: "query", name, op, value },
      url,
    );

  it("decodifica los valores y admite repetidos", () => {
    expect(q("equals", "q", "hola mundo")).toBe(true);
    expect(q("equals", "tag", "b")).toBe(true);
    expect(q("contains", "q", "mun")).toBe(true);
    expect(q("matches", "tag", "^[ab]$")).toBe(true);
  });

  it("exists incluye valores vacíos; el nombre distingue mayúsculas", () => {
    expect(q("exists", "empty")).toBe(true);
    expect(q("exists", "Q")).toBe(false);
    expect(q("notExists", "page")).toBe(true);
  });

  it("una URL inválida no cumple ninguna condición salvo notExists", () => {
    expect(matchQuery({ kind: "query", name: "q", op: "exists" }, "no es url")).toBe(false);
    expect(matchQuery({ kind: "query", name: "q", op: "notExists" }, "no es url")).toBe(true);
  });
});
