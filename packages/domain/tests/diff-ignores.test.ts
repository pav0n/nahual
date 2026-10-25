import { describe, expect, it } from "vitest";
import { applyIgnores } from "../src/diff/ignores.ts";
import { diffResponses } from "../src/diff/responses.ts";
import type { ComparableResponse } from "../src/schemas/diff.ts";

const json = (
  value: unknown,
  headers: { name: string; value: string }[] = [],
): ComparableResponse => ({
  origin: { kind: "original" },
  status: 200,
  headers,
  body: { kind: "text", text: JSON.stringify(value), contentType: "application/json" },
});

describe("applyIgnores (005, FR-028, research R10)", () => {
  const result = diffResponses(
    json(
      {
        meta: { timestamp: 1, trace: "a" },
        items: [
          { n: 1, at: 1 },
          { n: 2, at: 1 },
        ],
        keep: 1,
      },
      [{ name: "Date", value: "x" }],
    ),
    json(
      {
        meta: { timestamp: 2, trace: "b" },
        items: [
          { n: 1, at: 2 },
          { n: 2, at: 3 },
        ],
        keep: 2,
      },
      [{ name: "date", value: "y" }],
    ),
  );

  it("ruta exacta, prefijo (ignora los descendientes), [*] y headers sin distinguir mayúsculas", () => {
    const filtered = applyIgnores(result, {
      paths: [
        [{ key: "meta" }, { key: "timestamp" }],
        [{ key: "items" }, { any: true }, { key: "at" }],
      ],
      headers: ["DATE"],
    });
    const remaining = filtered.body.mode === "json" ? filtered.body.changes.map((c) => c.path) : [];
    expect(remaining).toEqual([[{ key: "meta" }, { key: "trace" }], [{ key: "keep" }]]);
    expect(filtered.ignored.body).toHaveLength(3);
    expect(filtered.ignored.headers.map((h) => h.name)).toEqual(["date"]);
    expect(filtered.headers).toEqual([]);
    expect(filtered.total).toBe(2);
  });

  it("ignorar un objeto entero ignora lo de dentro", () => {
    const filtered = applyIgnores(result, { paths: [[{ key: "meta" }]], headers: [] });
    expect(filtered.ignored.body).toHaveLength(2);
  });

  it("sin ignorados no cambia nada", () => {
    expect(applyIgnores(result, { paths: [], headers: [] })).toEqual(result);
  });
});
