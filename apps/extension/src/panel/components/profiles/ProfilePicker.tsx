import { t } from "../../../shared/i18n.ts";
import { profilesOfSite } from "../../profiles/select.ts";
import { usePanelStore } from "../../store/index.ts";

interface Props {
  site: string | null;
  selected: readonly string[];
  onChange(profileIds: string[]): void;
}

/**
 * Perfiles a los que pertenece una regla (007, FR-023): una casilla por perfil del sitio, con el
 * mismo patrón que "Tipos de recurso" del editor, y el acceso a Ajustes ⇒ Perfiles.
 */
export function ProfilePicker({ site, selected, onChange }: Props) {
  const profiles = profilesOfSite(
    usePanelStore((s) => s.profiles),
    site,
  );
  const openSettings = usePanelStore((s) => s.openSettings);
  const toggle = (id: string, on: boolean) =>
    onChange(on ? [...selected, id] : selected.filter((x) => x !== id));

  return (
    <fieldset className="types profile-picker">
      <legend>{t("profile_rule_profiles")}</legend>
      {profiles.length === 0 ? <span className="muted">{t("profile_empty_state")}</span> : null}
      {profiles.map((profile) => (
        <label key={profile.id} className="check">
          <input
            type="checkbox"
            checked={selected.includes(profile.id)}
            onChange={(e) => toggle(profile.id, e.target.checked)}
          />
          {profile.name}
        </label>
      ))}
      <button type="button" className="link" onClick={() => openSettings("profiles")}>
        {t("profile_menu_manage")}
      </button>
    </fieldset>
  );
}
