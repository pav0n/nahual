import { describe, expect, it } from "vitest";
import {
  SPLIT_STEP_PX,
  clampSplit,
  nextSplit,
  splitAria,
} from "../../src/panel/components/common/split-pane-logic.ts";

const state = { fraction: 0.5, defaultFraction: 0.5 };

describe("divisor (004, research R4, FR-006/008)", () => {
  it("con dos columnas respeta los mínimos de lista (280) y detalle (320)", () => {
    expect(clampSplit(0.5, 1000)).toEqual({ layout: "columns", fraction: 0.5 });
    expect(clampSplit(0.1, 1000)).toEqual({ layout: "columns", fraction: 0.28 });
    expect(clampSplit(0.9, 1000).layout).toBe("columns");
    expect(clampSplit(0.9, 1000).fraction).toBeCloseTo(0.68);
    expect(clampSplit(0.5, 600)).toEqual({ layout: "columns", fraction: 280 / 600 });
  });

  it("bajo 600 px apila el detalle debajo de la lista", () => {
    expect(clampSplit(0.5, 599).layout).toBe("stacked");
    expect(clampSplit(0.5, 320).layout).toBe("stacked");
  });

  it("los mínimos son configurables", () => {
    expect(clampSplit(0.1, 1000, 200, 400)).toEqual({ layout: "columns", fraction: 0.2 });
    expect(clampSplit(0.5, 500, 200, 200)).toEqual({ layout: "columns", fraction: 0.5 });
  });

  it("flechas mueven 16 px", () => {
    expect(SPLIT_STEP_PX).toBe(16);
    expect(nextSplit(state, "ArrowRight", 1000)).toBeCloseTo(0.516);
    expect(nextSplit(state, "ArrowDown", 1000)).toBeCloseTo(0.516);
    expect(nextSplit(state, "ArrowLeft", 1000)).toBeCloseTo(0.484);
    expect(nextSplit(state, "ArrowUp", 1000)).toBeCloseTo(0.484);
  });

  it("Home y End van a los mínimos; doble clic restablece", () => {
    expect(nextSplit(state, "Home", 1000)).toBeCloseTo(0.28);
    expect(nextSplit(state, "End", 1000)).toBeCloseTo(0.68);
    expect(nextSplit({ fraction: 0.3, defaultFraction: 0.5 }, "dblclick", 1000)).toBe(0.5);
  });

  it("las flechas no pasan de los mínimos", () => {
    expect(nextSplit({ fraction: 0.68, defaultFraction: 0.5 }, "ArrowRight", 1000)).toBeCloseTo(
      0.68,
    );
    expect(nextSplit({ fraction: 0.28, defaultFraction: 0.5 }, "ArrowLeft", 1000)).toBeCloseTo(
      0.28,
    );
  });

  it("otras teclas no se manejan", () => {
    expect(nextSplit(state, "Enter", 1000)).toBeNull();
    expect(nextSplit(state, "a", 1000)).toBeNull();
  });

  it("valores ARIA en porcentaje", () => {
    expect(splitAria(0.5, 1000)).toEqual({ now: 50, min: 28, max: 68 });
  });
});
