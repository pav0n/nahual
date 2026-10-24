import type { SessionState } from "@nahual/protocol";
import { useRef, useState } from "react";
import { t } from "../../shared/i18n.ts";
import { userAttach, userDetach, userReconnect } from "../attach-control.ts";
import { Icon, type IconName } from "../components/common/icons.tsx";
import { Menu, anchorOf, type MenuItem } from "../components/common/Menu.tsx";
import { labelOf } from "../shortcuts.ts";
import { usePanelStore } from "../store/index.ts";

const ICONS: Record<SessionState["status"], IconName> = {
  attached: "attached",
  attaching: "attaching",
  detached: "detached",
  conflict: "conflict",
};

/** Causas que son un error con solución (principio III), no un estado normal. */
const ERROR_CAUSES = new Set(["restricted_page", "already_attached", "unknown"]);

/** Texto completo del estado, para la región `status` que anuncian los lectores de pantalla. */
function statusText(state: SessionState | null, status: SessionState["status"], isError: boolean) {
  const parts = [t(`status_${status}`)];
  if (status === "attached") {
    parts.push(state?.site ? t("site_label", state.site) : t("site_none"));
    parts.push(t("status_rules_active", String(state?.activeRuleCount ?? 0)));
    parts.push(t("status_queue_size", String(state?.queueSize ?? 0)));
  }
  let text = parts.join(" · ");
  if (state?.globalPaused) text += `. ${t("status_global_paused")}`;
  if (state?.cause) {
    text += `. ${t(`cause_${state.cause}`)}`;
    if (isError) text += ` ${t(`solution_${state.cause}`)}`;
  }
  return text;
}

/**
 * Estado de la sesión en la barra (004, FR-012, clarificación 3): icono y texto, sitio y señal de
 * causa. El clic (o Enter) abre un menú con el estado, la causa y su solución, y la acción que
 * corresponde con `Alt+Shift+A`; nunca adjunta ni suelta por sí solo.
 */
export function SessionStatus() {
  const state = usePanelStore((s) => s.session);
  const [anchor, setAnchor] = useState<ReturnType<typeof anchorOf> | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const status = state?.status ?? "detached";
  const isError = state?.cause != null && ERROR_CAUSES.has(state.cause);
  // Hubo una sesión (o un conflicto) que terminó: se ofrece reconectar en lugar de adjuntar.
  const canReconnect = status === "conflict" || (status === "detached" && state?.cause != null);
  const shortcut = labelOf("toggleAttach");

  const action: MenuItem =
    status === "attached"
      ? { id: "detach", label: t("action_detach"), shortcut, onSelect: () => void userDetach() }
      : canReconnect
        ? {
            id: "reconnect",
            label: t("action_reconnect"),
            shortcut,
            onSelect: () => void userReconnect(),
          }
        : {
            id: "attach",
            label: t("action_attach"),
            shortcut,
            disabled: status === "attaching",
            onSelect: () => void userAttach(),
          };

  const open = anchor !== null;
  const site = status === "attached" && state?.site ? state.site.replace(/^https?:\/\//, "") : "";

  return (
    <span className="session">
      <button
        ref={trigger}
        type="button"
        className="session-trigger"
        data-status={status}
        data-cause-error={isError}
        aria-label={`${t("session_label")}: ${t(`status_${status}`)}${site ? ` · ${site}` : ""}`}
        aria-haspopup="menu"
        aria-expanded={open}
        title={t("session_menu_hint")}
        onClick={(event) => setAnchor(open ? null : anchorOf(event.currentTarget))}
      >
        <Icon name={isError ? "warning" : ICONS[status]} />
        <span>{t(`status_${status}`)}</span>
        {site ? <span className="site muted">{site}</span> : null}
      </button>
      <span role="status" aria-label={t("session_label")} className="visually-hidden">
        {statusText(state, status, isError)}
      </span>
      <Menu
        open={open}
        anchor={anchor}
        label={t("session_label")}
        items={[action]}
        returnFocus={trigger}
        onClose={() => setAnchor(null)}
        info={
          <>
            <p>
              <strong>{t(`status_${status}`)}</strong>
              {status === "attached" ? (
                <span className="muted">
                  {" · "}
                  {state?.site ? t("site_label", state.site) : t("site_none")}
                </span>
              ) : null}
            </p>
            {state?.cause ? (
              <p className={isError ? "field-error" : "muted"}>
                {t(`cause_${state.cause}`)}
                {isError ? ` ${t(`solution_${state.cause}`)}` : ""}
              </p>
            ) : null}
          </>
        }
      />
    </span>
  );
}
