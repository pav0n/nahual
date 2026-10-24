import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { nextMenuIndex, placeMenu, type Anchor } from "./menu-logic.ts";

export interface MenuItem {
  id: string;
  label: string;
  /** Atajo que se muestra junto al texto (FR-012: Soltar con `Alt+Shift+A`). */
  shortcut?: string;
  disabled?: boolean;
  onSelect(): void;
}

export type MenuCloseReason = "escape" | "select" | "outside" | "tab";

interface Props {
  open: boolean;
  /** Punto del clic o rectángulo del disparador, en coordenadas de la ventana. */
  anchor: Anchor | null;
  label: string;
  items: MenuItem[];
  onClose(reason: MenuCloseReason): void;
  /** Elemento que recupera el foco al cerrar con Escape o al elegir (el disparador o la fila). */
  returnFocus?: HTMLElement | null;
  /** Información que no es un item (estado y causa de la sesión), encima de los items. */
  info?: ReactNode;
  id?: string;
}

/** Ancla en el rectángulo de un elemento: el menú se abre debajo (o encima si no cabe). */
export const anchorOf = (element: Element): Anchor => {
  const r = element.getBoundingClientRect();
  return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
};

/**
 * Menú según el patrón APG (004, research R5): `role="menu"` con `menuitem`, flechas con vuelta,
 * Inicio/Fin, letra inicial, Enter o Espacio eligen, Escape o Tab cierran y el foco vuelve al
 * disparador. Se dibuja en `body` para que ninguna fila virtualizada (con `transform`) lo recorte, y
 * se coloca entero dentro del panel.
 */
export function Menu({ open, anchor, label, items, onClose, returnFocus, info, id }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  });

  useLayoutEffect(() => {
    if (!open || !anchor || !ref.current) {
      setPosition(null);
      return;
    }
    const { width, height } = ref.current.getBoundingClientRect();
    setPosition(
      placeMenu(
        anchor,
        { width, height },
        { width: window.innerWidth, height: window.innerHeight },
      ),
    );
  }, [open, anchor, items.length]);

  useEffect(() => {
    if (!open) return;
    const first = nextMenuIndex(itemsRef.current, -1, "ArrowDown");
    // Se enfoca tras colocarlo, para que el desplazamiento no salte.
    const frame = requestAnimationFrame(() => itemRefs.current[first ?? 0]?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose("outside");
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [open, onClose]);

  if (!open) return null;

  const close = (reason: MenuCloseReason) => {
    onClose(reason);
    if (reason !== "outside" && reason !== "tab") returnFocus?.focus();
  };

  const activeIndex = () => itemRefs.current.findIndex((el) => el === document.activeElement);

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      // Que Escape no llegue a DevTools, que abriría el cajón de la consola (research D2).
      event.preventDefault();
      event.stopPropagation();
      close("escape");
      return;
    }
    if (event.key === "Tab") {
      close("tab");
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      const item = items[activeIndex()];
      if (item && !item.disabled) {
        event.preventDefault();
        close("select");
        item.onSelect();
      }
      return;
    }
    const next = nextMenuIndex(items, activeIndex(), event.key);
    if (next === null) return;
    event.preventDefault();
    itemRefs.current[next]?.focus();
  };

  return createPortal(
    <div
      ref={ref}
      className="menu-popover"
      style={{
        left: position?.left ?? 0,
        top: position?.top ?? 0,
        visibility: position ? "visible" : "hidden",
      }}
      onKeyDown={onKeyDown}
    >
      {info ? <div className="menu-info">{info}</div> : null}
      <div role="menu" aria-label={label} id={id} className="menu">
        {items.map((item, index) => (
          <button
            key={item.id}
            ref={(el) => {
              itemRefs.current[index] = el;
            }}
            type="button"
            role="menuitem"
            tabIndex={-1}
            disabled={item.disabled}
            className="menu-item"
            onMouseEnter={(event) => !item.disabled && event.currentTarget.focus()}
            onClick={() => {
              close("select");
              item.onSelect();
            }}
          >
            <span className="grow">{item.label}</span>
            {item.shortcut ? <kbd>{item.shortcut}</kbd> : null}
          </button>
        ))}
      </div>
    </div>,
    document.body,
  );
}
