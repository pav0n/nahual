import { describe, expect, it } from "vitest";
import type { CorsReport } from "../../src/cors/report.ts";
import { FRAMEWORKS, corsSnippet } from "../../src/cors/snippets.ts";

const report = (overrides: Partial<CorsReport> = {}): CorsReport => ({
  apiOrigin: "https://api-dev.test",
  appOrigins: ["http://localhost:3000"],
  methods: ["GET", "PUT"],
  requestedHeaders: ["content-type", "x-custom"],
  credentials: true,
  suggestedMaxAgeSeconds: 600,
  causes: [],
  endpoints: [],
  relaxedInBrowser: false,
  exchangeCount: 1,
  ...overrides,
});

describe("corsSnippet: ejemplos por framework (FR-034)", () => {
  it("los cuatro de la clarificación", () => {
    expect(FRAMEWORKS).toEqual(["express", "nestjs", "aws_api_gateway", "cloud_run"]);
  });

  it.each(FRAMEWORKS)("%s usa el origen exacto, los métodos y los headers del reporte", (fw) => {
    const text = corsSnippet(fw, report());
    expect(text).toContain("http://localhost:3000");
    expect(text).toContain("PUT");
    expect(text).toContain("x-custom");
    expect(text).not.toMatch(/["']\*["']/);
    expect(text).not.toMatch(/: \*$/m);
  });

  it("con credenciales lo indica en cada framework", () => {
    expect(corsSnippet("express", report())).toContain("credentials: true");
    expect(corsSnippet("nestjs", report())).toContain("credentials: true");
    expect(corsSnippet("aws_api_gateway", report())).toContain('"AllowCredentials": true');
    expect(corsSnippet("cloud_run", report())).toContain("Access-Control-Allow-Credentials: true");
  });

  it.each(FRAMEWORKS)("%s sin credenciales ni headers no los menciona", (fw) => {
    const text = corsSnippet(fw, report({ credentials: false, requestedHeaders: [] }));
    expect(text).not.toMatch(/credentials/i);
  });

  it("sin credenciales no lo pide", () => {
    expect(corsSnippet("express", report({ credentials: false }))).not.toContain("credentials");
    expect(corsSnippet("cloud_run", report({ credentials: false }))).not.toContain(
      "Allow-Credentials",
    );
  });

  it("Cloud Run explica dónde configurarlo", () => {
    expect(corsSnippet("cloud_run", report())).toMatch(/does not configure CORS by itself/);
  });

  it("los datos se insertan escapados", () => {
    const text = corsSnippet("express", report({ appOrigins: ['http://a.test"); evil(//'] }));
    expect(text).toContain(JSON.stringify('http://a.test"); evil(//'));
  });
});
