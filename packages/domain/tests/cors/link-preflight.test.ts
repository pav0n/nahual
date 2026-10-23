import { describe, expect, it } from "vitest";
import { linkPreflights, type LinkableExchange } from "../../src/cors/link-preflight.ts";

const ex = (overrides: Partial<LinkableExchange> & { id: string }): LinkableExchange => ({
  url: "https://api.test/items",
  method: "PUT",
  isPreflight: false,
  startedAt: 1_000,
  requestHeaders: [],
  ...overrides,
});

const preflight = (id: string, startedAt: number, overrides: Partial<LinkableExchange> = {}) =>
  ex({
    id,
    method: "OPTIONS",
    isPreflight: true,
    startedAt,
    requestHeaders: [{ name: "Access-Control-Request-Method", value: "PUT" }],
    ...overrides,
  });

describe("linkPreflights (research R6)", () => {
  it("usa preflightFor (initiator.requestId) si existe", () => {
    const links = linkPreflights([
      ex({ id: "r1" }),
      ex({ id: "r2" }),
      preflight("p1", 1_001, { preflightFor: "r2" }),
    ]);
    expect(links.get("r2")).toBe("p1");
    expect(links.get("r1")).toBeUndefined();
  });

  it("si no, misma URL, mismo método pedido, ≤ 5 s después y el más cercano", () => {
    const links = linkPreflights([
      ex({ id: "r1", startedAt: 1_000 }),
      preflight("far", 7_000),
      preflight("near", 1_010),
    ]);
    expect(links.get("r1")).toBe("near");
  });

  it("sin candidato ⇒ sin relación", () => {
    const links = linkPreflights([
      ex({ id: "r1", startedAt: 1_000 }),
      preflight("other-url", 1_010, { url: "https://api.test/otro" }),
      preflight("other-method", 1_010, {
        requestHeaders: [{ name: "access-control-request-method", value: "DELETE" }],
      }),
      preflight("before", 900),
      preflight("late", 6_500),
    ]);
    expect(links.size).toBe(0);
  });

  it("un preflight se relaciona con un solo request", () => {
    const links = linkPreflights([
      ex({ id: "r1", startedAt: 1_000 }),
      ex({ id: "r2", startedAt: 1_001 }),
      preflight("p1", 1_002),
    ]);
    expect([...links.values()]).toEqual(["p1"]);
  });
});
