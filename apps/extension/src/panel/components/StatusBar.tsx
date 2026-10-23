import type { SessionState } from "@nahual/protocol";
import { t } from "../../shared/i18n.ts";
import { command } from "../commands.ts";
import { usePanelStore } from "../store/index.ts";
import { SHORTCUT_TOGGLE_ATTACH } from "../use-shortcuts.ts";

const ICONS: Record<SessionState["status"], string> = {
  attached: "●",
  attaching: "◌",
  detached: "○",
  conflict: "▲",
};

/** Indicador permanente del debugger (FR-028): estado con texto, sitio y acción. */
export function StatusBar() {
  const state = usePanelStore((s) => s.session);
  const status = state?.status ?? "detached";
  const hint = t("shortcut_hint", SHORTCUT_TOGGLE_ATTACH);
  // Hubo una sesión (o un conflicto) que terminó: se ofrece reconectar en lugar de adjuntar.
  const canReconnect = status === "conflict" || (status === "detached" && state?.cause != null);

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
          </span>
        ) : null}
        {state?.cause ? <p className="muted">{t(`cause_${state.cause}`)}</p> : null}
      </div>
      {status === "attached" ? (
        <button
          type="button"
          onClick={() => void command("detach", {})}
          aria-keyshortcuts="Alt+Shift+A"
          title={hint}
        >
          {t("action_detach")} <kbd>{SHORTCUT_TOGGLE_ATTACH}</kbd>
        </button>
      ) : canReconnect ? (
        <button
          type="button"
          className="primary"
          onClick={() => void command("reconnect", {})}
          aria-keyshortcuts="Alt+Shift+A"
          title={hint}
        >
          {t("action_reconnect")} <kbd>{SHORTCUT_TOGGLE_ATTACH}</kbd>
        </button>
      ) : (
        <button
          type="button"
          className="primary"
          onClick={() => void command("attach", {})}
          disabled={status === "attaching"}
          aria-keyshortcuts="Alt+Shift+A"
          title={hint}
        >
          {t("action_attach")} <kbd>{SHORTCUT_TOGGLE_ATTACH}</kbd>
        </button>
      )}
    </div>
  );
}
