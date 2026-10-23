import { t } from "../../../shared/i18n.ts";
import { usePanelStore } from "../../store/index.ts";

/**
 * Avisos efímeros con acción opcional ("Deshacer"), en una región `aria-live` siempre presente
 * para que los lectores de pantalla los anuncien (principio III).
 */
export function ToastRegion() {
  const toasts = usePanelStore((s) => s.toasts);
  const dismiss = usePanelStore((s) => s.dismissToast);
  return (
    <div className="toasts" role="region" aria-live="polite" aria-label={t("toasts_label")}>
      {toasts.map((toast) => (
        <div key={toast.id} className="toast">
          <span className="grow">{t(toast.messageKey, toast.params)}</span>
          {toast.actionKey && toast.onAction ? (
            <button
              type="button"
              onClick={() => {
                toast.onAction?.();
                dismiss(toast.id);
              }}
            >
              {t(toast.actionKey)}
            </button>
          ) : null}
          <button type="button" aria-label={t("action_dismiss")} onClick={() => dismiss(toast.id)}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
