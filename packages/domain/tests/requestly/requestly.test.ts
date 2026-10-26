import { readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { matchPrefilter } from "../../src/match/prefilter.ts";
import { parseConfigObject } from "../../src/portable/parse.ts";
import { convertRequestly } from "../../src/requestly/convert.ts";
import { RequestlyExportSchema } from "../../src/requestly/schema.ts";
import { sourceToMatch } from "../../src/requestly/source.ts";
import { headersHook, redirectHook } from "../../src/requestly/templates.ts";
import { SITE } from "../fixtures.ts";

// 007 US5 (contracts/requestly-import.md, FR-034 a FR-038).

const fixture = JSON.parse(
  readFileSync(path.join(import.meta.dirname, "../fixtures-requestly.json"), "utf8"),
) as unknown[];
const API = "http://127.0.0.1:4311";
const THIRD = "http://127.0.0.1:4312";
const records = JSON.parse(
  JSON.stringify(fixture).replaceAll("__API__", API).replaceAll("__THIRD__", THIRD),
) as unknown[];

const matches = (source: Parameters<typeof sourceToMatch>[0], url: string) => {
  const result = sourceToMatch(source);
  if ("reasonKey" in result) throw new Error(result.reasonKey);
  return matchPrefilter(result.prefilter, url);
};

/** El hook generado compila sin errores de sintaxis (la validación de tipos completa, en E2E). */
const syntaxErrors = (code: string) =>
  ts.transpileModule(code, {
    reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).diagnostics ?? [];

describe("T062 formato y source", () => {
  it("acepta el export de Requestly y rechaza lo que no lo es", () => {
    expect(RequestlyExportSchema.safeParse(records).success).toBe(true);
    for (const bad of [{}, [], [{ objectType: "group", id: "g", name: "x" }], "x"])
      expect(convertRequestly(bad, SITE)).toEqual({
        ok: false,
        errorKey: "requestly_error_format",
      });
  });

  it("Url con igual, contiene, regex y comodín", () => {
    expect(matches({ key: "Url", operator: "Equals", value: `${API}/a` }, `${API}/a`)).toBe(true);
    expect(matches({ key: "Url", operator: "Equals", value: `${API}/a` }, `${API}/a/b`)).toBe(
      false,
    );
    expect(matches({ key: "Url", operator: "Contains", value: "/api/" }, `${API}/api/x`)).toBe(
      true,
    );
    expect(matches({ key: "Url", operator: "Contains", value: "a*b" }, `${API}/a*b`)).toBe(true);
    expect(
      matches({ key: "Url", operator: "Matches", value: "/api\\/\\d+$/" }, `${API}/api/12`),
    ).toBe(true);
    expect(
      matches({ key: "Url", operator: "Wildcard_Matches", value: `${API}/x/*` }, `${API}/x/y`),
    ).toBe(true);
  });

  it("host y path", () => {
    expect(matches({ key: "host", operator: "Equals", value: "127.0.0.1" }, `${API}/x`)).toBe(true);
    expect(
      matches({ key: "host", operator: "Equals", value: "127.0.0.1" }, "http://127.0.0.10/x"),
    ).toBe(false);
    expect(matches({ key: "host", operator: "Contains", value: "0.0" }, `${API}/x`)).toBe(true);
    expect(matches({ key: "path", operator: "Equals", value: "/x" }, `${API}/x?y=1`)).toBe(true);
    expect(
      matches({ key: "path", operator: "Contains", value: "/export/" }, `${API}/a/export/b`),
    ).toBe(true);
    expect(
      matches({ key: "path", operator: "Contains", value: "/export/" }, `${API}/a?q=/export/`),
    ).toBe(false);
  });

  it("no soportados: clave, operador, regex inválida o larga y filtros sin equivalente", () => {
    expect(sourceToMatch({ key: "pageUrl", operator: "Equals", value: "x" })).toEqual({
      reasonKey: "requestly_unsupported_source_key",
    });
    expect(sourceToMatch({ key: "Url", operator: "Starts", value: "x" })).toEqual({
      reasonKey: "requestly_unsupported_source_operator",
    });
    expect(sourceToMatch({ key: "Url", operator: "Matches", value: "/(/" })).toEqual({
      reasonKey: "requestly_unsupported_regex_invalid",
    });
    expect(
      sourceToMatch({ key: "Url", operator: "Matches", value: `/${"a".repeat(600)}/` }),
    ).toEqual({ reasonKey: "requestly_unsupported_regex_too_long" });
    expect(
      sourceToMatch({
        key: "Url",
        operator: "Contains",
        value: "x",
        filters: { requestPayload: {} },
      }),
    ).toEqual({
      reasonKey: "requestly_unsupported_filter",
    });
    expect(
      sourceToMatch({
        key: "Url",
        operator: "Contains",
        value: "x",
        filters: { requestMethod: ["post"], resourceType: ["xmlhttprequest"] },
      }),
    ).toMatchObject({
      methods: ["POST"],
      resourceTypes: ["XHR", "Fetch"],
    });
  });
});

describe("T063 plantillas de hooks", () => {
  it("redirect con comodín resuelve $1 y compila", () => {
    const code = redirectHook(
      "API",
      { key: "Url", operator: "Wildcard_Matches", value: `${API}/r/*` },
      `${THIRD}/leak?from=$1`,
    );
    expect(code.split("\n")[0]).toBe(
      `// Imported from Requestly · Redirect "API" · Url Wildcard_Matches "${API}/r/*"`,
    );
    expect(syntaxErrors(code)).toEqual([]);
    expect(code.split("\n").length).toBeLessThanOrEqual(20);
    expect(code).toContain(".replace(pattern,");
  });

  it("headers por etapa: fija y quita, compila", () => {
    const code = headersHook("H", { key: "Url", operator: "Contains", value: "/x" }, "response", [
      { header: "X-A", type: "Add", value: "1" },
      { header: "X-Frame-Options", type: "Remove" },
    ]);
    expect(code).toContain("if (!ctx.response) return;");
    expect(code).toContain('ctx.setHeader("x-a", "1");');
    expect(code).toContain('ctx.removeHeader("x-frame-options");');
    expect(syntaxErrors(code)).toEqual([]);
  });

  it("valores con comillas, */, ${} y saltos de línea quedan como texto", () => {
    const evil = 'x"; fetch("http://evil"); //*/ ${alert(1)}\n</script>';
    const redirect = redirectHook(evil, { key: "Url", operator: "Equals", value: evil }, evil);
    const headers = headersHook(
      evil,
      { key: "Url", operator: "Contains", value: evil },
      "request",
      [{ header: "x-e", type: "Add", value: evil }],
    );
    for (const code of [redirect, headers]) {
      expect(syntaxErrors(code)).toEqual([]);
      expect(code).not.toMatch(/^\s*fetch\(/m);
      expect(code.split("\n")[0]?.startsWith("// Imported from Requestly")).toBe(true);
    }
  });
});

describe("T064 conversión del export de prueba (SC-009)", () => {
  const result = convertRequestly(records, SITE);
  if (!result.ok) throw new Error(result.errorKey);
  const rules = result.config.sites[0]?.rules ?? [];
  const byName = (name: string) => rules.find((r) => r.name === name);

  it("convierte lo soportado y lista lo demás con su motivo", () => {
    expect(rules.map((r) => r.name).sort()).toEqual(
      [
        "API a tercer origen",
        "Header de request",
        "Header de response",
        "Headers en ambas etapas (request)",
        "Headers en ambas etapas (response)",
        "API caida",
        "Respuesta sin request",
      ].sort(),
    );
    expect(result.unsupported).toEqual([
      { name: "Respuesta con codigo", reasonKey: "requestly_unsupported_response_code" },
      { name: "Quitar utm", reasonKey: "requestly_unsupported_rule_type" },
      { name: "Inyectar script", reasonKey: "requestly_unsupported_rule_type" },
      { name: "Filtro por payload", reasonKey: "requestly_unsupported_filter" },
      { name: "Regex invalida", reasonKey: "requestly_unsupported_regex_invalid" },
      { name: "Map local", reasonKey: "requestly_unsupported_redirect_destination" },
      {
        name: "Dos parejas, una no convertible",
        reasonKey: "requestly_unsupported_redirect_destination",
      },
    ]);
    expect(rules.every((r) => !r.enabled)).toBe(true);
  });

  it("response estática ⇒ Mock con status, body y content-type; sin request ⇒ etapa Request", () => {
    expect(byName("API caida")).toMatchObject({
      stage: "response",
      action: {
        kind: "mock",
        status: 503,
        body: '{"error":"mantenimiento"}',
        headers: [{ name: "content-type", value: "application/json" }],
      },
    });
    expect(byName("Respuesta sin request")).toMatchObject({
      stage: "request",
      action: {
        kind: "mock",
        status: 200,
        headers: [{ name: "content-type", value: "text/plain" }],
      },
    });
  });

  it("redirect y headers ⇒ hooks; métodos del filtro; grupos ⇒ perfiles (sin los vacíos)", () => {
    expect(byName("API a tercer origen")?.action.kind).toBe("hook");
    expect(byName("Header de request")).toMatchObject({ stage: "request", methods: ["POST"] });
    expect(byName("Header de response")?.stage).toBe("response");
    const profiles = result.config.sites[0]?.profiles ?? [];
    expect(profiles.map((p) => p.name)).toEqual(["QA staging"]);
    const qa = profiles[0]?.id;
    expect(
      rules
        .filter((r) => qa && r.profileIds.includes(qa))
        .map((r) => r.name)
        .sort(),
    ).toEqual(["API a tercer origen", "API caida", "Header de request"].sort());
  });

  it("el resultado pasa la validación completa de la configuración portable", () => {
    expect(
      parseConfigObject(result.config, { rules: [], profiles: [], productionOrigins: [] }).ok,
    ).toBe(true);
  });
});
