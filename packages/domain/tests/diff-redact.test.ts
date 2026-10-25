import { describe, expect, it } from "vitest";
import { redactDiff, redactLogText } from "../src/diff/redact.ts";
import { diffResponses } from "../src/diff/responses.ts";
import type { ComparableResponse } from "../src/schemas/diff.ts";
import { MASK, isSensitiveName } from "../src/sensitive.ts";

// 005 (FR-030, research R11, SC-006): ningún valor secreto en el resultado redactado.

const SECRETS = [
  "secret-cookie-a",
  "secret-cookie-b",
  "secret-token-a",
  "secret-token-b",
  "secret-loc-a",
  "secret-loc-b",
  "hunter2",
  "hunter3",
  "Bearer abc",
  "Bearer xyz",
  "sess-1",
  "sess-2",
];

const response = (
  n: "a" | "b",
  body: string,
  contentType = "application/json",
): ComparableResponse => ({
  origin: { kind: "original" },
  status: 200,
  headers: [
    { name: "Set-Cookie", value: `sid=secret-cookie-${n}; Path=/` },
    { name: "Location", value: `/next?token=secret-loc-${n}&x=1` },
    { name: "Authorization", value: n === "a" ? "Bearer abc" : "Bearer xyz" },
  ],
  body: { kind: "text", text: body, contentType },
});

describe("isSensitiveName", () => {
  it.each([
    "password",
    "Password",
    "access_token",
    "sessionId",
    "apiKey",
    "x-api-key",
    "client_secret",
  ])("%s es sensible", (name) => expect(isSensitiveName(name)).toBe(true));
  it.each(["name", "items", "keep", "id"])("%s no", (name) =>
    expect(isSensitiveName(name)).toBe(false),
  );
});

describe("redactDiff", () => {
  it("JSON: headers, campos sensibles a cualquier profundidad y query de URLs", () => {
    const before = JSON.stringify({
      access_token: "secret-token-a",
      user: { password: "hunter2", name: "a" },
      added: null,
      session: { id: "sess-1" },
    });
    const after = JSON.stringify({
      access_token: "secret-token-b",
      user: { password: "hunter3", name: "b" },
      added: { nested: { password: "hunter3" } },
      session: { id: "sess-2" },
    });
    const { result, revealed: secrets } = redactDiff(
      diffResponses(response("a", before), response("b", after)),
    );
    const text = JSON.stringify(result);
    for (const secret of SECRETS) expect(text).not.toContain(secret);
    expect(text).toContain(MASK);
    // Sigue indicando que cambiaron.
    expect(result.headers.map((h) => [h.name, h.kind, h.sensitive])).toEqual([
      ["set-cookie", "changed", true],
      ["location", "changed", true],
      ["authorization", "changed", true],
    ]);
    if (result.body.mode !== "json") throw new Error("json");
    expect(result.body.changes.find((c) => c.path.at(-1)?.["key" as never] === "name")?.after).toBe(
      "b",
    );
    expect(result.body.changes.filter((c) => c.sensitive).length).toBeGreaterThanOrEqual(3);
    // Los valores reales se devuelven aparte.
    expect(JSON.stringify(secrets)).toContain("secret-token-b");
  });

  it("por líneas: pares clave-valor, query y headers sensibles dentro de cada línea", () => {
    const before =
      'token: x\n{"password": "hunter2", "a": 1}\nGET /x?api_key=secret-token-a&q=1\nAuthorization: Bearer abc\n';
    const after =
      'token: y\n{"password": "hunter3", "a": 2}\nGET /x?api_key=secret-token-b&q=2\nAuthorization: Bearer xyz\n';
    const { result } = redactDiff(
      diffResponses(response("a", before, "text/plain"), response("b", after, "text/plain")),
    );
    const text = JSON.stringify(result);
    for (const secret of SECRETS) expect(text).not.toContain(secret);
    if (result.body.mode !== "lines") throw new Error("lines");
    const lines = result.body.hunks.flatMap((h) => h.lines);
    expect(lines.filter((l) => l.sensitive).length).toBeGreaterThan(0);
    expect(lines.some((l) => l.text.includes('"a": 2'))).toBe(true);
  });
});

describe("redactLogText (006, FR-030)", () => {
  it("redacta pares JSON, query y líneas de header con nombre sensible", () => {
    expect(redactLogText('{"access_token":"abc","n":1}')).toBe('{"access_token":"••••••","n":1}');
    expect(redactLogText("GET https://a.test/x?token=s3cr3t&page=2")).toBe(
      "GET https://a.test/x?token=••••••&page=2",
    );
    expect(redactLogText('{"authorization":"Bearer x","accept":"*/*"}')).toBe(
      '{"authorization":"••••••","accept":"*/*"}',
    );
    expect(redactLogText("hola\nAuthorization: Bearer x")).toBe("hola\nAuthorization: ••••••");
  });

  it("deja igual un texto sin nombres sensibles", () => {
    expect(redactLogText("items 3")).toBe("items 3");
  });
});
