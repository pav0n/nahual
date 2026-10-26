import { t } from "../../../shared/i18n.ts";
import { usePanelStore } from "../../store/index.ts";
import { Icon } from "../common/icons.tsx";

/**
 * Contador de errores de hooks en la barra superior, como el de DevTools (006, FR-028): icono de
 * error y número; un clic abre la consola filtrada a errores. Sin errores sin leer no aparece.
 */
export function HookErrorCounter() {
  const unread = usePanelStore((s) => s.hookUnreadErrors);
  if (unread === 0) return null;
  return (
    <button
      type="button"
      className="icon-button hook-error-counter"
      aria-label={t("hook_errors_unread", String(unread))}
      title={t("hook_errors_unread", String(unread))}
      onClick={() => {
        const store = usePanelStore.getState();
        store.setHookConsoleLevel("error");
        store.setDrawerExpanded(true);
      }}
    >
      <Icon name="error" />
      <span aria-hidden="true">{unread}</span>
    </button>
  );
}
