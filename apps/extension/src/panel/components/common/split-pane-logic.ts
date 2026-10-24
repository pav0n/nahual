/**
 * Lógica pura del divisor (004, research R4): mínimos de cada lado, umbral de dos columnas y
 * teclado. `fraction` es siempre la del panel izquierdo (o de arriba, apilado).
 */
export const SPLIT_STEP_PX = 16;
export const MIN_START_PX = 280;
export const MIN_END_PX = 320;

export type SplitLayout = "columns" | "stacked";

export interface SplitState {
  fraction: number;
  defaultFraction: number;
  minStart?: number;
  minEnd?: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * Ajusta el reparto a los mínimos del ancho actual sin tocar la preferencia guardada. Si no caben
 * los dos mínimos, el detalle va debajo de la lista (FR-008).
 */
export function clampSplit(
  fraction: number,
  total: number,
  minStart = MIN_START_PX,
  minEnd = MIN_END_PX,
): { layout: SplitLayout; fraction: number } {
  if (total < minStart + minEnd) return { layout: "stacked", fraction: clamp(fraction, 0.2, 0.8) };
  return { layout: "columns", fraction: clamp(fraction, minStart / total, 1 - minEnd / total) };
}

/** Nuevo reparto tras una tecla (o doble clic) sobre el divisor; `null` si no se maneja. */
export function nextSplit(state: SplitState, key: string, size: number): number | null {
  const minStart = state.minStart ?? MIN_START_PX;
  const minEnd = state.minEnd ?? MIN_END_PX;
  const step = SPLIT_STEP_PX / size;
  let target: number;
  switch (key) {
    case "ArrowLeft":
    case "ArrowUp":
      target = state.fraction - step;
      break;
    case "ArrowRight":
    case "ArrowDown":
      target = state.fraction + step;
      break;
    case "Home":
      target = minStart / size;
      break;
    case "End":
      target = 1 - minEnd / size;
      break;
    case "dblclick":
      return state.defaultFraction;
    default:
      return null;
  }
  return clamp(target, minStart / size, 1 - minEnd / size);
}

/** `aria-valuenow/min/max` del separador, en porcentaje. */
export function splitAria(
  fraction: number,
  size: number,
  minStart = MIN_START_PX,
  minEnd = MIN_END_PX,
) {
  return {
    now: Math.round(fraction * 100),
    min: Math.round((minStart / size) * 100),
    max: Math.round((1 - minEnd / size) * 100),
  };
}
