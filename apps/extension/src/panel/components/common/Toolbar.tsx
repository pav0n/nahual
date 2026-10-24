import type { HTMLAttributes, KeyboardEvent, ReactNode } from "react";

const FOCUSABLE = "button:not([disabled]), input:not([disabled]), select:not([disabled])";

/**
 * Barra de herramientas (patrón APG `toolbar`): las flechas izquierda y derecha mueven el foco
 * entre sus botones. Dentro de un campo de texto las flechas siguen moviendo el cursor.
 */
export function Toolbar({
  label,
  className = "",
  children,
  ...rest
}: { label: string; children: ReactNode } & HTMLAttributes<HTMLDivElement>) {
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    const target = event.target as HTMLElement;
    if (target.tagName === "INPUT" || target.tagName === "SELECT") return;
    const items = [...event.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE)];
    const index = items.indexOf(target);
    if (index < 0) return;
    const step = event.key === "ArrowRight" ? 1 : -1;
    const next = items[(index + step + items.length) % items.length];
    if (!next) return;
    event.preventDefault();
    next.focus();
  };
  return (
    <div
      role="toolbar"
      aria-label={label}
      className={`toolbar ${className}`}
      onKeyDown={onKeyDown}
      {...rest}
    >
      {children}
    </div>
  );
}
