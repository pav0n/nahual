import { describe, expect, it } from "vitest";
import { classifyCorsFailure, type CorsFailureInput } from "../../src/cors/classify.ts";

const APP = "http://localhost:3000";
const API = "https://api.test";

const input = (overrides: Partial<CorsFailureInput> = {}): CorsFailureInput => ({
  corsError: "MissingAllowOriginHeader",
  failedParameter: "",
  method: "GET",
  url: `${API}/items?x=1`,
  appOrigin: APP,
  requestHeaders: [{ name: "accept", value: "*/*" }],
  responseStatus: 200,
  responseHeaders: [{ name: "content-type", value: "application/json" }],
  preflight: null,
  ...overrides,
});

describe("classifyCorsFailure: corsError ⇒ causa (research R3)", () => {
  it.each([
    ["MissingAllowOriginHeader", "missing_allow_origin", false],
    ["PreflightMissingAllowOriginHeader", "missing_allow_origin", true],
    ["AllowOriginMismatch", "origin_mismatch", false],
    ["InvalidAllowOriginValue", "origin_mismatch", false],
    ["MultipleAllowOriginValues", "origin_mismatch", false],
    ["PreflightAllowOriginMismatch", "origin_mismatch", true],
    ["PreflightInvalidAllowOriginValue", "origin_mismatch", true],
    ["PreflightMultipleAllowOriginValues", "origin_mismatch", true],
    ["WildcardOriginNotAllowed", "wildcard_with_credentials", false],
    ["PreflightWildcardOriginNotAllowed", "wildcard_with_credentials", true],
    ["InvalidAllowCredentials", "missing_allow_credentials", false],
    ["PreflightInvalidAllowCredentials", "missing_allow_credentials", true],
    ["MethodDisallowedByPreflightResponse", "method_not_allowed", true],
    ["InvalidAllowMethodsPreflightResponse", "method_not_allowed", true],
    ["HeaderDisallowedByPreflightResponse", "header_not_allowed", true],
    ["InvalidAllowHeadersPreflightResponse", "header_not_allowed", true],
    ["PreflightInvalidStatus", "preflight_status", true],
    ["PreflightDisallowedRedirect", "preflight_redirect", true],
  ] as const)("%s ⇒ %s", (corsError, cause, atPreflight) => {
    const d = classifyCorsFailure(input({ corsError }));
    expect(d.cause).toBe(cause);
    expect(d.atPreflight).toBe(atPreflight);
    expect(d.browserCode).toBe(corsError);
    expect(d.relaxable).toBe(true);
  });

  it.each([
    "PreflightMissingAllowPrivateNetwork",
    "InsecurePrivateNetwork",
    "DisallowedByMode",
    "CorsDisabledScheme",
    "InvalidResponse",
    "RedirectContainsCredentials",
    "SomethingNew",
  ])("%s ⇒ unrecognized con el código y sin relajar", (corsError) => {
    const d = classifyCorsFailure(input({ corsError }));
    expect(d.cause).toBe("unrecognized");
    expect(d.browserCode).toBe(corsError);
    expect(d.relaxable).toBe(false);
    expect(d.notRelaxableReason).toBe("unrecognized");
  });

  it("conserva failedParameter; vacío ⇒ null", () => {
    expect(
      classifyCorsFailure(
        input({ corsError: "HeaderDisallowedByPreflightResponse", failedParameter: "x-custom" }),
      ).failedParameter,
    ).toBe("x-custom");
    expect(classifyCorsFailure(input()).failedParameter).toBeNull();
  });

  it("preflight observado con status no 2xx ⇒ preflight_status aunque Chrome diga otra cosa (X2)", () => {
    const d = classifyCorsFailure(
      input({
        corsError: "PreflightMissingAllowOriginHeader",
        method: "PUT",
        responseStatus: null,
        preflight: { exchangeId: "p1", status: 401, headers: [] },
      }),
    );
    expect(d.cause).toBe("preflight_status");
    expect(d.preflightStatus).toBe(401);
    expect(d.preflightExchangeId).toBe("p1");
  });

  it("preflight observado con 3xx ⇒ preflight_redirect", () => {
    const d = classifyCorsFailure(
      input({
        corsError: "PreflightMissingAllowOriginHeader",
        preflight: { exchangeId: "p1", status: 302, headers: [] },
      }),
    );
    expect(d.cause).toBe("preflight_redirect");
  });

  it("comodín en métodos o headers con credenciales ⇒ parámetro *", () => {
    const preflight = {
      exchangeId: "p1",
      status: 204,
      headers: [
        { name: "Access-Control-Allow-Origin", value: APP },
        { name: "Access-Control-Allow-Headers", value: "*" },
        { name: "Access-Control-Allow-Methods", value: "*" },
      ],
    };
    const cookie = [{ name: "Cookie", value: "a=1" }];
    const h = classifyCorsFailure(
      input({
        corsError: "HeaderDisallowedByPreflightResponse",
        failedParameter: "x-custom",
        requestHeaders: cookie,
        preflight,
      }),
    );
    expect(h.cause).toBe("header_not_allowed");
    expect(h.failedParameter).toBe("*");
    const m = classifyCorsFailure(
      input({
        corsError: "MethodDisallowedByPreflightResponse",
        requestHeaders: cookie,
        preflight,
      }),
    );
    expect(m.failedParameter).toBe("*");
  });
});

describe("classifyCorsFailure: qué pidió la app y qué respondió el servidor (FR-005)", () => {
  it("origen de la API, método y headers solicitados sin los del navegador", () => {
    const d = classifyCorsFailure(
      input({
        method: "PUT",
        requestHeaders: [
          { name: "X-Custom", value: "1" },
          { name: "Content-Type", value: "application/json" },
          { name: "Origin", value: APP },
          { name: "Cookie", value: "secret" },
          { name: "Sec-Fetch-Mode", value: "cors" },
        ],
      }),
    );
    expect(d.apiOrigin).toBe(API);
    expect(d.method).toBe("PUT");
    expect(d.requestedHeaders).toEqual(["content-type", "x-custom"]);
  });

  it("los headers pedidos en el preflight observado se suman", () => {
    const d = classifyCorsFailure(
      input({
        preflight: {
          exchangeId: "p1",
          status: 204,
          headers: [],
          requestedHeaders: "x-a, X-B",
        },
      }),
    );
    expect(d.requestedHeaders).toEqual(["x-a", "x-b"]);
  });

  it("serverCorsHeaders: solo Access-Control-* (del preflight si falló en él)", () => {
    const d = classifyCorsFailure(
      input({
        responseHeaders: [
          { name: "Access-Control-Allow-Origin", value: "https://otro.test" },
          { name: "Set-Cookie", value: "secreto" },
        ],
      }),
    );
    expect(d.serverCorsHeaders).toEqual([
      { name: "Access-Control-Allow-Origin", value: "https://otro.test" },
    ]);
    const p = classifyCorsFailure(
      input({
        corsError: "PreflightAllowOriginMismatch",
        responseHeaders: [],
        preflight: {
          exchangeId: "p1",
          status: 204,
          headers: [
            { name: "access-control-allow-origin", value: "https://otro.test" },
            { name: "x-other", value: "1" },
          ],
        },
      }),
    );
    expect(p.serverCorsHeaders).toEqual([
      { name: "access-control-allow-origin", value: "https://otro.test" },
    ]);
  });

  it("credenciales: sí con Cookie o con causa de credenciales; si no, desconocido (R5)", () => {
    expect(
      classifyCorsFailure(input({ requestHeaders: [{ name: "cookie", value: "a=1" }] }))
        .credentials,
    ).toBe("yes");
    expect(classifyCorsFailure(input({ corsError: "WildcardOriginNotAllowed" })).credentials).toBe(
      "yes",
    );
    expect(classifyCorsFailure(input({ corsError: "InvalidAllowCredentials" })).credentials).toBe(
      "yes",
    );
    expect(classifyCorsFailure(input()).credentials).toBe("unknown");
  });

  it("nunca incluye valores de Cookie ni Authorization", () => {
    const d = classifyCorsFailure(
      input({
        requestHeaders: [
          { name: "Cookie", value: "session=secret-cookie" },
          { name: "Authorization", value: "Bearer secret-token" },
        ],
        responseHeaders: [{ name: "set-cookie", value: "secret-set" }],
      }),
    );
    expect(JSON.stringify(d)).not.toMatch(/secret/);
    expect(d.requestedHeaders).toEqual(["authorization"]);
  });
});

describe("classifyCorsFailure: cuándo no es relajable (FR-007)", () => {
  it("origen de la app null", () => {
    const d = classifyCorsFailure(input({ appOrigin: null }));
    expect(d.relaxable).toBe(false);
    expect(d.notRelaxableReason).toBe("null_origin");
  });

  it("mismo origen que la API", () => {
    const d = classifyCorsFailure(input({ appOrigin: API }));
    expect(d.relaxable).toBe(false);
    expect(d.notRelaxableReason).toBe("same_origin");
  });

  it("destino que no es http(s) ⇒ no relajable", () => {
    const d = classifyCorsFailure(input({ url: "file:///tmp/x" }));
    expect(d.relaxable).toBe(false);
  });
});
