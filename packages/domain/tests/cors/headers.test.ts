import { describe, expect, it } from "vitest";
import {
  computeRelaxedHeaders,
  preflightPasses,
  responsePasses,
  type RelaxContext,
} from "../../src/cors/headers.ts";
import type { Header } from "../../src/schemas/common.ts";

const APP = "http://localhost:3000";
const ctx = (overrides: Partial<RelaxContext> = {}): RelaxContext => ({
  appOrigin: APP,
  credentials: false,
  exposeHeaders: [],
  ...overrides,
});
const get = (headers: Header[], name: string) =>
  headers.filter((h) => h.name.toLowerCase() === name).map((h) => h.value);
const PERMISSION = [
  "access-control-allow-origin",
  "access-control-allow-methods",
  "access-control-allow-headers",
  "access-control-expose-headers",
];

describe("computeRelaxedHeaders: respuesta real (research R7)", () => {
  const server: Header[] = [
    { name: "Content-Type", value: "application/json" },
    { name: "Access-Control-Allow-Origin", value: "*" },
    { name: "Access-Control-Max-Age", value: "600" },
  ];

  it("Allow-Origin exacto, sin Allow-Credentials sin credenciales, reemplaza los del servidor", () => {
    const r = computeRelaxedHeaders(server, ctx());
    if (r.kind !== "response") throw new Error(r.kind);
    expect(get(r.headers, "access-control-allow-origin")).toEqual([APP]);
    expect(get(r.headers, "access-control-allow-credentials")).toEqual([]);
    expect(get(r.headers, "access-control-max-age")).toEqual([]);
    expect(get(r.headers, "content-type")).toEqual(["application/json"]);
    expect(r.removed).toEqual([
      { name: "Access-Control-Allow-Origin", value: "*" },
      { name: "Access-Control-Max-Age", value: "600" },
    ]);
    expect(r.added).toContainEqual({ name: "Access-Control-Allow-Origin", value: APP });
  });

  it("Allow-Credentials: true solo con credenciales", () => {
    const r = computeRelaxedHeaders(server, ctx({ credentials: true }));
    expect(get(r.kind === "response" ? r.headers : [], "access-control-allow-credentials")).toEqual(
      ["true"],
    );
  });

  it("Expose-Headers solo si la lista no está vacía", () => {
    const r = computeRelaxedHeaders(server, ctx({ exposeHeaders: ["x-total", "x-page"] }));
    if (r.kind !== "response") throw new Error(r.kind);
    expect(get(r.headers, "access-control-expose-headers")).toEqual(["x-total, x-page"]);
  });

  it("Vary: Origin añadido sin duplicar", () => {
    const a = computeRelaxedHeaders([], ctx());
    expect(get(a.kind === "response" ? a.headers : [], "vary")).toEqual(["Origin"]);
    const b = computeRelaxedHeaders([{ name: "Vary", value: "Accept-Encoding" }], ctx());
    expect(get(b.kind === "response" ? b.headers : [], "vary")).toEqual([
      "Accept-Encoding, Origin",
    ]);
    const c = computeRelaxedHeaders([{ name: "vary", value: "origin" }], ctx());
    expect(get(c.kind === "response" ? c.headers : [], "vary")).toEqual(["origin"]);
  });

  it("respeta los Access-Control-* fijados por el dev (FR-024)", () => {
    const r = computeRelaxedHeaders(
      [{ name: "Access-Control-Allow-Origin", value: "http://dev.test" }],
      ctx({ pinned: ["access-control-allow-origin"] }),
    );
    if (r.kind !== "response") throw new Error(r.kind);
    expect(get(r.headers, "access-control-allow-origin")).toEqual(["http://dev.test"]);
    expect(r.removed).toEqual([]);
  });
});

describe("computeRelaxedHeaders: preflight reemplazado (research R7, FR-012, FR-013)", () => {
  it("204 con método y headers pedidos, Max-Age 0", () => {
    const r = computeRelaxedHeaders(
      [{ name: "WWW-Authenticate", value: "Bearer" }],
      ctx({ credentials: true }),
      { requestMethod: "put", requestHeaders: "X-Custom, content-type, x-custom" },
    );
    if (r.kind !== "preflight") throw new Error(r.kind);
    expect(r.status).toBe(204);
    expect(get(r.headers, "access-control-allow-origin")).toEqual([APP]);
    expect(get(r.headers, "access-control-allow-credentials")).toEqual(["true"]);
    expect(get(r.headers, "access-control-allow-methods")).toEqual(["PUT"]);
    expect(get(r.headers, "access-control-allow-headers")).toEqual(["content-type, x-custom"]);
    expect(get(r.headers, "access-control-max-age")).toEqual(["0"]);
    expect(get(r.headers, "www-authenticate")).toEqual([]);
  });

  it("sin headers pedidos no envía Allow-Headers", () => {
    const r = computeRelaxedHeaders([], ctx(), { requestMethod: "DELETE", requestHeaders: null });
    expect(get(r.kind === "preflight" ? r.headers : [], "access-control-allow-headers")).toEqual(
      [],
    );
  });

  it("Access-Control-Request-Headers: * o un nombre inválido ⇒ not_relaxable", () => {
    expect(
      computeRelaxedHeaders([], ctx(), { requestMethod: "PUT", requestHeaders: "*" }).kind,
    ).toBe("not_relaxable");
    expect(
      computeRelaxedHeaders([], ctx(), { requestMethod: "PUT", requestHeaders: "bad header" }).kind,
    ).toBe("not_relaxable");
    expect(
      computeRelaxedHeaders([], ctx(), { requestMethod: "P T", requestHeaders: null }).kind,
    ).toBe("not_relaxable");
  });

  it("un origen de la app inválido ⇒ not_relaxable", () => {
    expect(computeRelaxedHeaders([], ctx({ appOrigin: "*" })).kind).toBe("not_relaxable");
    expect(computeRelaxedHeaders([], ctx({ appOrigin: "null" })).kind).toBe("not_relaxable");
  });
});

describe("computeRelaxedHeaders nunca produce comodines (FR-010, FR-011, SC-005)", () => {
  const servers: Header[][] = [
    [],
    [{ name: "Access-Control-Allow-Origin", value: "*" }],
    [
      { name: "Access-Control-Allow-Methods", value: "*" },
      { name: "Access-Control-Allow-Headers", value: "*" },
      { name: "Access-Control-Expose-Headers", value: "*" },
    ],
  ];
  const preflights = [
    undefined,
    { requestMethod: "PUT", requestHeaders: "x-a" },
    { requestMethod: "GET", requestHeaders: null },
  ];
  for (const server of servers)
    for (const credentials of [false, true])
      for (const exposeHeaders of [[], ["x-total"], ["*"]])
        for (const preflight of preflights)
          it(`server=${JSON.stringify(server)} cred=${credentials} expose=${exposeHeaders} preflight=${preflight?.requestMethod}`, () => {
            const r = computeRelaxedHeaders(server, ctx({ credentials, exposeHeaders }), preflight);
            if (r.kind === "not_relaxable") return;
            for (const name of PERMISSION)
              for (const value of get(r.headers, name))
                expect(value.split(",").map((v) => v.trim())).not.toContain("*");
          });
});

describe("preflightPasses (research R8)", () => {
  const ok: Header[] = [
    { name: "Access-Control-Allow-Origin", value: APP },
    { name: "Access-Control-Allow-Methods", value: "GET, put" },
    { name: "Access-Control-Allow-Headers", value: "X-Custom, content-type" },
  ];
  const req = { method: "PUT", requestHeaders: ["x-custom"] };
  const pass = (status: number, headers: Header[], r = req, credentials = false) =>
    preflightPasses({ status, headers }, r, { appOrigin: APP, credentials });

  it("2xx con origen, método y headers permitidos ⇒ pasa; 3xx/4xx no", () => {
    expect(pass(204, ok)).toBe(true);
    expect(pass(200, ok)).toBe(true);
    expect(pass(302, ok)).toBe(false);
    expect(pass(401, ok)).toBe(false);
  });

  it("origen exacto o * sin credenciales", () => {
    expect(pass(204, [{ name: "access-control-allow-origin", value: "https://otro.test" }])).toBe(
      false,
    );
    const star = [{ name: "access-control-allow-origin", value: "*" }];
    expect(pass(204, star, { method: "GET", requestHeaders: [] })).toBe(true);
    expect(pass(204, star, { method: "GET", requestHeaders: [] }, true)).toBe(false);
  });

  it("credenciales exigen Allow-Credentials: true", () => {
    expect(pass(204, ok, req, true)).toBe(false);
    expect(
      pass(204, [...ok, { name: "Access-Control-Allow-Credentials", value: "true" }], req, true),
    ).toBe(true);
  });

  it("métodos simples implícitos; * sin credenciales sí y con credenciales no", () => {
    const origin = [{ name: "Access-Control-Allow-Origin", value: APP }];
    expect(pass(204, origin, { method: "post", requestHeaders: [] })).toBe(true);
    expect(pass(204, origin, { method: "DELETE", requestHeaders: [] })).toBe(false);
    const star = [...origin, { name: "Access-Control-Allow-Methods", value: "*" }];
    expect(pass(204, star, { method: "DELETE", requestHeaders: [] })).toBe(true);
    const cred = [...star, { name: "Access-Control-Allow-Credentials", value: "true" }];
    expect(pass(204, cred, { method: "DELETE", requestHeaders: [] }, true)).toBe(false);
  });

  it("headers: * no cubre authorization ni vale con credenciales", () => {
    const base = [{ name: "Access-Control-Allow-Origin", value: APP }];
    const star = [...base, { name: "Access-Control-Allow-Headers", value: "*" }];
    expect(pass(204, star, { method: "GET", requestHeaders: ["x-a"] })).toBe(true);
    expect(pass(204, star, { method: "GET", requestHeaders: ["authorization"] })).toBe(false);
    expect(pass(204, base, { method: "GET", requestHeaders: ["x-a"] })).toBe(false);
  });
});

describe("responsePasses: el servidor ya responde bien", () => {
  it("origen exacto (o * sin credenciales) y credenciales si hacen falta", () => {
    const exact = [{ name: "Access-Control-Allow-Origin", value: APP }];
    expect(responsePasses(exact, { appOrigin: APP, credentials: false })).toBe(true);
    expect(responsePasses(exact, { appOrigin: APP, credentials: true })).toBe(false);
    expect(
      responsePasses([...exact, { name: "access-control-allow-credentials", value: "true" }], {
        appOrigin: APP,
        credentials: true,
      }),
    ).toBe(true);
    expect(
      responsePasses([{ name: "Access-Control-Allow-Origin", value: "*" }], {
        appOrigin: APP,
        credentials: false,
      }),
    ).toBe(true);
    expect(responsePasses([], { appOrigin: APP, credentials: false })).toBe(false);
  });
});
