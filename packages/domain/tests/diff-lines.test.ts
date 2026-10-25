import { describe, expect, it } from "vitest";
import { diffLines } from "../src/diff/lines.ts";
import { LIMITS } from "../src/schemas/limits.ts";

// 005 (FR-026, research R8): diff de texto por líneas (Myers).

const ops = (before: string, after: string) =>
  diffLines(before, after).hunks.flatMap((h) => h.lines.map((l) => `${l.op}${l.text}`));

describe("diffLines", () => {
  it("iguales ⇒ sin hunks", () => {
    expect(diffLines("a\nb\n", "a\nb\n")).toMatchObject({
      hunks: [],
      truncated: false,
      beforeLines: 2,
      afterLines: 2,
    });
    expect(diffLines("", "").hunks).toEqual([]);
  });

  it("solo añadidas, solo eliminadas y mezcla, con 3 líneas de contexto", () => {
    expect(ops("a\nb", "a\nb\nc")).toEqual([" a", " b", "+c"]);
    expect(ops("a\nb\nc", "a\nc")).toEqual([" a", "-b", " c"]);
    expect(ops("uno\ndos\ntres\n", "uno\nDOS\ntres\ncuatro\n")).toEqual([
      " uno",
      "-dos",
      "+DOS",
      " tres",
      "+cuatro",
    ]);
  });

  it("el resultado es mínimo y reconstruye ambos lados", () => {
    const before = "a\nb\nc\nd\ne\nf\ng";
    const after = "a\nx\nc\nd\ny\nf\ng\nh";
    const lines = diffLines(before, after).hunks.flatMap((h) => h.lines);
    expect(lines.filter((l) => l.op !== " ").length).toBe(5);
  });

  it("separa hunks lejanos y numera desde 1", () => {
    const before = Array.from({ length: 30 }, (_, i) => `l${i}`).join("\n");
    const after = before.replace("l2\n", "L2\n").replace("l25", "L25");
    const { hunks } = diffLines(before, after);
    expect(hunks).toHaveLength(2);
    expect(hunks[0]).toMatchObject({ beforeStart: 1, afterStart: 1 });
    expect(hunks[1]?.beforeStart).toBe(23);
  });

  it("normaliza \\r\\n", () => {
    expect(diffLines("a\r\nb\r\n", "a\nb\n").hunks).toEqual([]);
  });

  it(`más de ${LIMITS.diffLineEditsMax} líneas editadas ⇒ truncated con el recuento`, () => {
    const n = LIMITS.diffLineEditsMax + 10;
    const before = Array.from({ length: n }, (_, i) => `a${i}`).join("\n");
    const after = Array.from({ length: n }, (_, i) => `b${i}`).join("\n");
    expect(diffLines(before, after)).toMatchObject({
      hunks: [],
      truncated: true,
      beforeLines: n,
      afterLines: n,
    });
    // ~0,6 s sin instrumentar; la cobertura lo multiplica por 10.
  }, 30_000);

  it("textos grandes con pocos cambios en poco tiempo", () => {
    const before = Array.from({ length: 100_000 }, (_, i) => `line ${i}`).join("\n");
    const after = before.replace("line 50000\n", "changed\n");
    const start = performance.now();
    expect(ops(before, after).filter((l) => !l.startsWith(" "))).toEqual([
      "-line 50000",
      "+changed",
    ]);
    expect(performance.now() - start).toBeLessThan(1000);
  });
});
