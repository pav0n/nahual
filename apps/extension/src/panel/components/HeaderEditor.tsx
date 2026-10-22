import { HeaderEditSchema, type HeaderEdit, type PausedRequestView } from "@nahual/protocol";
import { useId, useState } from "react";
import { t } from "../../shared/i18n.ts";
import { SHORTCUT_CONTINUE } from "../use-shortcuts.ts";

interface Row {
  key: number;
  name: string;
  value: string;
}

/** Diferencia entre los headers originales y los editados, como `HeaderEdit[]`. */
export function diffHeaders(
  original: { name: string; value: string }[],
  rows: Row[],
): HeaderEdit[] {
  const edits: HeaderEdit[] = [];
  const lower = (s: string) => s.trim().toLowerCase();
  const kept = new Set(rows.map((r) => lower(r.name)));
  for (const h of original) {
    if (!kept.has(lower(h.name))) edits.push({ name: h.name, value: null });
  }
  for (const row of rows) {
    const name = row.name.trim();
    const same = original.find((h) => lower(h.name) === lower(name) && h.value === row.value);
    if (!same) edits.push({ name, value: row.value });
  }
  return edits;
}

interface Props {
  pause: PausedRequestView;
  onContinue(headers?: HeaderEdit[]): void;
}

export function HeaderEditor({ pause, onContinue }: Props) {
  const id = useId();
  const [nextKey, setNextKey] = useState(pause.headers.length);
  const [rows, setRows] = useState<Row[]>(() =>
    pause.headers.map((h, key) => ({ key, name: h.name, value: h.value })),
  );
  const [error, setError] = useState<string | null>(null);

  const update = (key: number, patch: Partial<Row>) =>
    setRows((list) => list.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const continueWithChanges = () => {
    const edits = diffHeaders(pause.headers, rows);
    const invalid = edits.some((e) => !HeaderEditSchema.safeParse(e).success) || edits.length > 50;
    if (invalid) {
      setError(t("error_header_invalid"));
      return;
    }
    setError(null);
    onContinue(edits.length > 0 ? edits : undefined);
  };

  return (
    <section aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>{t("section_headers")}</h2>
      {rows.map((row) => (
        <div key={row.key} className="header-row">
          <input
            aria-label={t("label_header_name")}
            value={row.name}
            onChange={(e) => update(row.key, { name: e.target.value })}
            spellCheck={false}
          />
          <input
            aria-label={t("label_header_value")}
            value={row.value}
            onChange={(e) => update(row.key, { value: e.target.value })}
            spellCheck={false}
          />
          <button
            type="button"
            onClick={() => setRows((list) => list.filter((r) => r.key !== row.key))}
          >
            {t("action_remove_header", row.name || "—")}
          </button>
        </div>
      ))}
      <div className="row">
        <button
          type="button"
          onClick={() => {
            setRows((list) => [...list, { key: nextKey, name: "", value: "" }]);
            setNextKey((k) => k + 1);
          }}
        >
          {t("action_add_header")}
        </button>
        <button type="button" onClick={continueWithChanges}>
          {t("action_continue_modified")}
        </button>
        <button
          type="button"
          className="primary"
          onClick={() => onContinue()}
          aria-keyshortcuts="Alt+Shift+C"
          title={t("shortcut_hint", SHORTCUT_CONTINUE)}
        >
          {t("action_continue")} <kbd>{SHORTCUT_CONTINUE}</kbd>
        </button>
      </div>
      {error ? (
        <p role="alert" className="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
