import { useRef, useState } from "react";
import { t } from "../../../shared/i18n.ts";
import { setActiveProfile } from "../../profiles/commands.ts";
import { activeProfileName, profilesOfSite } from "../../profiles/select.ts";
import { labelOf } from "../../shortcuts.ts";
import { usePanelStore } from "../../store/index.ts";
import { Icon } from "../common/icons.tsx";
import { Menu, anchorOf, type MenuItem } from "../common/Menu.tsx";

/** Id del disparador: `Alt+Shift+O` lo pulsa para abrir el menú (FR-021). */
export const PROFILE_TRIGGER_ID = "nahual-profile-trigger";

/**
 * Perfil activo de la pestaña en la barra (007, US3, contracts/panel-ui.md): icono y texto, nunca
 * solo color (FR-021). Un clic o `Alt+Shift+O` abre un menú con "Todas las reglas", los perfiles
 * del sitio y "Gestionar perfiles…"; elegir uno lo activa en esta pestaña. Mismo patrón que el
 * estado de sesión de 004.
 */
export function ProfileStatus() {
  const session = usePanelStore((s) => s.session);
  const profiles = usePanelStore((s) => s.profiles);
  const rules = usePanelStore((s) => s.rules);
  const openSettings = usePanelStore((s) => s.openSettings);
  const [anchor, setAnchor] = useState<ReturnType<typeof anchorOf> | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const site = session?.site ?? null;
  const activeId = session?.activeProfileId ?? null;
  const name = activeProfileName(profiles, activeId);
  const text = name ? t("profile_status_named", name) : t("profile_status_all");
  const open = anchor !== null;

  const choose = (profileId: string | null) => void setActiveProfile(profileId);
  const items: MenuItem[] = [
    {
      id: "all",
      label: t("profile_status_all"),
      checked: activeId === null,
      onSelect: () => choose(null),
    },
    ...profilesOfSite(profiles, site).map((profile) => {
      const empty = !rules.some((r) => r.profileIds.includes(profile.id));
      return {
        id: profile.id,
        label: empty ? t("profile_menu_empty_suffix", profile.name) : profile.name,
        checked: activeId === profile.id,
        onSelect: () => choose(profile.id),
      };
    }),
    { id: "manage", label: t("profile_menu_manage"), onSelect: () => openSettings("profiles") },
  ];

  return (
    <span className="profile-status">
      <button
        ref={trigger}
        id={PROFILE_TRIGGER_ID}
        type="button"
        className="session-trigger profile-trigger"
        data-active={activeId !== null}
        aria-label={`${t("profile_status_label")}: ${name ?? t("profile_status_all")}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-keyshortcuts="Alt+Shift+O"
        title={`${text} (${labelOf("openProfileMenu")})`}
        onClick={(event) => setAnchor(open ? null : anchorOf(event.currentTarget))}
      >
        <Icon name="profile" />
        <span className="profile-name">{text}</span>
      </button>
      <Menu
        open={open}
        anchor={anchor}
        label={t("profile_menu_label")}
        items={items}
        returnFocus={trigger}
        onClose={() => setAnchor(null)}
      />
    </span>
  );
}
