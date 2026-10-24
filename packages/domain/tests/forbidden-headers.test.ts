import { describe, expect, it } from "vitest";
import { forbiddenHeaders, isForbiddenHeader } from "../src/repeater/forbidden-headers.ts";

describe("headers que el navegador no deja fijar (005, FR-008, research R6)", () => {
  it.each([
    "Cookie",
    "cookie2",
    "Host",
    "Origin",
    "Referer",
    "Content-Length",
    "Connection",
    "Keep-Alive",
    "Transfer-Encoding",
    "Accept-Encoding",
    "Access-Control-Request-Method",
    "Date",
    "DNT",
    "Expect",
    "Set-Cookie",
    "TE",
    "Trailer",
    "Upgrade",
    "Via",
    "Accept-Charset",
    "Proxy-Authorization",
    "Sec-Fetch-Mode",
  ])("%s es prohibido", (name) => expect(isForbiddenHeader(name)).toBe(true));

  it.each(["Authorization", "Content-Type", "Accept", "X-Custom", "User-Agent"])(
    "%s se puede fijar",
    (name) => expect(isForbiddenHeader(name)).toBe(false),
  );

  it("solo los activos y sin repetir, en ambos modos", () => {
    const headers = [
      { name: "Cookie", value: "a", enabled: true },
      { name: "cookie", value: "b", enabled: true },
      { name: "Host", value: "x", enabled: false },
      { name: "X-A", value: "1", enabled: true },
    ];
    expect(forbiddenHeaders(headers)).toEqual(["cookie"]);
  });
});
