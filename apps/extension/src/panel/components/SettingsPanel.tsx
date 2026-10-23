import { LIMITS } from "@nahual/domain";
import { useState, type ReactNode } from "react";
import { t } from "../../shared/i18n.ts";
import { command } from "../commands.ts";
import { updateSettings } from "../settings-commands.ts";
import { usePanelStore } from "../store/index.ts";
import { Field } from "./common/Field.tsx";
import { CorsSettings } from "./cors/CorsSettings.tsx";
import { Switch } from "./common/Switch.tsx";

/** Ajustes del panel (FR-022 y, con la historia 3, FR-027a). */
export function SettingsPanel({ children }: { children?: ReactNode }) {
  const saved = usePanelStore((s) => s.settings?.pauseTimeoutSeconds ?? LIMITS.pauseTimeoutDefault);
  const autoAttachOn = usePanelStore((s) => s.settings?.autoAttach ?? true);
  const consent = usePanelStore((s) => s.settings?.attachConsent ?? false);
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | undefined>(undefined);
  const value = draft ?? String(saved);

  const apply = async () => {
    const seconds = Number(value);
    if (
      !Number.isInteger(seconds) ||
      seconds < LIMITS.pauseTimeoutMin ||
      seconds > LIMITS.pauseTimeoutMax
    ) {
      setError("settings_timeout_range");
      return;
    }
    const reply = await command("updateSettings", { pauseTimeoutSeconds: seconds });
    if (reply.ok) {
      setDraft(null);
      setError(undefined);
    } else {
      setError("settings_timeout_range");
    }
  };

  return (
    <details className="settings">
      <summary>{t("settings_title")}</summary>
      <form
        className="row"
        onSubmit={(event) => {
          event.preventDefault();
          void apply();
        }}
      >
        <Field
          label={t("settings_timeout")}
          error={error}
          hint={t("settings_timeout_hint")}
          className="grow"
        >
          {(props) => (
            <input
              {...props}
              inputMode="numeric"
              value={value}
              onChange={(e) => setDraft(e.target.value)}
            />
          )}
        </Field>
        <button type="submit">{t("action_apply")}</button>
      </form>
      <Switch
        label={t("settings_auto_attach")}
        checked={autoAttachOn}
        onChange={(autoAttach) => void updateSettings({ autoAttach })}
      />
      <p className="muted">
        {t(consent ? "settings_auto_attach_hint" : "settings_auto_attach_no_consent")}
      </p>
      <CorsSettings />
      {children}
    </details>
  );
}
