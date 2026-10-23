import { describe, expect, it } from "vitest";
import { selectRule, type ExchangeView, type SelectContext } from "../src/evaluate.ts";
import type { Rule } from "../src/schemas/rule.ts";
import { RULE_ID, RULE_ID2, SITE, rule } from "./fixtures.ts";

const view = (overrides: Partial<ExchangeView> = {}): ExchangeView => ({
  method: "GET",
  url: "https://api.test/api/items?page=1",
  resourceType: "Fetch",
  requestHeaders: [{ name: "accept", value: "application/json" }],
  requestBody: { kind: "none" },
  status: 200,
  responseHeaders: [{ name: "content-type", value: "application/json" }],
  responseBody: { kind: "text", text: '{"items":[]}' },
  ...overrides,
});

const ctx = (overrides: Partial<SelectContext> = {}): SelectContext => ({
  site: SITE,
  stage: "response",
  globalPaused: false,
  ...overrides,
});

const pick = (rules: Rule[], v = view(), c = ctx()) => selectRule(rules, v, c);

describe("selectRule: filtros de la regla (FR-008, FR-014a)", () => {
  it("una regla sin condiciones coincide por prefiltro", () => {
    expect(pick([rule()])).toMatchObject({ kind: "match", rule: { id: RULE_ID } });
  });

  it("prefiltro glob y regex", () => {
    expect(pick([rule({ prefilter: { kind: "glob", pattern: "*/other/*" } })]).kind).toBe("none");
    expect(pick([rule({ prefilter: { kind: "regex", pattern: "items\\?page=\\d" } })]).kind).toBe(
      "match",
    );
    expect(pick([rule({ prefilter: { kind: "regex", pattern: "^https://otro" } })]).kind).toBe(
      "none",
    );
  });

  it("métodos y tipos de recurso (vacío = todos)", () => {
    expect(pick([rule({ methods: ["POST"] })]).kind).toBe("none");
    expect(pick([rule({ methods: ["GET", "POST"] })]).kind).toBe("match");
    expect(pick([rule({ resourceTypes: ["XHR"] })]).kind).toBe("none");
    expect(pick([rule({ resourceTypes: ["Fetch"] })]).kind).toBe("match");
  });

  it("solo reglas activas, de la etapa y del sitio actual", () => {
    expect(pick([rule({ enabled: false })]).kind).toBe("none");
    expect(pick([rule({ stage: "request" })]).kind).toBe("none");
    expect(pick([rule({ site: "https://otro.test" })]).kind).toBe("none");
    expect(pick([rule()], view(), ctx({ site: null })).kind).toBe("none");
  });

  it("con globalPaused nada se aplica (FR-017)", () => {
    expect(pick([rule()], view(), ctx({ globalPaused: true })).kind).toBe("none");
  });
});

describe("selectRule: condiciones con Y", () => {
  it("todas deben cumplirse", () => {
    const r = rule({
      conditions: [
        { kind: "status", op: "gte", value: 200 },
        { kind: "header", name: "content-type", op: "contains", value: "json" },
      ],
    });
    expect(pick([r]).kind).toBe("match");
    expect(pick([r], view({ status: 199 })).kind).toBe("none");
  });

  it("condiciones de request: método, header, query", () => {
    const r = rule({
      stage: "request",
      conditions: [
        { kind: "method", values: ["GET"] },
        { kind: "header", name: "accept", op: "exists" },
        { kind: "query", name: "page", op: "equals", value: "1" },
      ],
    });
    expect(pick([r], view(), ctx({ stage: "request" })).kind).toBe("match");
    expect(
      pick([r], view({ url: "https://api.test/api/items?page=2" }), ctx({ stage: "request" })).kind,
    ).toBe("none");
  });

  it("JSONPath sobre el body de la etapa", () => {
    const r = rule({ conditions: [{ kind: "jsonPath", path: "$.items", op: "empty" }] });
    expect(pick([r]).kind).toBe("match");
    expect(pick([r], view({ responseBody: { kind: "text", text: '{"items":[1]}' } })).kind).toBe(
      "none",
    );
  });

  it("GraphQL: operationName del request y errors de la response", () => {
    const body = JSON.stringify({ operationName: "GetUser", query: "query GetUser { u }" });
    const r = rule({
      conditions: [
        { kind: "graphqlOperation", op: "equals", value: "GetUser" },
        { kind: "graphqlErrors", present: true },
      ],
    });
    const v = view({
      method: "POST",
      requestBody: { kind: "text", text: body },
      responseBody: { kind: "text", text: '{"errors":[{"message":"x"}]}' },
    });
    expect(pick([r], v).kind).toBe("match");
    expect(pick([r], { ...v, responseBody: { kind: "text", text: '{"data":{}}' } }).kind).toBe(
      "none",
    );
  });
});

describe("selectRule: bodies y condiciones no evaluables (FR-012, research R4)", () => {
  const jsonRule = rule({ conditions: [{ kind: "jsonPath", path: "$.items", op: "empty" }] });

  it("pide el body solo si hace falta y después de las condiciones baratas", () => {
    expect(pick([jsonRule], view({ responseBody: { kind: "unknown" } }))).toEqual({
      kind: "needsBody",
    });
    const cheapFails = rule({
      conditions: [{ kind: "status", op: "gte", value: 500 }, ...jsonRule.conditions],
    });
    expect(pick([cheapFails], view({ responseBody: { kind: "unknown" } })).kind).toBe("none");
  });

  it("GET GraphQL no necesita body", () => {
    const r = rule({
      stage: "request",
      conditions: [{ kind: "graphqlOperation", op: "equals", value: "ListUsers" }],
    });
    const url = `https://api.test/api/graphql?query=${encodeURIComponent("query ListUsers { u }")}`;
    expect(
      pick([r], view({ url, requestBody: { kind: "unknown" } }), ctx({ stage: "request" })).kind,
    ).toBe("match");
  });

  it.each([
    [{ kind: "none" }, "no_body"],
    [{ kind: "binary" }, "binary"],
    [{ kind: "tooLarge" }, "too_large"],
    [{ kind: "text", text: "no es json" }, "invalid_json"],
  ] as const)("body %j ⇒ no cumple y reporta %s", (responseBody, reason) => {
    expect(pick([jsonRule], view({ responseBody }))).toEqual({
      kind: "none",
      unevaluable: { rule: jsonRule, reason },
    });
  });

  it("request que no es GraphQL ⇒ not_graphql", () => {
    const r = rule({ conditions: [{ kind: "graphqlErrors", present: true }] });
    expect(
      pick([r], view({ method: "POST", requestBody: { kind: "text", text: '{"a":1}' } })),
    ).toMatchObject({
      kind: "none",
      unevaluable: { reason: "not_graphql" },
    });
  });
});

describe("selectRule: prioridad (FR-016)", () => {
  it("gana la primera por order entre las que coinciden", () => {
    const first = rule({ id: RULE_ID, order: 1, name: "B" });
    const second = rule({ id: RULE_ID2, order: 0, name: "A" });
    expect(pick([first, second])).toMatchObject({ kind: "match", rule: { id: RULE_ID2 } });
  });

  it("una regla de mayor prioridad que necesita body se resuelve antes que otra barata", () => {
    const needsBody = rule({
      id: RULE_ID,
      order: 0,
      conditions: [{ kind: "jsonPath", path: "$.x", op: "exists" }],
    });
    const cheap = rule({ id: RULE_ID2, order: 1 });
    expect(pick([needsBody, cheap], view({ responseBody: { kind: "unknown" } }))).toEqual({
      kind: "needsBody",
    });
    expect(pick([needsBody, cheap])).toMatchObject({ kind: "match", rule: { id: RULE_ID2 } });
  });
});
