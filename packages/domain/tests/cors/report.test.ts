import { describe, expect, it } from "vitest";
import { buildCorsReport, renderCorsReport, type ReportExchange } from "../../src/cors/report.ts";
import type { CorsDiagnosis } from "../../src/cors/schemas.ts";

const APP = "http://localhost:3000";
const API = "https://api-dev.test";

const diagnosis = (overrides: Partial<CorsDiagnosis> = {}): CorsDiagnosis => ({
  cause: "missing_allow_origin",
  browserCode: "MissingAllowOriginHeader",
  failedParameter: null,
  atPreflight: false,
  appOrigin: APP,
  apiOrigin: API,
  method: "GET",
  requestedHeaders: [],
  credentials: "unknown",
  responseStatus: 200,
  preflightStatus: null,
  serverCorsHeaders: [],
  preflightExchangeId: null,
  relaxable: true,
  ...overrides,
});

const ex = (overrides: Partial<ReportExchange> = {}): ReportExchange => ({
  url: `${API}/items`,
  method: "GET",
  isPreflight: false,
  requestHeaders: [],
  ...overrides,
});

/** Traductor de prueba: devuelve la clave con sus parámetros. */
const t = (key: string, subs?: string | string[]) =>
  `[${key}${subs === undefined ? "" : `:${[subs].flat().join("|")}`}]`;

describe("buildCorsReport (FR-032, FR-033)", () => {
  const exchanges: ReportExchange[] = [
    ex({
      url: `${API}/items?token=secret-query-token`,
      requestHeaders: [
        { name: "Authorization", value: "Bearer secret-auth-token" },
        { name: "Cookie", value: "session=secret-cookie" },
      ],
      cors: { diagnosis: diagnosis({ requestedHeaders: ["authorization"], credentials: "yes" }) },
    }),
    ex({
      url: `${API}/items/7?page=2`,
      method: "PUT",
      cors: {
        diagnosis: diagnosis({
          cause: "preflight_status",
          method: "PUT",
          requestedHeaders: ["x-custom"],
        }),
      },
    }),
    ex({
      url: `${API}/items/7`,
      method: "OPTIONS",
      isPreflight: true,
      requestHeaders: [
        { name: "Access-Control-Request-Method", value: "DELETE" },
        { name: "Access-Control-Request-Headers", value: "x-trace" },
        { name: "Origin", value: APP },
      ],
      cors: {
        relaxed: {
          relaxationId: "3f1c2b4a-8d9e-4f60-a1b2-c3d4e5f60718",
          added: [],
          removed: [],
          preflightReplaced: true,
          serverStatus: 401,
          alreadyValid: false,
        },
      },
    }),
    ex({
      url: "https://otra-api.test/x",
      cors: { diagnosis: diagnosis({ apiOrigin: "https://otra-api.test" }) },
    }),
    ex({ url: `${API}/sin-cors` }),
  ];

  it("reúne orígenes, métodos, headers, credenciales, causas y endpoints sin query", () => {
    const report = buildCorsReport(exchanges, API);
    expect(report).toEqual({
      apiOrigin: API,
      appOrigins: [APP],
      methods: ["DELETE", "GET", "PUT"],
      requestedHeaders: ["authorization", "x-custom", "x-trace"],
      credentials: true,
      suggestedMaxAgeSeconds: 600,
      causes: [
        { cause: "missing_allow_origin", count: 1 },
        { cause: "preflight_status", count: 1 },
      ],
      endpoints: ["DELETE /items/7", "GET /items", "PUT /items/7"],
      relaxedInBrowser: true,
      exchangeCount: 3,
    });
  });

  it("como mucho 50 endpoints, deduplicados", () => {
    const many = Array.from({ length: 70 }, (_, i) =>
      ex({ url: `${API}/r/${i % 60}`, cors: { diagnosis: diagnosis() } }),
    );
    expect(buildCorsReport(many, API).endpoints).toHaveLength(50);
  });

  it("sin intercambios de ese origen ⇒ vacío", () => {
    expect(buildCorsReport(exchanges, "https://nada.test").exchangeCount).toBe(0);
  });
});

describe("renderCorsReport (FR-035, FR-036, SC-006)", () => {
  const report = buildCorsReport(
    [
      ex({
        url: `${API}/items?token=secret-query-token`,
        requestHeaders: [
          { name: "Authorization", value: "Bearer secret-auth-token" },
          { name: "Cookie", value: "session=secret-cookie" },
        ],
        cors: { diagnosis: diagnosis({ requestedHeaders: ["authorization"], credentials: "yes" }) },
      }),
    ],
    API,
  );

  it("nunca incluye valores sensibles", () => {
    for (const framework of [
      undefined,
      "express",
      "nestjs",
      "aws_api_gateway",
      "cloud_run",
    ] as const) {
      const text = renderCorsReport(report, { t, ...(framework ? { framework } : {}) });
      expect(text).not.toMatch(/secret/);
    }
  });

  it("toma sus textos de t e incluye el aviso de «solo en este navegador»", () => {
    const text = renderCorsReport(report, { t });
    expect(text).toContain(`[cors_report_title:${API}]`);
    expect(text).toContain("[cors_report_warning]");
    expect(text).toContain(APP);
    expect(text).toContain("authorization");
    expect(text).toContain("[cors_report_max_age:600]");
    expect(text).toContain("GET /items");
  });

  it("con framework añade el ejemplo", () => {
    expect(renderCorsReport(report, { t, framework: "express" })).toContain("app.use(cors(");
  });
});
