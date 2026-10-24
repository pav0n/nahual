import { describe, expect, it } from "vitest";
import { nextMenuIndex, placeMenu } from "../../src/panel/components/common/menu-logic.ts";

const items = [
  { label: "Create rule from this request" },
  { label: "Allow CORS for development" },
  { label: "Copy URL", disabled: true },
  { label: "Close" },
];

describe("menú: teclado (004, research R5, FR-021)", () => {
  it("flechas con vuelta, saltando deshabilitados", () => {
    expect(nextMenuIndex(items, 0, "ArrowDown")).toBe(1);
    expect(nextMenuIndex(items, 1, "ArrowDown")).toBe(3);
    expect(nextMenuIndex(items, 3, "ArrowDown")).toBe(0);
    expect(nextMenuIndex(items, 0, "ArrowUp")).toBe(3);
    expect(nextMenuIndex(items, 3, "ArrowUp")).toBe(1);
  });

  it("Home y End al primero y último habilitados", () => {
    expect(nextMenuIndex(items, 1, "Home")).toBe(0);
    expect(nextMenuIndex([{ label: "a", disabled: true }, ...items], 3, "Home")).toBe(1);
    expect(nextMenuIndex(items, 0, "End")).toBe(3);
    expect(nextMenuIndex([...items, { label: "z", disabled: true }], 0, "End")).toBe(3);
  });

  it("letra inicial: siguiente con esa letra, con vuelta y sin distinguir mayúsculas", () => {
    expect(nextMenuIndex(items, 0, "a")).toBe(1);
    expect(nextMenuIndex(items, 0, "C")).toBe(3);
    expect(nextMenuIndex(items, 3, "c")).toBe(0);
    expect(nextMenuIndex(items, 0, "x")).toBe(0);
  });

  it("sin el foco en ningún item, la flecha abajo va al primero", () => {
    expect(nextMenuIndex(items, -1, "ArrowDown")).toBe(0);
  });

  it("otras teclas no se manejan", () => {
    expect(nextMenuIndex(items, 0, "Enter")).toBeNull();
    expect(nextMenuIndex(items, 0, "Tab")).toBeNull();
  });
});

describe("menú: posición dentro del panel", () => {
  const viewport = { width: 320, height: 600 };
  const size = { width: 200, height: 120 };
  const point = (x: number, y: number) => ({ left: x, right: x, top: y, bottom: y });
  const inside = (pos: { left: number; top: number }) => {
    expect(pos.left).toBeGreaterThanOrEqual(0);
    expect(pos.top).toBeGreaterThanOrEqual(0);
    expect(pos.left + size.width).toBeLessThanOrEqual(viewport.width);
    expect(pos.top + size.height).toBeLessThanOrEqual(viewport.height);
  };

  it("en el punto del clic si cabe", () => {
    expect(placeMenu(point(10, 20), size, viewport)).toEqual({ left: 10, top: 20 });
  });

  it.each([
    ["arriba a la izquierda", 0, 0],
    ["arriba a la derecha", 319, 0],
    ["abajo a la izquierda", 0, 599],
    ["abajo a la derecha", 319, 599],
  ])("queda entero dentro del panel %s", (_name, x, y) => {
    inside(placeMenu(point(x, y), size, viewport));
  });

  it("bajo una fila (teclado) y encima si no cabe debajo", () => {
    const row = { left: 0, right: 320, top: 100, bottom: 121 };
    expect(placeMenu(row, size, viewport).top).toBe(121);
    const last = { left: 0, right: 320, top: 560, bottom: 581 };
    expect(placeMenu(last, size, viewport).top).toBe(440);
  });

  it("un menú más grande que el panel se pega al margen", () => {
    const pos = placeMenu(point(100, 100), { width: 400, height: 700 }, viewport);
    expect(pos).toEqual({ left: 0, top: 0 });
  });
});
