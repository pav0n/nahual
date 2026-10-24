/** Lógica pura de los menús (004, research R5): teclado del patrón APG y posición en el panel. */
export interface MenuItemLike {
  label: string;
  disabled?: boolean;
}

/**
 * Item que recibe el foco tras una tecla: flechas con vuelta, Inicio/Fin y letra inicial, siempre
 * saltando los deshabilitados. `null` si la tecla no es del menú.
 */
export function nextMenuIndex(
  items: readonly MenuItemLike[],
  current: number,
  key: string,
): number | null {
  const enabled = items.flatMap((item, index) => (item.disabled ? [] : [index]));
  if (enabled.length === 0) return null;
  const first = enabled[0] ?? 0;
  const last = enabled.at(-1) ?? 0;
  switch (key) {
    case "ArrowDown":
      return enabled.find((i) => i > current) ?? first;
    case "ArrowUp":
      return [...enabled].reverse().find((i) => i < current) ?? (current < 0 ? first : last);
    case "Home":
      return first;
    case "End":
      return last;
  }
  if (key.length !== 1 || !/\S/.test(key)) return null;
  const letter = key.toLocaleLowerCase();
  const starts = (i: number) => items[i]?.label.toLocaleLowerCase().startsWith(letter) ?? false;
  const after = enabled.filter((i) => i > current);
  const before = enabled.filter((i) => i <= current);
  return [...after, ...before].find(starts) ?? current;
}

export interface Anchor {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/**
 * Posición del menú: en el punto del clic (o bajo la fila, con teclado); si no cabe, hacia la
 * izquierda o encima, y siempre entero dentro del panel (FR-021).
 */
export function placeMenu(
  anchor: Anchor,
  size: { width: number; height: number },
  viewport: { width: number; height: number },
): { left: number; top: number } {
  let left = anchor.left;
  if (left + size.width > viewport.width) left = anchor.right - size.width;
  let top = anchor.bottom;
  if (top + size.height > viewport.height) top = anchor.top - size.height;
  return {
    left: Math.max(0, Math.min(left, viewport.width - size.width)),
    top: Math.max(0, Math.min(top, viewport.height - size.height)),
  };
}
