import type { ButtonHTMLAttributes, ReactNode } from "react";

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onChange"> {
  pressed: boolean;
  onChange(pressed: boolean): void;
  children: ReactNode;
}

/** Botón de selección como los filtros de tipo de Network: `aria-pressed` (FR-005, FR-009). */
export function ToggleButton({ pressed, onChange, className = "", children, ...rest }: Props) {
  return (
    <button
      type="button"
      className={`toggle-button ${className}`}
      aria-pressed={pressed}
      onClick={() => onChange(!pressed)}
      {...rest}
    >
      {children}
    </button>
  );
}
