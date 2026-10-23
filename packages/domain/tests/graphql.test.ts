import { describe, expect, it } from "vitest";
import { graphqlHasErrors, graphqlOperations } from "../src/graphql.ts";

describe("GraphQL (research R6)", () => {
  it("operationName del campo del body", () => {
    expect(
      graphqlOperations({
        method: "POST",
        url: "https://api.test/graphql",
        body: JSON.stringify({ operationName: "GetUser", query: "query GetUser { user { id } }" }),
      }),
    ).toEqual(["GetUser"]);
  });

  it("si falta operationName, de la primera definición del query", () => {
    expect(
      graphqlOperations({
        method: "POST",
        url: "u",
        body: JSON.stringify({ query: "mutation SaveUser($a: Int) { x }" }),
      }),
    ).toEqual(["SaveUser"]);
    expect(
      graphqlOperations({
        method: "POST",
        url: "u",
        body: JSON.stringify({ query: "{ users { id } }" }),
      }),
    ).toEqual([null]);
  });

  it("GET con query en la URL", () => {
    const url = `https://api.test/graphql?query=${encodeURIComponent("query ListUsers { users { id } }")}`;
    expect(graphqlOperations({ method: "GET", url, body: null })).toEqual(["ListUsers"]);
  });

  it("batch: una entrada por operación", () => {
    const body = JSON.stringify([
      { query: "query A { a }" },
      { operationName: "B", query: "query B { b }" },
    ]);
    expect(graphqlOperations({ method: "POST", url: "u", body })).toEqual(["A", "B"]);
  });

  it("no GraphQL ⇒ null", () => {
    expect(graphqlOperations({ method: "POST", url: "u", body: '{"a":1}' })).toBeNull();
    expect(graphqlOperations({ method: "POST", url: "u", body: "no json" })).toBeNull();
    expect(
      graphqlOperations({ method: "GET", url: "https://api.test/items", body: null }),
    ).toBeNull();
    expect(graphqlOperations({ method: "POST", url: "u", body: null })).toBeNull();
  });

  it("errors presente solo con un arreglo no vacío", () => {
    expect(graphqlHasErrors({ data: null, errors: [{ message: "x" }] })).toBe(true);
    expect(graphqlHasErrors({ data: {}, errors: [] })).toBe(false);
    expect(graphqlHasErrors({ data: {} })).toBe(false);
    expect(graphqlHasErrors([{ errors: [{}] }, { data: {} }])).toBe(true);
    expect(graphqlHasErrors("x")).toBe(false);
  });
});
