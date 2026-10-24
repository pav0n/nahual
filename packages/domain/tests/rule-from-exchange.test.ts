import { describe, expect, it } from "vitest";
import { matchesGlob } from "../src/match/glob.ts";
import { ruleDraftFromExchange } from "../src/rule-from-exchange.ts";
import type { CapturedExchange } from "../src/schemas/exchange.ts";
import { LIMITS } from "../src/schemas/limits.ts";
import { RuleDraftSchema } from "../src/schemas/rule.ts";

function exchange(overrides: Partial<CapturedExchange> = {}): CapturedExchange {
  return {
    id: "ex-1",
    seq: 1,
    method: "GET",
    url: "https://api.test/items?page=2",
    urlTruncated: false,
    resourceType: "Fetch",
    isPreflight: false,
    requestHeaders: [],
    responseHeaders: [],
    status: 200,
    state: "complete",
    encodedSize: 10,
    decodedSize: 10,
    startedAt: 1,
    durationMs: 5,
    mimeType: "application/json",
    requestBody: { available: false, size: null, reason: "none" },
    responseBody: { available: false, size: null, reason: "none" },
    ruleEffects: [],
    ...overrides,
  };
}

describe("regla a partir de un request (004, research R7, data-model)", () => {
  it("prellena nombre, prefiltro, método, tipo, etapa, condiciones y acción", () => {
    expect(ruleDraftFromExchange(exchange())).toEqual({
      name: "GET /items",
      enabled: true,
      prefilter: { kind: "glob", pattern: "https://api.test/items*" },
      methods: ["GET"],
      resourceTypes: ["Fetch"],
      stage: "response",
      conditions: [],
      action: { kind: "pause" },
    });
  });

  it("etapa response si el request no lleva body y tuvo respuesta: es lo que hay que editar", () => {
    expect(ruleDraftFromExchange(exchange()).stage).toBe("response");
    expect(ruleDraftFromExchange(exchange({ method: "OPTIONS", isPreflight: true })).stage).toBe(
      "response",
    );
  });

  it.each([
    ["con body de texto", { available: true, size: 12 }],
    ["con body binario", { available: false, size: null, reason: "binary" as const }],
    ["con body demasiado grande", { available: false, size: null, reason: "tooLarge" as const }],
  ])("etapa request si el request lleva body (%s)", (_name, requestBody) => {
    expect(ruleDraftFromExchange(exchange({ method: "POST", requestBody })).stage).toBe("request");
  });

  it("etapa request si nunca hubo respuesta (falló la red o sigue pendiente)", () => {
    expect(ruleDraftFromExchange(exchange({ status: null, state: "failed" })).stage).toBe(
      "request",
    );
    expect(ruleDraftFromExchange(exchange({ status: null, state: "pending" })).stage).toBe(
      "request",
    );
  });

  it("el prefiltro no incluye la query: la cubre el `*` final", () => {
    const draft = ruleDraftFromExchange(exchange({ url: "https://api.test/a/b?x=1&y=2#frag" }));
    expect(draft.prefilter.pattern).toBe("https://api.test/a/b*");
  });

  it("escapa `*`, `?` y `\\` de la URL para no ampliar el patrón", () => {
    const draft = ruleDraftFromExchange(exchange({ url: "https://api.test/a*b/c%3F\\d?q=1" }));
    expect(draft.prefilter.pattern).toBe("https://api.test/a\\*b/c%3F\\\\d*");
    expect(matchesGlob(draft.prefilter.pattern, "https://api.test/aZZb/c%3F\\d")).toBe(false);
  });

  it("un preflight queda con método OPTIONS", () => {
    const draft = ruleDraftFromExchange(
      exchange({ method: "OPTIONS", isPreflight: true, resourceType: "Preflight" }),
    );
    expect(draft.methods).toEqual(["OPTIONS"]);
    expect(draft.resourceTypes).toEqual(["Preflight"]);
  });

  it("un tipo de recurso desconocido no se filtra", () => {
    expect(ruleDraftFromExchange(exchange({ resourceType: "Raro" })).resourceTypes).toEqual([]);
  });

  it("un método que no es de HTTP_METHODS no se filtra", () => {
    expect(ruleDraftFromExchange(exchange({ method: "PROPFIND" })).methods).toEqual([]);
  });

  it(`el nombre se recorta a LIMITS.ruleNameMax (${LIMITS.ruleNameMax})`, () => {
    const draft = ruleDraftFromExchange(exchange({ url: `https://api.test/${"a".repeat(200)}` }));
    expect(draft.name.length).toBeLessThanOrEqual(LIMITS.ruleNameMax);
    expect(draft.name.startsWith("GET /aaa")).toBe(true);
  });

  it(`si no cabe en LIMITS.globMax (${LIMITS.globMax}) se recorta la ruta y termina en *`, () => {
    const url = `https://api.test/${"seg/".repeat(1000)}fin`;
    const draft = ruleDraftFromExchange(exchange({ url }));
    expect(draft.prefilter.pattern.length).toBeLessThanOrEqual(LIMITS.globMax);
    expect(draft.prefilter.pattern.endsWith("*")).toBe(true);
    expect(matchesGlob(draft.prefilter.pattern, url)).toBe(true);
  });

  it("al recortar no deja un `\\` suelto que escape el `*` final", () => {
    const url = `https://api.test/${"\\".repeat(3000)}`;
    const draft = ruleDraftFromExchange(exchange({ url }));
    expect(draft.prefilter.pattern.length).toBeLessThanOrEqual(LIMITS.globMax);
    expect(matchesGlob(draft.prefilter.pattern, url)).toBe(true);
  });

  it.each([
    ["con query", "https://api.test/items?page=2&q=a*b"],
    ["con * y ? en la ruta", "https://api.test/a*b/c?d"],
    ["muy larga", `https://api.test/${"x".repeat(5000)}`],
    ["con puerto", "http://127.0.0.1:8080/api/v1/users"],
    ["IPv6", "http://[::1]:3000/api"],
    ["raíz", "https://api.test/"],
    ["data:", "data:text/plain,hola?x"],
  ])("%s: pasa RuleDraftSchema y coincide con su URL", (_name, url) => {
    const draft = ruleDraftFromExchange(exchange({ url }));
    expect(RuleDraftSchema.safeParse(draft).success).toBe(true);
    expect(matchesGlob(draft.prefilter.pattern, url)).toBe(true);
  });
});
