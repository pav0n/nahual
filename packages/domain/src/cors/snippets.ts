import type { CorsReport } from "./report.ts";

/** Ejemplos de configuración del reporte (clarificación de la spec, FR-034). */
export const FRAMEWORKS = ["express", "nestjs", "aws_api_gateway", "cloud_run"] as const;
export type Framework = (typeof FRAMEWORKS)[number];

const json = (value: unknown) => JSON.stringify(value);

/**
 * Configuración CORS para un framework, coherente con el reporte: orígenes exactos, nunca `*`.
 * Los datos entran serializados con `JSON.stringify`; los comentarios van en inglés.
 */
export function corsSnippet(framework: Framework, report: CorsReport): string {
  const origins = report.appOrigins;
  const methods = report.methods;
  const headers = report.requestedHeaders;
  const maxAge = report.suggestedMaxAgeSeconds;
  switch (framework) {
    case "express":
      return [
        "// npm install cors",
        'const cors = require("cors");',
        "app.use(cors({",
        `  origin: ${json(origins)},`,
        `  methods: ${json(methods)},`,
        `  allowedHeaders: ${json(headers)},`,
        ...(report.credentials ? ["  credentials: true,"] : []),
        `  maxAge: ${maxAge},`,
        "}));",
      ].join("\n");
    case "nestjs":
      return [
        "// main.ts",
        "app.enableCors({",
        `  origin: ${json(origins)},`,
        `  methods: ${json(methods)},`,
        `  allowedHeaders: ${json(headers)},`,
        ...(report.credentials ? ["  credentials: true,"] : []),
        `  maxAge: ${maxAge},`,
        "});",
      ].join("\n");
    case "aws_api_gateway":
      return [
        "# HTTP API: CorsConfiguration (REST API: enable CORS on each resource and return the same",
        "# headers from the integration, including OPTIONS)",
        JSON.stringify(
          {
            CorsConfiguration: {
              AllowOrigins: origins,
              AllowMethods: methods,
              AllowHeaders: headers,
              ...(report.credentials ? { AllowCredentials: true } : {}),
              MaxAge: maxAge,
            },
          },
          null,
          2,
        ),
      ].join("\n");
    case "cloud_run":
      return [
        "# Cloud Run does not configure CORS by itself: configure it in your app (see the Express or",
        "# NestJS example) or in the load balancer / API Gateway in front of the service.",
        "# Headers the service must return (one allowed origin per response, matching the request's",
        "# Origin):",
        ...origins.map((origin) => `Access-Control-Allow-Origin: ${origin}`),
        `Access-Control-Allow-Methods: ${methods.join(", ")}`,
        ...(headers.length > 0 ? [`Access-Control-Allow-Headers: ${headers.join(", ")}`] : []),
        ...(report.credentials ? ["Access-Control-Allow-Credentials: true"] : []),
        `Access-Control-Max-Age: ${maxAge}`,
        "Vary: Origin",
      ].join("\n");
  }
}
