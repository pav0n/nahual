import { describe, expect, it } from "vitest";
import { isPreflight, mockHeadersFor } from "../src/mock.ts";

const base = [{ name: "content-type", value: "application/json" }];

describe("mock local y CORS (research R21)", () => {
  it("request de otro origen sin CORS en el mock ⇒ ACAO con el origen exacto de la página", () => {
    expect(
      mockHeadersFor(base, {
        pageOrigin: "http://localhost:3000",
        requestUrl: "https://api.test/x",
      }),
    ).toEqual([
      ...base,
      { name: "access-control-allow-origin", value: "http://localhost:3000" },
      { name: "access-control-allow-credentials", value: "true" },
    ]);
  });

  it("nunca usa *", () => {
    const headers = mockHeadersFor([], {
      pageOrigin: "http://a.test",
      requestUrl: "https://b.test/",
    });
    expect(headers.some((h) => h.value === "*")).toBe(false);
  });

  it("mismo origen ⇒ sin cambios", () => {
    expect(
      mockHeadersFor(base, { pageOrigin: "https://api.test", requestUrl: "https://api.test/x" }),
    ).toEqual(base);
  });

  it("si el mock ya define Access-Control-Allow-Origin, se respeta", () => {
    const own = [...base, { name: "Access-Control-Allow-Origin", value: "https://otro.test" }];
    expect(
      mockHeadersFor(own, {
        pageOrigin: "http://localhost:3000",
        requestUrl: "https://api.test/x",
      }),
    ).toEqual(own);
  });

  it("sin sitio (origen opaco) o URL inválida ⇒ sin cambios", () => {
    expect(mockHeadersFor(base, { pageOrigin: null, requestUrl: "https://api.test/x" })).toEqual(
      base,
    );
    expect(mockHeadersFor(base, { pageOrigin: "http://a.test", requestUrl: "no es url" })).toEqual(
      base,
    );
  });

  it("isPreflight: OPTIONS con Access-Control-Request-Method", () => {
    expect(isPreflight("OPTIONS", [{ name: "Access-Control-Request-Method", value: "PUT" }])).toBe(
      true,
    );
    expect(isPreflight("OPTIONS", [])).toBe(false);
    expect(isPreflight("GET", [{ name: "access-control-request-method", value: "PUT" }])).toBe(
      false,
    );
  });
});
