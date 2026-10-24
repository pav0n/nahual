import { compileFilter, type CompiledFilter, type FilterInput } from "@nahual/domain";
import { useId, useState } from "react";
import { t } from "../../../shared/i18n.ts";
import { ariaOf } from "../../shortcuts.ts";

export const SEARCH_INPUT_ID = "traffic-search";

const TYPES = [
  "Fetch",
  "XHR",
  "Document",
  "Script",
  "Stylesheet",
  "Image",
  "Font",
  "Media",
  "Other",
];

export type ValidFilter = Extract<CompiledFilter, { ok: true }>;

interface Props {
  shown: number;
  total: number;
  onChange(filter: ValidFilter): void;
}

const EMPTY: FilterInput = { text: "", regex: "", status: "", types: [], cors: "all" };
const CORS_FILTERS = ["all", "blocked", "relaxed"] as const;

/**
 * Filtros de la lista (FR-003). Una regex o un status inválidos se marcan en su campo y la lista
 * conserva el último filtro válido.
 */
export function Filters({ shown, total, onChange }: Props) {
  const [input, setInput] = useState<FilterInput>(EMPTY);
  const [invalid, setInvalid] = useState<"regex" | "status" | null>(null);
  const regexError = useId();
  const statusError = useId();

  const update = (patch: Partial<FilterInput>) => {
    const next = { ...input, ...patch };
    setInput(next);
    const compiled = compileFilter(next);
    if (compiled.ok) {
      setInvalid(null);
      onChange(compiled);
    } else {
      setInvalid(compiled.field);
    }
  };

  const toggleType = (type: string, checked: boolean) =>
    update({ types: checked ? [...input.types, type] : input.types.filter((x) => x !== type) });

  return (
    <div className="filters" role="search" aria-label={t("filters_label")}>
      <label className="field grow">
        <span>{t("filter_text")}</span>
        <input
          id={SEARCH_INPUT_ID}
          type="search"
          value={input.text}
          aria-keyshortcuts={`${ariaOf("focusSearchSlash")} ${ariaOf("focusSearch")}`}
          onChange={(e) => update({ text: e.target.value })}
        />
      </label>
      <label className="field grow">
        <span>{t("filter_regex")}</span>
        <input
          type="text"
          className="mono"
          value={input.regex}
          aria-invalid={invalid === "regex"}
          aria-describedby={invalid === "regex" ? regexError : undefined}
          onChange={(e) => update({ regex: e.target.value })}
        />
        {invalid === "regex" ? (
          <span id={regexError} className="field-error">
            {t("filter_regex_invalid")}
          </span>
        ) : null}
      </label>
      <label className="field">
        <span>{t("filter_status")}</span>
        <input
          type="text"
          inputMode="text"
          placeholder="4xx, 500"
          value={input.status}
          aria-invalid={invalid === "status"}
          aria-describedby={invalid === "status" ? statusError : undefined}
          onChange={(e) => update({ status: e.target.value })}
        />
        {invalid === "status" ? (
          <span id={statusError} className="field-error">
            {t("filter_status_invalid")}
          </span>
        ) : null}
      </label>
      <label className="field">
        <span>{t("filter_cors")}</span>
        <select
          value={input.cors ?? "all"}
          onChange={(e) => update({ cors: e.target.value as FilterInput["cors"] })}
        >
          {CORS_FILTERS.map((value) => (
            <option key={value} value={value}>
              {t(`filter_cors_${value}`)}
            </option>
          ))}
        </select>
      </label>
      <fieldset className="types">
        <legend>{t("filter_types")}</legend>
        {TYPES.map((type) => (
          <label key={type} className="check">
            <input
              type="checkbox"
              checked={input.types.includes(type)}
              onChange={(e) => toggleType(type, e.target.checked)}
            />
            {type}
          </label>
        ))}
      </fieldset>
      <p className="muted count">{t("filter_count", [String(shown), String(total)])}</p>
    </div>
  );
}
