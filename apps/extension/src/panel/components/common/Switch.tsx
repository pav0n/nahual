import { useId } from "react";

interface Props {
  label: string;
  checked: boolean;
  disabled?: boolean;
  keyshortcuts?: string;
  onChange(checked: boolean): void;
}

/** Interruptor nativo y accesible: un checkbox con `role="switch"` (research R15). */
export function Switch({ label, checked, disabled = false, keyshortcuts, onChange }: Props) {
  const id = useId();
  return (
    <span className="switch">
      <input
        id={id}
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        aria-keyshortcuts={keyshortcuts}
        onChange={(event) => onChange(event.target.checked)}
      />
      <label htmlFor={id}>{label}</label>
    </span>
  );
}
