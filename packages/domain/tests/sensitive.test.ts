import { describe, expect, it } from "vitest";
import {
  MASK,
  isSensitiveHeader,
  redactHeaders,
  redactUrlQuery,
  redactValue,
} from "../src/sensitive.ts";

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

describe("redacción compartida (007, research R3, FR-010)", () => {
  it("redactUrlQuery reemplaza solo parámetros sensibles, con el nombre decodificado", () => {
    const url = "https://a.test/x?token=abc&page=2&api%5Fkey=k&Session_Id=s#frag";
    expect(redactUrlQuery(url, () => MASK)).toBe(
      `https://a.test/x?token=${MASK}&page=2&api%5Fkey=${MASK}&Session_Id=${MASK}#frag`,
    );
    const names: string[] = [];
    redactUrlQuery(url, (name) => (names.push(name), "<x>"));
    expect(names).toEqual(["token", "api_key", "Session_Id"]);
  });

  it("redactValue redacta claves sensibles a cualquier profundidad y la query de las cadenas", () => {
    const value = {
      user: { name: "a", password: "p", tokens: ["t1"] },
      list: [{ api_key: "k" }],
      link: "/next?token=t&x=1",
      session: { id: 1 },
    };
    const { value: out, changed } = redactValue(value);
    expect(changed).toBe(true);
    expect(out).toEqual({
      user: { name: "a", password: MASK, tokens: MASK },
      list: [{ api_key: MASK }],
      link: `/next?token=${MASK}&x=1`,
      session: MASK,
    });
  });

  it("redactValue pasa la ruta de cada valor redactado al marcador", () => {
    const paths: string[] = [];
    redactValue({ a: { password: "p" }, b: [{ token: "t" }] }, (path) => {
      paths.push(path.join("."));
      return "<r>";
    });
    expect(paths).toEqual(["a.password", "b.0.token"]);
  });

  it("redactValue no cambia nada sin nombres sensibles", () => {
    const value = { a: 1, b: ["x", { c: null }] };
    expect(redactValue(value)).toEqual({ value, changed: false });
  });
});
