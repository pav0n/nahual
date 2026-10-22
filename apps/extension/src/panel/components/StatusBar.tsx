import type { SessionState } from "@nahual/protocol";
import { t } from "../../shared/i18n.ts";
import { SHORTCUT_TOGGLE_ATTACH } from "../use-shortcuts.ts";

const ICONS: Record<SessionState["status"], string> = {
  attached: "●",
  attaching: "◌",
  detached: "○",
  conflict: "▲",
};

interface Props {
  state: SessionState | null;
  onAttach(): void;
  onDetach(): void;
  onReconnect(): void;
}

export function StatusBar({ state, onAttach, onDetach, onReconnect }: Props) {
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
        {state?.cause ? <p className="muted">{t(`cause_${state.cause}`)}</p> : null}
      </div>
      {status === "attached" ? (
        <button type="button" onClick={onDetach} aria-keyshortcuts="Alt+Shift+A" title={hint}>
          {t("action_detach")} <kbd>{SHORTCUT_TOGGLE_ATTACH}</kbd>
        </button>
      ) : canReconnect ? (
        <button
          type="button"
          className="primary"
          onClick={onReconnect}
          aria-keyshortcuts="Alt+Shift+A"
          title={hint}
        >
          {t("action_reconnect")} <kbd>{SHORTCUT_TOGGLE_ATTACH}</kbd>
        </button>
      ) : (
        <button
          type="button"
          className="primary"
          onClick={onAttach}
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
