import { describe, expect, it } from "vitest";
import { diffResponses } from "../src/diff/responses.ts";
import type { ComparableResponse } from "../src/schemas/diff.ts";

// 005 (FR-022a, FR-024, FR-026, FR-027, research R9, SC-002).

const json = (value: unknown, overrides: Partial<ComparableResponse> = {}): ComparableResponse => ({
  origin: { kind: "original" },
  status: 200,
  headers: [{ name: "Content-Type", value: "application/json" }],
  body: { kind: "text", text: JSON.stringify(value), contentType: "application/json" },
  ...overrides,
});
const text = (value: string, contentType: string | null = "text/plain"): ComparableResponse => ({
  origin: { kind: "original" },
  status: 200,
  headers: [],
  body: { kind: "text", text: value, contentType },
});

describe("diffResponses", () => {
  it("dos respuestas iguales ⇒ total 0 y body equal", () => {
    const a = json({ a: 1 });
    expect(diffResponses(a, a)).toEqual({
      status: null,
      headers: [],
      body: { mode: "equal" },
      ignored: { headers: [], body: [] },
      total: 0,
      notes: [],
    });
  });

  it("status y headers por nombre sin distinguir mayúsculas; repetidos como lista", () => {
    const before = json(1, {
      status: 200,
      headers: [
        { name: "Content-Type", value: "application/json" },
        { name: "X-Old", value: "1" },
        { name: "Vary", value: "a" },
        { name: "Vary", value: "b" },
      ],
    });
    const after = json(1, {
      status: 500,
      headers: [
        { name: "content-type", value: "application/json" },
        { name: "x-new", value: "2" },
        { name: "vary", value: "a" },
        { name: "vary", value: "c" },
      ],
    });
    const result = diffResponses(before, after);
    expect(result.status).toEqual({ before: 200, after: 500 });
    expect(result.headers).toEqual([
      { kind: "removed", name: "x-old", before: "1", sensitive: false },
      { kind: "changed", name: "vary", before: "a, b", after: "a, c", sensitive: false },
      { kind: "added", name: "x-new", after: "2", sensitive: false },
    ]);
    expect(result.total).toBe(4);
  });

  it("JSON válido en los dos ⇒ estructural", () => {
    const result = diffResponses(json({ a: 1, b: [1] }), json({ a: 2, b: [1] }));
    expect(result.body).toMatchObject({
      mode: "json",
      changes: [{ kind: "changed", path: [{ key: "a" }] }],
    });
    expect(result.total).toBe(1);
  });

  it("JSON inválido en uno ⇒ por líneas con aviso si el content-type decía JSON", () => {
    const bad = text("{no json", "application/json");
    const result = diffResponses(json({ a: 1 }), bad);
    expect(result.body.mode).toBe("lines");
    expect(result.notes).toContain("json_expected");
  });

  it("texto plano ⇒ por líneas sin aviso; el total cuenta las líneas cambiadas", () => {
    const result = diffResponses(text("uno\ndos\n"), text("uno\nDOS\ntres\n"));
    expect(result.body.mode).toBe("lines");
    expect(result.notes).toEqual([]);
    expect(result.total).toBe(3);
  });

  it("binario, > 5 MB o no disponible ⇒ solo metadatos y body_not_compared", () => {
    const binary: ComparableResponse = {
      origin: { kind: "original" },
      status: 200,
      headers: [],
      body: { kind: "unavailable", reason: "binary", size: 10 },
    };
    const result = diffResponses(binary, text("hola"));
    expect(result.body).toEqual({
      mode: "metadata",
      before: { size: 10, reason: "binary" },
      after: { size: 4, reason: "text" },
    });
    expect(result.notes).toContain("body_not_compared");
  });

  it("respuesta pegada: solo body (sin status ni headers)", () => {
    const pasted: ComparableResponse = {
      origin: { kind: "pasted" },
      status: null,
      headers: null,
      body: { kind: "text", text: '{"a":1}', contentType: null },
    };
    const result = diffResponses(pasted, json({ a: 2 }, { status: 500 }));
    expect(result.status).toBeNull();
    expect(result.headers).toEqual([]);
    expect(result.body.mode).toBe("json");
  });

  it("corte por límite ⇒ nota truncated", () => {
    const many = (sign: number) => Array.from({ length: 50_010 }, (_, i) => sign * (i + 1));
    expect(diffResponses(json(many(1)), json(many(-1))).notes).toContain("truncated");
  });
});
