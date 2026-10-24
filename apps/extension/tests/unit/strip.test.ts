import { describe, expect, it } from "vitest";
import { stripItems, type StripInput } from "../../src/panel/shell/strip.ts";

const empty: StripInput = { globalPaused: false, relaxationCount: 0, notices: [], lastError: null };
const notice = (id: number) => ({ id, messageKey: `notice_${id}` });
const error = { messageKey: "error_command", issues: [] };

describe("franja de indicadores (004, FR-013/013a, research R9)", () => {
  it("sin nada, vacía (0 px)", () => {
    expect(stripItems(empty)).toEqual([]);
  });

  it("orden fijo: Nahual en pausa, CORS relajado, avisos, error del último comando", () => {
    const items = stripItems({
      globalPaused: true,
      relaxationCount: 2,
      notices: [notice(1)],
      lastError: error,
    });
    expect(items.map((item) => item.kind)).toEqual(["paused", "relaxed", "notice", "error"]);
  });

  it("con 2 avisos, una línea cada uno", () => {
    const items = stripItems({ ...empty, notices: [notice(1), notice(2)] });
    expect(items).toEqual([
      { kind: "notice", notice: notice(1) },
      { kind: "notice", notice: notice(2) },
    ]);
  });

  it("con más de 2 avisos (error incluido) se agrupan en una línea con la cuenta", () => {
    const items = stripItems({
      ...empty,
      relaxationCount: 1,
      notices: [notice(1), notice(2)],
      lastError: error,
    });
    expect(items[0]).toEqual({ kind: "relaxed" });
    expect(items[1]).toMatchObject({ kind: "group", count: 3 });
    expect(items).toHaveLength(2);
    const group = items[1];
    if (group?.kind !== "group") throw new Error("se esperaba un grupo");
    expect(group.items.map((item) => item.kind)).toEqual(["notice", "notice", "error"]);
  });
});
