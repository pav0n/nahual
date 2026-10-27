import { t } from "../../../shared/i18n.ts";
import { usePanelStore } from "../../store/index.ts";

const NO_TOASTS: readonly never[] = [];

/**
 * Avisos efímeros con acción opcional ("Deshacer"), en una región `aria-live` siempre presente
 * para que los lectores de pantalla los anuncien (principio III).
 */
export function ToastRegion({ dialogId }: { dialogId?: string } = {}) {
  const dismiss = usePanelStore((s) => s.dismissToast);
  // 007: con un diálogo modal abierto, los avisos van dentro del de arriba (fuera serían inertes);
  // la región del panel sigue presente pero vacía.
  const toasts = usePanelStore((s) => {
    const top = s.openDialogs.at(-1);
    const here = dialogId === undefined ? top === undefined : top === dialogId;
    return here ? s.toasts : NO_TOASTS;
  });
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
