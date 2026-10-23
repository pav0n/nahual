import { useId, useState } from "react";
import { t } from "../../../shared/i18n.ts";
import { formatBytes, prettyBody } from "../../format.ts";

interface Props {
  label: string;
  value: string;
  /** El content-type es JSON: se avisa si el body no es JSON válido (sin impedir continuar). */
  json: boolean;
  onChange(value: string): void;
}

/** Body editable como texto (research R14): formatear, validar JSON y tamaño. */
export function BodyEditor({ label, value, json, onChange }: Props) {
  const id = useId();
  const [checked, setChecked] = useState<"ok" | "invalid" | null>(null);
  const invalidJson = json && value.trim() !== "" && !prettyBody(value).json;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <textarea
        id={id}
        className="mono body-editor"
        value={value}
        spellCheck={false}
        aria-describedby={`${id}-meta`}
        onChange={(e) => {
          setChecked(null);
          onChange(e.target.value);
        }}
      />
      <div className="row" id={`${id}-meta`}>
        <button type="button" onClick={() => onChange(prettyBody(value).text)}>
          {t("action_format_json")}
        </button>
        <button type="button" onClick={() => setChecked(prettyBody(value).json ? "ok" : "invalid")}>
          {t("action_validate_json")}
        </button>
        <span className="muted">{formatBytes(new TextEncoder().encode(value).length)}</span>
        {checked === "ok" ? <span role="status">{t("body_json_valid")}</span> : null}
        {checked === "invalid" || invalidJson ? (
          <span role="status" className="field-warning">
            {t("body_json_invalid")}
          </span>
        ) : null}
      </div>
    </div>
  );
}
