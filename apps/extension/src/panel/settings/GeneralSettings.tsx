import { t } from "../../shared/i18n.ts";
import { Switch } from "../components/common/Switch.tsx";
import { updateSettings } from "../settings-commands.ts";
import { usePanelStore } from "../store/index.ts";

/** Ajustes ⇒ General: adjuntar al abrir el panel (002 FR-027a). Se guarda al cambiar. */
export function GeneralSettings() {
  const autoAttachOn = usePanelStore((s) => s.settings?.autoAttach ?? true);
  const consent = usePanelStore((s) => s.settings?.attachConsent ?? false);
  return (
    <>
      <Switch
        label={t("settings_auto_attach")}
        checked={autoAttachOn}
        onChange={(autoAttach) => void updateSettings({ autoAttach })}
      />
      <p className="muted">
        {t(consent ? "settings_auto_attach_hint" : "settings_auto_attach_no_consent")}
      </p>
    </>
  );
}
