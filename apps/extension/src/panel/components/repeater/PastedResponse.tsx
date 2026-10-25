import { LIMITS, utf8Bytes } from "@nahual/domain";
import { useId, useState } from "react";
import { t } from "../../../shared/i18n.ts";

/**
 * Respuesta pegada (005, FR-022a): un body (JSON o texto, hasta 5 MB) para usarlo como cualquiera
 * de los lados del diff, p. ej. la respuesta esperada. Una por pestaña, en memoria.
 */
export function PastedResponse({
  pasted,
  onChange,
}: {
  pasted: { text: string } | null;
  onChange(pasted: { text: string } | null): void;
}) {
  const id = useId();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(pasted?.text ?? "");
  const tooLarge = utf8Bytes(draft) > LIMITS.bodyBytes;

  if (!editing)
    return (
      <div className="row pasted-response">
        <button
          type="button"
          onClick={() => {
            setDraft(pasted?.text ?? "");
            setEditing(true);
          }}
        >
          {t(pasted ? "pasted_edit" : "pasted_add")}
        </button>
        {pasted ? (
          <button type="button" onClick={() => onChange(null)}>
            {t("pasted_remove")}
          </button>
        ) : null}
      </div>
    );
  return (
    <div className="field pasted-response">
      <label htmlFor={id}>{t("pasted_label")}</label>
      <textarea
        id={id}
        className="mono body-editor"
        value={draft}
        spellCheck={false}
        aria-invalid={tooLarge}
        onChange={(e) => setDraft(e.target.value)}
      />
      {tooLarge ? <span className="field-error">{t("rule_error_body_too_large")}</span> : null}
      <div className="row">
        <button
          type="button"
          className="primary"
          disabled={tooLarge || draft === ""}
          onClick={() => {
            onChange({ text: draft });
            setEditing(false);
          }}
        >
          {t("pasted_save")}
        </button>
        <button type="button" onClick={() => setEditing(false)}>
          {t("action_cancel")}
        </button>
      </div>
    </div>
  );
}
