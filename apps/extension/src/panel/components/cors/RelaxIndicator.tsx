import { t } from "../../../shared/i18n.ts";
import { endRelaxation } from "../../cors-commands.ts";
import { usePanelStore } from "../../store/index.ts";
import { SHORTCUT_END_RELAXATIONS } from "../../use-shortcuts.ts";
import { Countdown } from "../queue/Countdown.tsx";
import { ariaOf } from "../../shortcuts.ts";

/** `h:mm:ss` para la cuenta regresiva de una relajación (≤ 8 h). */
export function formatRemaining(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * Indicador permanente "CORS relajado" (FR-019, FR-020): visible en todas las vistas mientras
 * haya una relajación en la pestaña, con orígenes, estado, cuenta regresiva y "Apagar".
 */
export function RelaxIndicator({ onReport }: { onReport?: (apiOrigin: string) => void }) {
  const relaxations = usePanelStore((s) => s.relaxations);
  if (relaxations.length === 0) return null;
  return (
    <section className="relax-indicator" aria-labelledby="relax-indicator-title">
      <div className="row">
        <h2 id="relax-indicator-title" className="grow">
          <span aria-hidden="true">⇄ </span>
          {t("cors_indicator_title")}
        </h2>
        <button
          type="button"
          aria-keyshortcuts={ariaOf("endRelaxations")}
          title={t("shortcut_hint", SHORTCUT_END_RELAXATIONS)}
          onClick={() => void endRelaxation()}
        >
          {t("cors_indicator_end_all")} <kbd>{SHORTCUT_END_RELAXATIONS}</kbd>
        </button>
      </div>
      <ul className="plain">
        {relaxations.map((r) => (
          <li key={r.id} className="relax-item">
            <span className="mono grow">
              {t("cors_relax_scope_value", [r.appOrigin, r.apiOrigin])}
            </span>
            <span className={`relax-state relax-state-${r.state}`}>
              {t(`cors_state_${r.state}`)}
            </span>
            <Countdown
              expiresAt={r.expiresAt}
              totalMs={r.expiresAt - r.createdAt}
              messageKey="cors_expires_in"
              format={formatRemaining}
              announceEvery={600}
            />
            {onReport ? (
              <button type="button" className="link" onClick={() => onReport(r.apiOrigin)}>
                {t("cors_report_action_short")}
              </button>
            ) : null}
            <button
              type="button"
              aria-label={t("cors_indicator_end_one", [r.apiOrigin])}
              onClick={() => void endRelaxation(r.id)}
            >
              {t("cors_indicator_end")}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
