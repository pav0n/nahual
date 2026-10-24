import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Icon, type IconName } from "./icons.tsx";

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  icon: IconName;
  /** Nombre accesible y texto de la indicación emergente (FR-005). */
  label: string;
  /** Atajo que se muestra en la indicación, p. ej. "Alt+Shift+P". */
  shortcut?: string;
}

/** Botón de icono como los de las barras de DevTools: siempre con nombre accesible y `title`. */
export const IconButton = forwardRef<HTMLButtonElement, Props>(function IconButton(
  { icon, label, shortcut, className = "", type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={`icon-button ${className}`}
      aria-label={label}
      title={shortcut ? `${label} (${shortcut})` : label}
      {...rest}
    >
      <Icon name={icon} />
    </button>
  );
});
