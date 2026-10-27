import { uniqueProfileName, type Profile } from "@nahual/domain";
import { useState } from "react";
import { t } from "../../../shared/i18n.ts";
import { deleteProfile, duplicateProfile, saveProfile } from "../../profiles/commands.ts";
import { profilesOfSite } from "../../profiles/select.ts";
import { AutoSaveField } from "../../settings/AutoSaveField.tsx";
import { usePanelStore } from "../../store/index.ts";
import { EmptyState } from "../common/EmptyState.tsx";
import { Field } from "../common/Field.tsx";

/** Nombre libre para la copia: "X (copia)", "X (copia) 2"… (el SW rechaza los repetidos). */
function copyName(profiles: readonly Profile[], source: Profile) {
  const base = t("profile_copy_name", source.name);
  let name = base;
  for (let n = 2; !uniqueProfileName(profiles, source.site, name); n++) name = `${base} ${n}`;
  return name;
}

const validName = (raw: string) => {
  const name = raw.trim();
  if (!name) return "profile_error_required";
  if (name.length > 60) return "profile_error_too_long";
  return null;
};

/**
 * Ajustes ⇒ Perfiles (007, FR-023, contracts/panel-ui.md): los perfiles del sitio con su nombre
 * (se guarda al confirmarlo, como el resto de Ajustes), cuántas reglas tienen, duplicar y eliminar
 * con deshacer. Los de otros sitios, aparte, como en la lista de reglas.
 */
export function ProfilesSettings() {
  const profiles = usePanelStore((s) => s.profiles);
  const rules = usePanelStore((s) => s.rules);
  const site = usePanelStore((s) => s.session?.site ?? null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);

  const current = profilesOfSite(profiles, site);
  const others = profiles.filter((p) => p.site !== site);
  const count = (id: string) => rules.filter((r) => r.profileIds.includes(id)).length;

  const create = async () => {
    const issue = validName(draft);
    if (issue) {
      setError(issue);
      return;
    }
    const reply = await saveProfile(draft.trim());
    if (reply.ok) {
      setDraft("");
      setError(undefined);
    } else setError(reply.issues[0]?.messageKey ?? reply.messageKey);
  };

  const row = (profile: Profile, editable: boolean) => (
    <li key={profile.id} className="rule-item profile-item">
      <div className="row">
        {editable ? (
          <span className="grow">
            <AutoSaveField
              label={t("profile_name")}
              saved={profile.name}
              validate={validName}
              save={(raw) => saveProfile(raw.trim(), profile.id)}
            />
          </span>
        ) : (
          <span className="grow">
            <strong>{profile.name}</strong>
            <span className="muted"> · {t("site_label", profile.site)}</span>
          </span>
        )}
        <span className="muted">{t("profile_rule_count", String(count(profile.id)))}</span>
      </div>
      <div className="row">
        <button
          type="button"
          aria-label={`${t("profile_duplicate")}: ${profile.name}`}
          onClick={() => void duplicateProfile(profile.id, copyName(profiles, profile))}
        >
          {t("action_duplicate")}
        </button>
        <button
          type="button"
          aria-label={`${t("profile_delete")}: ${profile.name}`}
          onClick={() => void deleteProfile(profile.id, profile.name)}
        >
          {t("action_delete")}
        </button>
      </div>
    </li>
  );

  return (
    <div className="profiles-settings">
      <p className="muted">{t("profile_settings_intro")}</p>
      <div className="row profile-add">
        <Field label={t("profile_new_name")} error={error}>
          {(props) => (
            <input
              {...props}
              value={draft}
              disabled={site === null}
              onChange={(event) => {
                setDraft(event.target.value);
                setError(undefined);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") void create();
              }}
            />
          )}
        </Field>
        <button type="button" disabled={site === null} onClick={() => void create()}>
          {t("profile_create")}
        </button>
      </div>
      {current.length === 0 ? (
        <EmptyState title={t("profile_empty_state")}>
          {t(site === null ? "empty_rules_no_site" : "profile_empty_state_hint")}
        </EmptyState>
      ) : (
        <ul className="plain rule-list" aria-label={t("profile_settings_title")}>
          {current.map((p) => row(p, true))}
        </ul>
      )}
      {others.length > 0 ? (
        <details>
          <summary>{t("profile_other_sites", String(others.length))}</summary>
          <ul className="plain rule-list">{others.map((p) => row(p, false))}</ul>
        </details>
      ) : null}
    </div>
  );
}
