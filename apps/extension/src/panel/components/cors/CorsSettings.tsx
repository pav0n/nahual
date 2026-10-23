import {
  RELAXATION_DURATIONS,
  parseProductionEntry,
  type RelaxationDuration,
} from "@nahual/domain";
import { useState } from "react";
import { t } from "../../../shared/i18n.ts";
import { updateSettings } from "../../settings-commands.ts";
import { usePanelStore } from "../../store/index.ts";
import { Field } from "../common/Field.tsx";

/** Referencia estable: un `[]` nuevo en el selector haría renderizar en bucle. */
const NO_ORIGINS: readonly string[] = [];

/** Tiempo para deshacer quitar un origen de producción (FR-031). */
const UNDO_MS = 10_000;

/**
 * Ajustes de CORS de desarrollo: duración por defecto de las relajaciones (FR-015) y lista de
 * orígenes de producción donde nunca se relaja (FR-028–FR-031).
 */
export function CorsSettings() {
  const duration = usePanelStore((s) => s.settings?.corsDefaultDurationMinutes ?? 480);
  const origins = usePanelStore((s) => s.settings?.productionOrigins ?? NO_ORIGINS);
  const pushToast = usePanelStore((s) => s.pushToast);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);

  const add = async () => {
    const entry = parseProductionEntry(draft.trim());
    if (entry === null) {
      setError("cors_error_production_entry");
      return;
    }
    if (origins.includes(entry)) {
      setDraft("");
      setError(undefined);
      return;
    }
    const reply = await updateSettings({ productionOrigins: [...origins, entry] });
    if (reply.ok) {
      setDraft("");
      setError(undefined);
    } else {
      setError("cors_error_production_entry");
    }
  };

  const remove = async (entry: string) => {
    const before = origins;
    const reply = await updateSettings({ productionOrigins: origins.filter((o) => o !== entry) });
    if (!reply.ok) return;
    pushToast(
      {
        messageKey: "toast_production_removed",
        params: [entry],
        actionKey: "action_undo",
        onAction: () => void updateSettings({ productionOrigins: [...before] }),
      },
      UNDO_MS,
    );
  };

  return (
    <fieldset className="cors-settings">
      <legend>{t("settings_cors_title")}</legend>
      <label className="field">
        <span>{t("settings_cors_duration")}</span>
        <select
          value={duration}
          onChange={(e) =>
            void updateSettings({
              corsDefaultDurationMinutes: Number(e.target.value) as RelaxationDuration,
            })
          }
        >
          {RELAXATION_DURATIONS.map((minutes) => (
            <option key={minutes} value={minutes}>
              {t(`cors_duration_${minutes}`)}
            </option>
          ))}
        </select>
      </label>
      <h3>{t("settings_production_title")}</h3>
      <p className="muted">{t("settings_production_hint")}</p>
      {origins.length === 0 ? (
        <p className="muted">{t("settings_production_empty")}</p>
      ) : (
        <ul className="plain production-list">
          {origins.map((entry) => (
            <li key={entry} className="row">
              <span className="mono grow">{entry}</span>
              <button
                type="button"
                aria-label={t("settings_production_remove", [entry])}
                onClick={() => void remove(entry)}
              >
                {t("action_remove")}
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="row"
        onSubmit={(event) => {
          event.preventDefault();
          void add();
        }}
      >
        <Field
          label={t("settings_production_add_label")}
          error={error}
          hint={t("settings_production_add_hint")}
          className="grow"
        >
          {(props) => (
            <input
              {...props}
              className="mono"
              value={draft}
              placeholder="https://*.empresa.com"
              onChange={(e) => setDraft(e.target.value)}
            />
          )}
        </Field>
        <button type="submit">{t("action_add")}</button>
      </form>
    </fieldset>
  );
}
