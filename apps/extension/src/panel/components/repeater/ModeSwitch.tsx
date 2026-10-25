import type { RepeaterMode } from "@nahual/domain";
import { t } from "../../../shared/i18n.ts";
import { ToggleButton } from "../common/ToggleButton.tsx";

/**
 * Modo de envío, visible siempre (FR-009): contexto de página (cookies y origen de la pestaña) o
 * contexto limpio (sin sesión). Sin sesión adjunta, el de página se deshabilita con motivo y
 * solución (FR-012).
 */
export function ModeSwitch({
  mode,
  unavailable,
  site,
  onChange,
}: {
  mode: RepeaterMode;
  /** Por qué el contexto de página no está disponible, si no lo está. */
  unavailable: "not_attached" | "other_site" | null;
  site: string | null;
  onChange(mode: RepeaterMode): void;
}) {
  const pageAvailable = unavailable === null;
  return (
    <div className="repeater-mode" role="group" aria-label={t("repeater_mode_label")}>
      <ToggleButton
        pressed={mode === "page"}
        disabled={!pageAvailable}
        aria-describedby={pageAvailable ? undefined : "repeater-page-unavailable"}
        onChange={() => onChange("page")}
        title={t("repeater_mode_page_hint")}
      >
        {t("repeater_mode_page")}
      </ToggleButton>
      <ToggleButton
        pressed={mode === "clean"}
        onChange={() => onChange("clean")}
        title={t("repeater_mode_clean_hint")}
      >
        {t("repeater_mode_clean")}
      </ToggleButton>
      {pageAvailable ? null : (
        <span id="repeater-page-unavailable" className="field-warning">
          {unavailable === "other_site"
            ? t("repeater_page_other_site", site ?? "")
            : t("repeater_page_unavailable")}
        </span>
      )}
    </div>
  );
}
