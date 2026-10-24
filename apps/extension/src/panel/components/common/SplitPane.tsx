import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { DEFAULT_UI_PREFS, uiPrefs, type SplitKey } from "../../ui-prefs.ts";
import { MIN_END_PX, MIN_START_PX, clampSplit, nextSplit } from "./split-pane-logic.ts";

interface Props {
  /** Clave de la vista en `UiPrefs.split` (Tráfico, Reglas, Pausados). */
  prefKey: SplitKey;
  /** Nombre accesible del divisor. */
  label: string;
  start: ReactNode;
  /** Sin contenido (detalle cerrado), el panel izquierdo ocupa todo. */
  end: ReactNode | null;
  minStart?: number;
  minEnd?: number;
  className?: string;
}

/** Alto mínimo de cada parte cuando el detalle va debajo (FR-008). */
const MIN_STACKED_PX = 120;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * Dos paneles con divisor accesible (004, research R4, FR-006/008): `role="separator"` con su valor
 * en %, arrastre con puntero, flechas ±16 px, Inicio/Fin a los mínimos y doble clic al reparto por
 * defecto. Bajo 600 px el detalle va debajo con el mismo divisor en vertical. El reparto se guarda
 * en `UiPrefs` sin datos de tráfico (FR-034).
 */
export function SplitPane({
  prefKey,
  label,
  start,
  end,
  minStart = MIN_START_PX,
  minEnd = MIN_END_PX,
  className = "",
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [fraction, setFraction] = useState(() => uiPrefs().get().split[prefKey]);
  const dragging = useRef(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const stacked = clampSplit(fraction, size.width, minStart, minEnd).layout === "stacked";
  const total = stacked ? size.height : size.width;
  const minA = stacked ? MIN_STACKED_PX : minStart;
  const minB = stacked ? MIN_STACKED_PX : minEnd;
  // Dentro del rango de `UiPrefs` (0.2–0.8) y de los mínimos en px del tamaño actual.
  const low = total > 0 ? Math.max(0.2, Math.min(minA / total, 0.5)) : 0.2;
  const high = total > 0 ? Math.min(0.8, Math.max(1 - minB / total, 0.5)) : 0.8;
  const shown = clamp(fraction, low, high);

  const save = (next: number) => {
    const value = clamp(next, low, high);
    setFraction(value);
    uiPrefs().update({ split: { ...uiPrefs().get().split, [prefKey]: value } });
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const next = nextSplit(
      {
        fraction: shown,
        defaultFraction: DEFAULT_UI_PREFS.split[prefKey],
        minStart: minA,
        minEnd: minB,
      },
      event.key,
      total,
    );
    if (next === null) return;
    event.preventDefault();
    save(next);
  };

  const fromPointer = (event: PointerEvent) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    save(
      stacked ? (event.clientY - rect.top) / rect.height : (event.clientX - rect.left) / rect.width,
    );
  };

  const layout = stacked ? "stacked" : "columns";
  const percent = `${(shown * 100).toFixed(2)}%`;

  return (
    <div ref={ref} className={`split ${className}`} data-layout={end ? layout : "single"}>
      <div className="split-start" style={end ? { flexBasis: percent } : undefined}>
        {start}
      </div>
      {end ? (
        <>
          <div
            role="separator"
            tabIndex={0}
            aria-label={label}
            aria-orientation={stacked ? "horizontal" : "vertical"}
            aria-valuenow={Math.round(shown * 100)}
            aria-valuemin={Math.round(low * 100)}
            aria-valuemax={Math.round(high * 100)}
            className="split-handle"
            onKeyDown={onKeyDown}
            onDoubleClick={() => save(DEFAULT_UI_PREFS.split[prefKey])}
            onPointerDown={(event) => {
              dragging.current = true;
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              if (dragging.current) fromPointer(event);
            }}
            onPointerUp={(event) => {
              dragging.current = false;
              event.currentTarget.releasePointerCapture(event.pointerId);
            }}
          />
          <div className="split-end">{end}</div>
        </>
      ) : null}
    </div>
  );
}
