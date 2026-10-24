import type { Issue } from "@nahual/protocol";
import { useId, useState, type InputHTMLAttributes } from "react";
import { t } from "../../shared/i18n.ts";
import { Field } from "../components/common/Field.tsx";

type SaveState = "saved" | "dirty" | "saving" | "invalid";

interface Props {
  label: string;
  hint?: string;
  /** Valor guardado (el del SW). */
  saved: string;
  /** Clave del error si el texto no es válido; `null` si se puede guardar. */
  validate(raw: string): string | null;
  save(raw: string): Promise<{ ok: boolean; issues?: Issue[] }>;
  inputMode?: InputHTMLAttributes<HTMLInputElement>["inputMode"];
}

/**
 * Campo de Ajustes que se guarda al confirmarlo (004, research R8, FR-015): al salir del campo o
 * con Enter. Estados `saved` ⇒ `dirty` ⇒ `saving` ⇒ `saved | invalid`; "Guardado" se anuncia en una
 * región `aria-live`. Un valor inválido no se guarda y el campo explica el rango; al cerrar el
 * diálogo el campo se desmonta y vuelve a mostrar el valor guardado.
 */
export function AutoSaveField({ label, hint, saved, validate, save, inputMode }: Props) {
  const [draft, setDraft] = useState<string | null>(null);
  const [state, setState] = useState<SaveState>("saved");
  const [error, setError] = useState<string | undefined>(undefined);
  const [announce, setAnnounce] = useState(false);
  const liveId = useId();

  const commit = async () => {
    if (draft === null || state === "saving") return;
    const issue = validate(draft);
    if (issue) {
      setState("invalid");
      setError(issue);
      return;
    }
    setState("saving");
    const reply = await save(draft);
    if (reply.ok) {
      setDraft(null);
      setError(undefined);
      setState("saved");
      setAnnounce(true);
    } else {
      setState("invalid");
      setError(reply.issues?.[0]?.messageKey ?? validate(draft) ?? "settings_invalid");
    }
  };

  return (
    <div className="autosave" data-state={state}>
      <Field label={label} error={error} {...(hint ? { hint } : {})}>
        {(props) => (
          <input
            {...props}
            inputMode={inputMode}
            value={draft ?? saved}
            onChange={(event) => {
              setDraft(event.target.value);
              setState("dirty");
              setAnnounce(false);
            }}
            onBlur={() => void commit()}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              void commit();
            }}
          />
        )}
      </Field>
      <p id={liveId} className="saved" aria-live="polite">
        {announce ? t("settings_saved") : ""}
      </p>
    </div>
  );
}
