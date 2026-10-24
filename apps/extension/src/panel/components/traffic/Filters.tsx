import { compileFilter, type CompiledFilter, type FilterInput } from "@nahual/domain";
import { useId, useRef, useState } from "react";
import { t } from "../../../shared/i18n.ts";
import { ariaOf } from "../../shortcuts.ts";
import { IconButton } from "../common/IconButton.tsx";
import { Menu, anchorOf } from "../common/Menu.tsx";
import type { Anchor } from "../common/menu-logic.ts";
import { ToggleButton } from "../common/ToggleButton.tsx";
import { Toolbar } from "../common/Toolbar.tsx";

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

/** Etiqueta corta visible; el nombre accesible es el tipo completo y la contiene (WCAG 2.5.3). */
const SHORT: Record<string, string> = { Stylesheet: "Style", Document: "Doc" };

export type ValidFilter = Extract<CompiledFilter, { ok: true }>;

interface Props {
  shown: number;
  total: number;
  onChange(filter: ValidFilter): void;
  onClear(): void;
  clearDisabled: boolean;
}

const EMPTY: FilterInput = { text: "", regex: "", status: "", types: [], cors: "all" };
const CORS_FILTERS = ["all", "blocked", "relaxed"] as const;

/**
 * Filtros de la lista en una barra (004, FR-009): búsqueda con alternador de expresión regular,
 * tipos como botones de selección, CORS, estado compacto, contador y limpiar. Conservan el
 * comportamiento de 002/003: una regex o un status inválidos se marcan en su campo y la lista
 * conserva el último filtro válido.
 */
export function Filters({ shown, total, onChange, onClear, clearDisabled }: Props) {
  const [input, setInput] = useState<FilterInput>(EMPTY);
  const [useRegex, setUseRegex] = useState(false);
  const [invalid, setInvalid] = useState<"regex" | "status" | null>(null);
  const [typesAnchor, setTypesAnchor] = useState<Anchor | null>(null);
  const typesButton = useRef<HTMLButtonElement>(null);
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

  const search = useRegex ? input.regex : input.text;
  const setSearch = (value: string) => update(useRegex ? { regex: value } : { text: value });

  const toggleRegex = (on: boolean) => {
    setUseRegex(on);
    // El texto escrito pasa al otro modo: así el alternador no pierde lo que había.
    update(on ? { text: "", regex: search } : { text: search, regex: "" });
  };

  const toggleType = (type: string, on: boolean) =>
    update({ types: on ? [...input.types, type] : input.types.filter((x) => x !== type) });

  return (
    <div role="search" aria-label={t("filters_label")} className="filters">
      <Toolbar label={t("filters_toolbar")}>
        <span className="search">
          <input
            id={SEARCH_INPUT_ID}
            type="search"
            className={useRegex ? "mono" : undefined}
            value={search}
            placeholder={t(useRegex ? "filter_regex_placeholder" : "filter_text_placeholder")}
            aria-label={t(useRegex ? "filter_regex" : "filter_text")}
            aria-keyshortcuts={`${ariaOf("focusSearchSlash")} ${ariaOf("focusSearch")}`}
            aria-invalid={useRegex && invalid === "regex"}
            aria-describedby={useRegex && invalid === "regex" ? regexError : undefined}
            onChange={(e) => setSearch(e.target.value)}
          />
          <IconButton
            icon="regex"
            label={t("filter_use_regex")}
            aria-pressed={useRegex}
            onClick={() => toggleRegex(!useRegex)}
          />
        </span>
        <span className="toolbar-separator" aria-hidden="true" />
        <span className="type-toggles">
          {TYPES.map((type) => (
            <ToggleButton
              key={type}
              pressed={input.types.includes(type)}
              onChange={(on) => toggleType(type, on)}
              aria-label={type}
              title={type}
            >
              {SHORT[type] ?? type}
            </ToggleButton>
          ))}
        </span>
        {/* A menos de 600 px los tipos van a un menú, para que los filtros quepan en 2 filas. */}
        <span className="type-menu">
          <button
            ref={typesButton}
            type="button"
            aria-haspopup="menu"
            aria-expanded={typesAnchor !== null}
            onClick={(event) => setTypesAnchor(typesAnchor ? null : anchorOf(event.currentTarget))}
          >
            {input.types.length > 0
              ? t("filter_types_count", String(input.types.length))
              : t("filter_types")}
          </button>
        </span>
        <Menu
          open={typesAnchor !== null}
          anchor={typesAnchor}
          label={t("filter_types")}
          returnFocus={typesButton}
          onClose={() => setTypesAnchor(null)}
          items={TYPES.map((type) => ({
            id: type,
            label: type,
            checked: input.types.includes(type),
            onSelect: () => toggleType(type, !input.types.includes(type)),
          }))}
        />
        <span className="toolbar-separator" aria-hidden="true" />
        <select
          className="cors-filter"
          aria-label={t("filter_cors")}
          value={input.cors ?? "all"}
          onChange={(e) => update({ cors: e.target.value as FilterInput["cors"] })}
        >
          {CORS_FILTERS.map((value) => (
            <option key={value} value={value}>
              {t(`filter_cors_${value}`)}
            </option>
          ))}
        </select>
        <input
          type="text"
          className="status-filter"
          inputMode="text"
          placeholder="4xx, 500"
          aria-label={t("filter_status")}
          value={input.status}
          aria-invalid={invalid === "status"}
          aria-describedby={invalid === "status" ? statusError : undefined}
          onChange={(e) => update({ status: e.target.value })}
        />
        <p className="count" aria-live="polite">
          {t("filter_count", [String(shown), String(total)])}
        </p>
        <IconButton
          icon="clear"
          label={t("action_clear_traffic")}
          onClick={onClear}
          disabled={clearDisabled}
        />
      </Toolbar>
      {useRegex && invalid === "regex" ? (
        <p id={regexError} className="field-error filter-error">
          {t("filter_regex_invalid")}
        </p>
      ) : null}
      {invalid === "status" ? (
        <p id={statusError} className="field-error filter-error">
          {t("filter_status_invalid")}
        </p>
      ) : null}
    </div>
  );
}
