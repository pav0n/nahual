import type { SessionState } from "@nahual/protocol";
import type { ReactNode } from "react";
import { t } from "../../shared/i18n.ts";
import { userAttach, userDetach, userReconnect } from "../attach-control.ts";
import { usePanelStore } from "../store/index.ts";
import { SHORTCUT_TOGGLE_ATTACH } from "../use-shortcuts.ts";

const ICONS: Record<SessionState["status"], string> = {
  attached: "●",
  attaching: "◌",
  detached: "○",
  conflict: "▲",
};

/** Causas que son un error con solución (principio III), no un estado normal. */
const ERROR_CAUSES = new Set(["restricted_page", "already_attached", "unknown"]);

/**
 * Indicador permanente (FR-028): estado del debugger con texto e icono (no solo color), sitio,
 * reglas activas, tamaño de la cola, "pausar Nahual" y la acción que corresponde.
 */
export function StatusBar({ globalPauseControl }: { globalPauseControl?: ReactNode }) {
  const state = usePanelStore((s) => s.session);
  const setHelpOpen = usePanelStore((s) => s.setHelpOpen);
  const status = state?.status ?? "detached";
  const hint = t("shortcut_hint", SHORTCUT_TOGGLE_ATTACH);
  // Hubo una sesión (o un conflicto) que terminó: se ofrece reconectar en lugar de adjuntar.
  const canReconnect = status === "conflict" || (status === "detached" && state?.cause != null);
  const isError = state?.cause != null && ERROR_CAUSES.has(state.cause);

  return (
    <div className="status">
      <div role="status" aria-live="polite" className="grow">
        <span className="status-badge" data-status={status}>
          <span aria-hidden="true">{ICONS[status]} </span>
          {t(`status_${status}`)}
        </span>
        {status === "attached" ? (
          <span className="muted">
            {" · "}
            {state?.site ? t("site_label", state.site) : t("site_none")}
            {" · "}
            {t("status_rules_active", String(state?.activeRuleCount ?? 0))}
            {" · "}
            {t("status_queue_size", String(state?.queueSize ?? 0))}
          </span>
        ) : null}
        {state?.globalPaused ? <p className="paused-badge">{t("status_global_paused")}</p> : null}
        {state?.cause ? (
          <p className={isError ? "field-error" : "muted"}>
            {t(`cause_${state.cause}`)}
            {isError ? ` ${t(`solution_${state.cause}`)}` : ""}
          </p>
        ) : null}
      </div>
      {globalPauseControl}
      {status === "attached" ? (
        <button
          type="button"
          onClick={() => void userDetach()}
          aria-keyshortcuts="Alt+Shift+A"
          title={hint}
        >
          {t("action_detach")} <kbd>{SHORTCUT_TOGGLE_ATTACH}</kbd>
        </button>
      ) : canReconnect ? (
        <button
          type="button"
          className="primary"
          onClick={() => void userReconnect()}
          aria-keyshortcuts="Alt+Shift+A"
          title={hint}
        >
          {t("action_reconnect")} <kbd>{SHORTCUT_TOGGLE_ATTACH}</kbd>
        </button>
      ) : (
        <button
          type="button"
          className="primary"
          onClick={() => void userAttach()}
          disabled={status === "attaching"}
          aria-keyshortcuts="Alt+Shift+A"
          title={hint}
        >
          {t("action_attach")} <kbd>{SHORTCUT_TOGGLE_ATTACH}</kbd>
        </button>
      )}
      <button type="button" onClick={() => setHelpOpen(true)}>
        {t("action_help")}
      </button>
    </div>
  );
}
