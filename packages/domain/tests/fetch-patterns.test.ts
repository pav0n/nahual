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
      { urlPattern: "*", requestStage: "Request", resourceType: "XHR" },
      { urlPattern: "*", requestStage: "Response" },
    ]);
  });

  it("Fetch también intercepta XHR: así reporta Chrome los fetch() al pausarlos", () => {
    expect(computeFetchPatterns([rule({ resourceTypes: ["Fetch"] })], ctx)).toEqual([
      { urlPattern: "*/api/*", requestStage: "Response", resourceType: "Fetch" },
      { urlPattern: "*/api/*", requestStage: "Response", resourceType: "XHR" },
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

describe("computeFetchPatterns con relajaciones CORS (003, research R11)", () => {
  const api = "http://127.0.0.1:4311";

  it("añade la etapa Response por origen relajado", () => {
    expect(computeFetchPatterns([], { ...ctx, relaxedApiOrigins: [{ origin: api }] })).toEqual([
      { urlPattern: `${api}/*`, requestStage: "Response" },
    ]);
  });

  it("y la etapa Request si hay preflights que redirigen (X5)", () => {
    expect(
      computeFetchPatterns([], {
        ...ctx,
        relaxedApiOrigins: [{ origin: api, requestStage: true }],
      }),
    ).toEqual([
      { urlPattern: `${api}/*`, requestStage: "Request" },
      { urlPattern: `${api}/*`, requestStage: "Response" },
    ]);
  });

  it("un * de Response de una regla los absorbe", () => {
    expect(
      computeFetchPatterns([rule({ prefilter: { kind: "glob", pattern: "*" } })], {
        ...ctx,
        relaxedApiOrigins: [{ origin: api }],
      }),
    ).toEqual([{ urlPattern: "*", requestStage: "Response" }]);
  });

  it("se combinan con los de las reglas sin duplicar", () => {
    expect(
      computeFetchPatterns([rule()], {
        ...ctx,
        relaxedApiOrigins: [{ origin: api }, { origin: api }],
      }),
    ).toEqual([
      { urlPattern: "*/api/*", requestStage: "Response" },
      { urlPattern: `${api}/*`, requestStage: "Response" },
    ]);
  });

  it("globalPaused ⇒ nada; sin sitio, las relajaciones siguen", () => {
    expect(
      computeFetchPatterns([], {
        ...ctx,
        globalPaused: true,
        relaxedApiOrigins: [{ origin: api }],
      }),
    ).toEqual([]);
    expect(
      computeFetchPatterns([rule()], {
        site: null,
        globalPaused: false,
        relaxedApiOrigins: [{ origin: api }],
      }),
    ).toEqual([{ urlPattern: `${api}/*`, requestStage: "Response" }]);
  });
});

describe("computeFetchPatterns con perfil activo (007, FR-020, principio VI)", () => {
  const P = "0b8f8a52-4a0c-4d0e-9f3a-6c1d2e3f4a5b";
  it("solo intercepta lo que piden las reglas del perfil activo", () => {
    const out = rule({ prefilter: { kind: "glob", pattern: "*/fuera/*" } });
    const inside = rule({
      id: RULE_ID2,
      profileIds: [P],
      prefilter: { kind: "glob", pattern: "*/dentro/*" },
    });
    expect(
      computeFetchPatterns([out, inside], { ...ctx, activeProfileId: P }).map((p) => p.urlPattern),
    ).toEqual(["*/dentro/*"]);
    expect(computeFetchPatterns([out, inside], { ...ctx, activeProfileId: null })).toHaveLength(2);
  });
});
