import type { Issue } from "@nahual/protocol";
import { useId, type ReactNode } from "react";
import { t } from "../../../shared/i18n.ts";

/** Clave del primer error de validación de un campo (FR-013). */
export function issueAt(issues: Issue[], path: string): string | undefined {
  return issues.find((i) => i.path === path)?.messageKey;
}

interface FieldProps {
  label: string;
  error?: string | undefined;
  hint?: string;
  className?: string;
  children(props: {
    id: string;
    "aria-invalid": boolean;
    "aria-describedby": string | undefined;
  }): ReactNode;
}

/** Campo con etiqueta, ayuda y error asociados al control (WCAG 3.3.1, 3.3.2). */
export function Field({ label, error, hint, className = "", children }: FieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy =
    [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className={`field ${className}`}>
      <label htmlFor={id}>{label}</label>
      {children({ id, "aria-invalid": Boolean(error), "aria-describedby": describedBy })}
      {hint ? (
        <span id={hintId} className="muted">
          {hint}
        </span>
      ) : null}
      {error ? (
        <span id={errorId} className="field-error">
          {t(error)}
        </span>
      ) : null}
    </div>
  );
}
