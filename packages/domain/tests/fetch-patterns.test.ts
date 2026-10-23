import { describe, expect, it } from "vitest";
import { MAX_FETCH_PATTERNS, computeFetchPatterns } from "../src/fetch-patterns.ts";
import { RULE_ID2, SITE, rule } from "./fixtures.ts";

const ctx = { site: SITE, globalPaused: false };

describe("computeFetchPatterns (research R3)", () => {
  it("sin reglas activas ⇒ []", () => {
    expect(computeFetchPatterns([], ctx)).toEqual([]);
    expect(computeFetchPatterns([rule({ enabled: false })], ctx)).toEqual([]);
  });

  it("solo reglas del sitio y nada con globalPaused", () => {
    expect(computeFetchPatterns([rule({ site: "https://otro.test" })], ctx)).toEqual([]);
    expect(computeFetchPatterns([rule()], { site: null, globalPaused: false })).toEqual([]);
    expect(computeFetchPatterns([rule()], { ...ctx, globalPaused: true })).toEqual([]);
  });

  it("glob ⇒ urlPattern igual; regex ⇒ *", () => {
    expect(computeFetchPatterns([rule()], ctx)).toEqual([
      { urlPattern: "*/api/*", requestStage: "Response" },
    ]);
    expect(
      computeFetchPatterns(
        [rule({ stage: "request", prefilter: { kind: "regex", pattern: "a+" } })],
        ctx,
      ),
    ).toEqual([{ urlPattern: "*", requestStage: "Request" }]);
  });

  it("un patrón por tipo de recurso", () => {
    expect(computeFetchPatterns([rule({ resourceTypes: ["Fetch", "XHR"] })], ctx)).toEqual([
      { urlPattern: "*/api/*", requestStage: "Response", resourceType: "Fetch" },
      { urlPattern: "*/api/*", requestStage: "Response", resourceType: "XHR" },
    ]);
  });

  it("`*` sin tipo absorbe la etapa; con tipo absorbe los de ese tipo", () => {
    const rules = [
      rule({ prefilter: { kind: "glob", pattern: "*" } }),
      rule({ id: RULE_ID2, prefilter: { kind: "glob", pattern: "*/x/*" }, resourceTypes: ["XHR"] }),
      rule({
        id: RULE_ID2,
        stage: "request",
        prefilter: { kind: "glob", pattern: "*" },
        resourceTypes: ["Fetch"],
      }),
      rule({
        id: RULE_ID2,
        stage: "request",
        prefilter: { kind: "glob", pattern: "*/y/*" },
        resourceTypes: ["Fetch"],
      }),
      rule({
        id: RULE_ID2,
        stage: "request",
        prefilter: { kind: "glob", pattern: "*/z/*" },
        resourceTypes: ["XHR"],
      }),
    ];
    expect(computeFetchPatterns(rules, ctx)).toEqual([
      { urlPattern: "*", requestStage: "Request", resourceType: "Fetch" },
      { urlPattern: "*/z/*", requestStage: "Request", resourceType: "XHR" },
      { urlPattern: "*", requestStage: "Response" },
    ]);
  });

  it("elimina duplicados exactos", () => {
    expect(computeFetchPatterns([rule(), rule({ id: RULE_ID2 })], ctx)).toHaveLength(1);
  });

  it(`más de ${MAX_FETCH_PATTERNS} patrones ⇒ la etapa se reduce a *`, () => {
    const many = Array.from({ length: MAX_FETCH_PATTERNS + 1 }, (_, i) =>
      rule({ prefilter: { kind: "glob", pattern: `*/p${i}/*` } }),
    );
    expect(computeFetchPatterns(many, ctx)).toEqual([
      { urlPattern: "*", requestStage: "Response" },
    ]);
  });
});
