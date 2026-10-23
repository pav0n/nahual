import { t } from "../../shared/i18n.ts";
import { usePanelStore } from "../store/index.ts";

/** Errores del último comando y avisos del SW, con causa y solución (principio III). */
export function Notices() {
  const lastError = usePanelStore((s) => s.lastError);
  const notices = usePanelStore((s) => s.notices);
  const setError = usePanelStore((s) => s.setError);
  const dismiss = usePanelStore((s) => s.dismissNotice);
  if (!lastError && notices.length === 0) return null;
  return (
    <div className="notices">
      {lastError ? (
        <div role="alert" className="alert row">
          <span className="grow">{t(lastError.messageKey)}</span>
          <button type="button" onClick={() => setError(null)} aria-label={t("action_dismiss")}>
            ×
          </button>
        </div>
      ) : null}
      {notices.map((notice) => (
        <div key={notice.id} role="alert" className="alert row">
          <span className="grow">{t(notice.messageKey, notice.params)}</span>
          <button type="button" onClick={() => dismiss(notice.id)} aria-label={t("action_dismiss")}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
