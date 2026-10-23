import { HTTP_TOKEN, MASK, isSensitiveHeader, type Header } from "@nahual/domain";
import { useState } from "react";
import { t } from "../../../shared/i18n.ts";

interface Props {
  legend: string;
  headers: Header[];
  onChange(headers: Header[]): void;
}

/**
 * Headers editables. Un header sensible se muestra enmascarado hasta que el dev entra a editarlo;
 * su valor real se conserva siempre (FR-004b): la máscara es solo visual.
 */
export function HeadersEditor({ legend, headers, onChange }: Props) {
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const update = (index: number, patch: Partial<Header>) =>
    onChange(headers.map((h, i) => (i === index ? { ...h, ...patch } : h)));

  return (
    <fieldset className="headers-editor">
      <legend>{legend}</legend>
      {headers.map((header, index) => {
        const sensitive = isSensitiveHeader(header.name);
        const masked = sensitive && !revealed.has(index);
        const invalidName = header.name !== "" && !HTTP_TOKEN.test(header.name);
        return (
          <div key={index} className="header-row">
            <input
              aria-label={t("header_name_n", String(index + 1))}
              className="mono"
              value={header.name}
              aria-invalid={invalidName}
              onChange={(e) => update(index, { name: e.target.value })}
            />
            <input
              aria-label={t("header_value_of", header.name || String(index + 1))}
              className="mono"
              value={masked ? MASK : header.value}
              readOnly={masked}
              data-masked={masked}
              onFocus={() => {
                if (masked) setRevealed((current) => new Set(current).add(index));
              }}
              onChange={(e) => update(index, { value: e.target.value })}
            />
            <button
              type="button"
              onClick={() => onChange(headers.filter((_, i) => i !== index))}
              aria-label={t("action_remove_header", header.name || String(index + 1))}
            >
              ×
            </button>
            {invalidName ? (
              <span className="field-error header-error">{t("rule_error_header_name")}</span>
            ) : null}
          </div>
        );
      })}
      <button type="button" onClick={() => onChange([...headers, { name: "", value: "" }])}>
        {t("action_add_header")}
      </button>
    </fieldset>
  );
}
