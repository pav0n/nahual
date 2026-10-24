import { useRef, useState } from "react";
import { t } from "../../../shared/i18n.ts";
import { endRelaxation } from "../../cors-commands.ts";
import { ariaOf, labelOf } from "../../shortcuts.ts";
import { usePanelStore } from "../../store/index.ts";
import { Icon } from "../common/icons.tsx";
import { Countdown } from "../queue/Countdown.tsx";

/** `h:mm:ss` para la cuenta regresiva de una relajación (≤ 8 h). */
export function formatRemaining(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * Indicador "CORS relajado" en una línea de la franja (003 FR-019/020; 004 FR-013): orígenes,
 * estado, cuenta regresiva, reporte y "Apagar". Con varias relajaciones, "Orígenes" despliega la
 * lista encima del contenido, sin desplazarlo.
 */
export function RelaxIndicator({ onReport }: { onReport?: (apiOrigin: string) => void }) {
  const relaxations = usePanelStore((s) => s.relaxations);
  const [expanded, setExpanded] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  if (relaxations.length === 0) return null;
  const single = relaxations.length === 1 ? relaxations[0] : undefined;
  const soonest = relaxations.reduce((a, b) => (b.expiresAt < a.expiresAt ? b : a));
  const shortcut = labelOf("endRelaxations");

  return (
    <section className="strip-line relax-indicator" aria-labelledby="relax-indicator-title">
      <Icon name="relaxed" />
      <h2 id="relax-indicator-title">{t("cors_indicator_title")}</h2>
      <span className="grow">
        {single ? (
          <>
            <span className="mono">
              {t("cors_relax_scope_value", [single.appOrigin, single.apiOrigin])}
            </span>{" "}
            <span className={`relax-state relax-state-${single.state}`}>
              {t(`cors_state_${single.state}`)}
            </span>
          </>
        ) : (
          t("cors_indicator_count", String(relaxations.length))
        )}{" "}
        <Countdown
          expiresAt={soonest.expiresAt}
          totalMs={soonest.expiresAt - soonest.createdAt}
          messageKey="cors_expires_in"
          format={formatRemaining}
          announceEvery={600}
        />
      </span>
      {single && onReport ? (
        <button type="button" className="link" onClick={() => onReport(single.apiOrigin)}>
          {t("cors_report_action_short")}
        </button>
      ) : null}
      {single ? null : (
        <button
          ref={toggle}
          type="button"
          aria-expanded={expanded}
          aria-controls="relax-list"
          onClick={() => setExpanded(!expanded)}
        >
          {t("cors_indicator_origins", String(relaxations.length))}
        </button>
      )}
      <button
        type="button"
        aria-keyshortcuts={ariaOf("endRelaxations")}
        title={t("shortcut_hint", shortcut)}
        onClick={() => void endRelaxation()}
      >
        {t("cors_indicator_end_all")} <kbd>{shortcut}</kbd>
      </button>
      {!single && expanded ? (
        <ul id="relax-list" className="plain relax-list">
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
      ) : null}
    </section>
  );
}
