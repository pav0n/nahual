import { describe, expect, it } from "vitest";
import { requestedHeaders } from "../../src/cors/request-headers.ts";

const h = (name: string, value = "1") => ({ name, value });

describe("requestedHeaders: headers que la app pidió y el servidor debe permitir", () => {
  it("nombres en minúsculas, sin duplicados y ordenados", () => {
    expect(requestedHeaders([h("X-B"), h("x-a"), h("X-A")])).toEqual(["x-a", "x-b"]);
  });

  it("omite los safelisted (accept, accept-language, content-language, content-type simple)", () => {
    expect(
      requestedHeaders([
        h("Accept", "*/*"),
        h("Accept-Language", "es"),
        h("Content-Language", "es"),
        h("Content-Type", "text/plain;charset=UTF-8"),
        h("Content-Type", "application/x-www-form-urlencoded"),
        h("Content-Type", "multipart/form-data; boundary=x"),
      ]),
    ).toEqual([]);
    expect(requestedHeaders([h("Content-Type", "application/json")])).toEqual(["content-type"]);
  });

  it("omite los que pone el navegador", () => {
    expect(
      requestedHeaders([
        h("Origin"),
        h("Cookie"),
        h("Referer"),
        h("User-Agent"),
        h("Host"),
        h("Connection"),
        h("Content-Length"),
        h("Accept-Encoding"),
        h("Sec-Fetch-Mode"),
        h("sec-ch-ua"),
        h("Priority"),
        h("Access-Control-Request-Method"),
        h("Authorization"),
      ]),
    ).toEqual(["authorization"]);
  });

  it("como mucho 50 y solo tokens válidos", () => {
    const many = Array.from({ length: 60 }, (_, i) => h(`x-h${String(i).padStart(2, "0")}`));
    expect(requestedHeaders(many)).toHaveLength(50);
    expect(requestedHeaders([h("bad header"), h("x-ok")])).toEqual(["x-ok"]);
  });
});
