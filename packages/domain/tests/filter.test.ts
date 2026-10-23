import { describe, expect, it } from "vitest";
import { compileFilter, type FilterInput, type FilterableExchange } from "../src/filter.ts";

const ex = (overrides: Partial<FilterableExchange> = {}): FilterableExchange => ({
  url: "https://api.test/api/Items?page=1",
  status: 200,
  resourceType: "Fetch",
  ...overrides,
});

const empty: FilterInput = { text: "", regex: "", status: "", types: [] };
const run = (input: Partial<FilterInput>, exchange: FilterableExchange) => {
  const compiled = compileFilter({ ...empty, ...input });
  if (!compiled.ok) throw new Error("filtro inválido");
  return compiled.matches(exchange);
};

describe("filtro de tráfico (FR-003)", () => {
  it("sin filtros pasa todo", () => {
    expect(run({}, ex())).toBe(true);
    expect(run({}, ex({ status: null }))).toBe(true);
  });

  it("texto: subcadena de la URL sin distinguir mayúsculas", () => {
    expect(run({ text: "items" }, ex())).toBe(true);
    expect(run({ text: "ITEMS?PAGE" }, ex())).toBe(true);
    expect(run({ text: "users" }, ex())).toBe(false);
  });

  it("regex sobre la URL", () => {
    expect(run({ regex: "/api/(items|empty)" }, ex({ url: "https://x/api/empty" }))).toBe(true);
    expect(run({ regex: "^https://other" }, ex())).toBe(false);
  });

  it("regex inválida ⇒ ok: false (el panel conserva el filtro anterior)", () => {
    expect(compileFilter({ ...empty, regex: "([a-z" })).toEqual({ ok: false, field: "regex" });
  });

  it("status exacto, clase o lista separada por comas", () => {
    expect(run({ status: "404" }, ex({ status: 404 }))).toBe(true);
    expect(run({ status: "404" }, ex({ status: 405 }))).toBe(false);
    expect(run({ status: "5xx" }, ex({ status: 503 }))).toBe(true);
    expect(run({ status: "5XX" }, ex({ status: 404 }))).toBe(false);
    expect(run({ status: "4xx, 500" }, ex({ status: 500 }))).toBe(true);
    expect(run({ status: "1xx" }, ex({ status: 101 }))).toBe(true);
  });

  it("status inválido ⇒ ok: false", () => {
    expect(compileFilter({ ...empty, status: "6xx" })).toEqual({ ok: false, field: "status" });
    expect(compileFilter({ ...empty, status: "abc" })).toEqual({ ok: false, field: "status" });
  });

  it("los pendientes sin status no pasan un filtro de status", () => {
    expect(run({ status: "2xx" }, ex({ status: null }))).toBe(false);
  });

  it("tipos de recurso: uno o varios", () => {
    expect(run({ types: ["Fetch"] }, ex())).toBe(true);
    expect(run({ types: ["XHR", "Fetch"] }, ex())).toBe(true);
    expect(run({ types: ["Script"] }, ex())).toBe(false);
  });

  it("los filtros se combinan con Y", () => {
    const input = { text: "items", status: "2xx", types: ["Fetch"] };
    expect(run(input, ex())).toBe(true);
    expect(run(input, ex({ status: 500 }))).toBe(false);
    expect(run(input, ex({ resourceType: "XHR" }))).toBe(false);
  });

  it("la URL evaluada por la regex se acota a 8 KB (research R19)", () => {
    const url = `https://x.test/${"a".repeat(10_000)}END`;
    expect(run({ regex: "END$" }, ex({ url }))).toBe(false);
  });
});
