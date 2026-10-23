import { describe, expect, it } from "vitest";
import { MASK, isSensitiveHeader, redactHeaders } from "../src/sensitive.ts";

describe("headers sensibles (FR-004a, FR-036)", () => {
  it("reconoce la lista fija sin distinguir mayúsculas", () => {
    for (const name of ["Authorization", "proxy-authorization", "COOKIE", "Set-Cookie"]) {
      expect(isSensitiveHeader(name)).toBe(true);
    }
  });

  it("reconoce nombres que contienen token, secret, session, api-key o apikey", () => {
    for (const name of ["X-Auth-Token", "x-client-secret", "X-Session-Id", "X-API-Key", "apikey"]) {
      expect(isSensitiveHeader(name)).toBe(true);
    }
  });

  it("no marca headers comunes", () => {
    for (const name of ["content-type", "accept", "x-request-id", "cache-control"]) {
      expect(isSensitiveHeader(name)).toBe(false);
    }
  });

  it("redactHeaders reemplaza solo los sensibles, en lista o en objeto", () => {
    expect(
      redactHeaders([
        { name: "Cookie", value: "a=1" },
        { name: "accept", value: "*/*" },
      ]),
    ).toEqual([
      { name: "Cookie", value: MASK },
      { name: "accept", value: "*/*" },
    ]);
    expect(redactHeaders({ Authorization: "Bearer x", accept: "*/*" })).toEqual({
      Authorization: MASK,
      accept: "*/*",
    });
  });
});
