import { t } from "../../../shared/i18n.ts";
import { EmptyState } from "../common/EmptyState.tsx";

/**
 * Sección Repeater (005, FR-003): pestañas con un request editable, su envío y su historial. Sin
 * pestañas, explica cómo crear una y que no se guardan al cerrar DevTools (FR-020a).
 */
export function RepeaterView() {
  return (
    <div className="pane">
      <EmptyState title={t("repeater_empty_title")}>{t("repeater_empty_body")}</EmptyState>
    </div>
  );
}
