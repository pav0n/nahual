import { describe, expect, it } from "vitest";
import { diffJson } from "../src/diff/json.ts";
import { LIMITS } from "../src/schemas/limits.ts";

// 005 (FR-025, FR-025a, research R7, SC-002): diff estructural de JSON.

const kinds = (before: unknown, after: unknown) =>
  diffJson(before, after).changes.map((c) => [c.kind, c.path, c.before, c.after]);

describe("diffJson: objetos y valores", () => {
  it("iguales ⇒ sin cambios; claves reordenadas no cuentan", () => {
    expect(diffJson({ a: 1, b: { c: [1, 2] } }, { b: { c: [1, 2] }, a: 1 }).changes).toEqual([]);
  });

  it("añadido, eliminado y cambiado con su ruta", () => {
    expect(
      kinds({ a: 1, gone: true, n: { x: 1 } }, { a: 2, n: { x: 1, y: "z" }, extra: [1] }),
    ).toEqual([
      ["changed", [{ key: "a" }], 1, 2],
      ["removed", [{ key: "gone" }], true, undefined],
      ["added", [{ key: "n" }, { key: "y" }], undefined, "z"],
      ["added", [{ key: "extra" }], undefined, [1]],
    ]);
  });

  it("anidación profunda", () => {
    const deep = (v: number) => ({ a: { b: { c: { d: { e: v } } } } });
    expect(kinds(deep(1), deep(2))).toEqual([
      ["changed", [{ key: "a" }, { key: "b" }, { key: "c" }, { key: "d" }, { key: "e" }], 1, 2],
    ]);
  });

  it.each([
    ["número ↔ texto", 1, "1"],
    ["objeto ↔ array", {}, []],
    ["null ↔ objeto", null, { a: 1 }],
    ["booleano ↔ número", true, 1],
    ["array ↔ texto", [1], "[1]"],
  ])("tipo cambiado (%s) ⇒ un solo changed", (_name, before, after) => {
    expect(kinds({ v: before }, { v: after })).toEqual([
      ["changed", [{ key: "v" }], before, after],
    ]);
  });

  it("raíz de tipo distinto ⇒ changed en $", () => {
    expect(kinds([1], { a: 1 })).toEqual([["changed", [], [1], { a: 1 }]]);
  });
});

describe("diffJson: arrays (FR-025a)", () => {
  it("por posición: elemento distinto, más largo y más corto", () => {
    expect(kinds([1, 2, 3], [1, 9, 3, 4])).toEqual([
      ["changed", [{ index: 1 }], 2, 9],
      ["added", [{ index: 3 }], undefined, 4],
    ]);
    expect(kinds([1, 2, 3], [1])).toEqual([
      ["removed", [{ index: 1 }], 2, undefined],
      ["removed", [{ index: 2 }], 3, undefined],
    ]);
    expect(diffJson([1, 2], [2, 1]).arrays).toEqual([{ path: [], criterion: "index" }]);
  });

  it("solo informa los arrays con algún cambio dentro, como mucho 50", () => {
    const rows = (v: number) =>
      Array.from({ length: 200 }, (_, i) => ({ id: i, tags: ["a", "b"], value: i === 5 ? v : i }));
    expect(diffJson({ rows: rows(1) }, { rows: rows(2) }).arrays).toEqual([
      { path: [{ key: "rows" }], criterion: "id" },
    ]);
    const many = (v: number) => Array.from({ length: 80 }, () => [v]);
    expect(diffJson(many(1), many(2)).arrays).toHaveLength(50);
  });

  it("por id: reordenar no cuenta; nuevo = añadido; falta = eliminado; cambio con [id=…]", () => {
    const before = {
      items: [
        { id: 1, n: "a" },
        { id: 2, n: "b" },
        { id: 4, n: "d" },
      ],
    };
    const after = {
      items: [
        { id: 2, n: "B" },
        { id: 1, n: "a" },
        { id: 3, n: "c" },
      ],
    };
    const result = diffJson(before, after);
    expect(result.changes.map((c) => [c.kind, c.path])).toEqual([
      ["changed", [{ key: "items" }, { idField: "id", id: 2 }, { key: "n" }]],
      ["added", [{ key: "items" }, { idField: "id", id: 3 }]],
      ["removed", [{ key: "items" }, { idField: "id", id: 4 }]],
    ]);
    expect(result.arrays).toEqual([{ path: [{ key: "items" }], criterion: "id" }]);
  });

  it.each(["_id", "uuid", "key"] as const)("usa %s si todos lo tienen y no hay id", (field) => {
    const result = diffJson(
      [{ [field]: "x", n: 1 }, { [field]: "y" }],
      [{ [field]: "y" }, { [field]: "x", n: 2 }],
    );
    expect(result.changes.map((c) => c.path)).toEqual([
      [{ idField: field, id: "x" }, { key: "n" }],
    ]);
    expect(result.arrays[0]?.criterion).toBe(field);
  });

  it("el primero de la lista que tengan todos: id antes que key", () => {
    const result = diffJson([{ id: 1, key: "a" }], [{ id: 1, key: "b" }]);
    expect(result.arrays[0]?.criterion).toBe("id");
    expect(result.changes[0]?.path).toEqual([{ idField: "id", id: 1 }, { key: "key" }]);
  });

  it.each([
    ["falta en un elemento", [{ id: 1 }, { n: 2 }], [{ id: 1 }]],
    ["id repetido", [{ id: 1 }, { id: 1 }], [{ id: 1 }]],
    ["id que no es texto ni número", [{ id: { x: 1 } }], [{ id: { x: 1 } }, { id: { x: 2 } }]],
    ["elementos que no son objetos", [1, 2], [2, 1]],
  ])("sin identificador válido (%s) ⇒ por posición", (_name, before, after) => {
    expect(diffJson(before, after).arrays[0]?.criterion).toBe("index");
  });

  it("intercambiar lados invierte añadidos y eliminados", () => {
    const a = { x: 1, list: [1, 2] };
    const b = { y: 2, list: [1] };
    const flip = (k: string) => (k === "added" ? "removed" : k === "removed" ? "added" : k);
    expect(
      diffJson(b, a)
        .changes.map((c) => c.kind)
        .sort(),
    ).toEqual(
      diffJson(a, b)
        .changes.map((c) => flip(c.kind))
        .sort(),
    );
  });
});

describe("diffJson: límites", () => {
  it(`corta en ${LIMITS.diffChangesMax} cambios con truncated`, () => {
    const n = LIMITS.diffChangesMax + 10;
    const result = diffJson(
      Array.from({ length: n }, (_, i) => i),
      Array.from({ length: n }, (_, i) => -i - 1),
    );
    expect(result.changes).toHaveLength(LIMITS.diffChangesMax);
    expect(result.truncated).toBe(true);
  });

  it("anidación de más de 200 niveles no desborda la pila", () => {
    let a: unknown = 1;
    let b: unknown = 2;
    for (let i = 0; i < 5000; i++) {
      a = [a];
      b = [b];
    }
    const result = diffJson(a, b);
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0]?.kind).toBe("changed");
  });
});
