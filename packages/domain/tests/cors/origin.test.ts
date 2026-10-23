import { describe, expect, it } from "vitest";
import {
  OriginSchema,
  matchProductionOrigin,
  parseOrigin,
  parseProductionEntry,
} from "../../src/cors/origin.ts";

describe("parseOrigin (data-model: Origin)", () => {
  it("normaliza: minúsculas, sin puerto por defecto, sin barra final", () => {
    expect(parseOrigin("HTTP://LocalHost:3000/")).toBe("http://localhost:3000");
    expect(parseOrigin("https://api-dev.Empresa.com:443")).toBe("https://api-dev.empresa.com");
    expect(parseOrigin("http://app.test:80")).toBe("http://app.test");
    expect(parseOrigin("http://127.0.0.1:4311")).toBe("http://127.0.0.1:4311");
  });

  it("solo http y https", () => {
    expect(parseOrigin("ftp://a.test")).toBeNull();
    expect(parseOrigin("file:///tmp/a")).toBeNull();
    expect(parseOrigin("chrome-extension://abc")).toBeNull();
  });

  it("rechaza null, rutas, query, credenciales y caracteres de patrón", () => {
    expect(parseOrigin("null")).toBeNull();
    expect(parseOrigin("")).toBeNull();
    expect(parseOrigin("https://a.test/ruta")).toBeNull();
    expect(parseOrigin("https://a.test?x=1")).toBeNull();
    expect(parseOrigin("https://a.test#x")).toBeNull();
    expect(parseOrigin("https://user:pw@a.test")).toBeNull();
    expect(parseOrigin("https://*.a.test")).toBeNull();
    expect(parseOrigin("https://a?.test")).toBeNull();
    expect(parseOrigin("https://a\\b.test")).toBeNull();
  });

  it("máximo 256 caracteres", () => {
    expect(parseOrigin(`https://${"a".repeat(250)}.test`)).toBeNull();
  });

  it("OriginSchema acepta solo orígenes ya normalizados", () => {
    expect(OriginSchema.safeParse("http://localhost:3000").success).toBe(true);
    expect(OriginSchema.safeParse("http://localhost:3000/").success).toBe(false);
    expect(OriginSchema.safeParse("HTTP://localhost:3000").success).toBe(false);
  });
});

describe("parseProductionEntry (FR-028)", () => {
  it("acepta orígenes exactos normalizados", () => {
    expect(parseProductionEntry("https://App.Empresa.com/")).toBe("https://app.empresa.com");
    expect(parseProductionEntry("http://localhost:8080")).toBe("http://localhost:8080");
  });

  it("acepta patrones de subdominio con esquema y puerto opcional", () => {
    expect(parseProductionEntry("https://*.Empresa.com")).toBe("https://*.empresa.com");
    expect(parseProductionEntry("https://*.empresa.com:443/")).toBe("https://*.empresa.com");
    expect(parseProductionEntry("http://*.empresa.com:8080")).toBe("http://*.empresa.com:8080");
  });

  it("rechaza patrones mal formados", () => {
    expect(parseProductionEntry("*.empresa.com")).toBeNull();
    expect(parseProductionEntry("https://*")).toBeNull();
    expect(parseProductionEntry("https://*.com")).toBeNull();
    expect(parseProductionEntry("https://a.*.empresa.com")).toBeNull();
    expect(parseProductionEntry("https://*.*.empresa.com")).toBeNull();
    expect(parseProductionEntry("https://*empresa.com")).toBeNull();
    expect(parseProductionEntry("https://*.empresa.com/ruta")).toBeNull();
    expect(parseProductionEntry("ftp://*.empresa.com")).toBeNull();
    expect(parseProductionEntry("")).toBeNull();
    expect(parseProductionEntry("x".repeat(300))).toBeNull();
  });
});

describe("matchProductionOrigin (clarificación: subdominios de cualquier nivel, no la raíz)", () => {
  const list = ["https://*.empresa.com", "http://localhost:8080"];

  it("devuelve la entrada que coincide", () => {
    expect(matchProductionOrigin("https://app.empresa.com", list)).toBe("https://*.empresa.com");
    expect(matchProductionOrigin("https://a.b.empresa.com", list)).toBe("https://*.empresa.com");
    expect(matchProductionOrigin("http://localhost:8080", list)).toBe("http://localhost:8080");
  });

  it("no coincide con el dominio raíz, otro esquema, otro puerto ni sufijos parciales", () => {
    expect(matchProductionOrigin("https://empresa.com", list)).toBeNull();
    expect(matchProductionOrigin("http://app.empresa.com", list)).toBeNull();
    expect(matchProductionOrigin("https://app.empresa.com:8443", list)).toBeNull();
    expect(matchProductionOrigin("https://appempresa.com", list)).toBeNull();
    expect(matchProductionOrigin("http://localhost:3000", list)).toBeNull();
  });

  it("lista vacía ⇒ null", () => {
    expect(matchProductionOrigin("https://app.empresa.com", [])).toBeNull();
  });
});
