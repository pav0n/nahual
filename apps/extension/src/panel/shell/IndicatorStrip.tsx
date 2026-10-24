import { useEffect, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { t } from "../../shared/i18n.ts";
import { Icon } from "../components/common/icons.tsx";
import { IconButton } from "../components/common/IconButton.tsx";
import { RelaxIndicator } from "../components/cors/RelaxIndicator.tsx";
import { updateSettings } from "../settings-commands.ts";
import { ariaOf, labelOf } from "../shortcuts.ts";
import { usePanelStore } from "../store/index.ts";
import { stripItems, type StripLine } from "./strip.ts";

function NoticeLine({ line }: { line: StripLine }) {
  const setError = usePanelStore((s) => s.setError);
  const dismiss = usePanelStore((s) => s.dismissNotice);
  const error = line.kind === "error";
  const text = error ? t(line.error.messageKey) : t(line.notice.messageKey, line.notice.params);
  return (
    <div className="strip-line" data-kind={error ? "error" : "notice"}>
      <Icon name="warning" />
      {/* Errores como alerta; avisos como estado (R9): ambos se anuncian a los lectores. */}
      <span role={error ? "alert" : "status"} className="grow">
        {text}
      </span>
      <IconButton
        icon="close"
        label={t("action_dismiss")}
        onClick={() => (error ? setError(null) : dismiss(line.notice.id))}
      />
    </div>
  );
}

const lineKey = (line: StripLine) =>
  line.kind === "error" ? "error" : `notice-${String(line.notice.id)}`;

/**
 * Franja de indicadores bajo la barra (004, FR-013/013a, research R9): Nahual en pausa, CORS
 * relajado y los avisos, en ese orden y una línea cada uno. Con más de 2 avisos, una línea
 * "N avisos" los despliega encima del contenido, sin moverlo. Sin nada que mostrar no ocupa espacio.
 */
export function IndicatorStrip() {
  const input = usePanelStore(
    useShallow((s) => ({
      globalPaused: s.settings?.globalPaused ?? false,
      relaxationCount: s.relaxations.length,
      notices: s.notices,
      lastError: s.lastError,
    })),
  );
  const openReport = usePanelStore((s) => s.openReport);
  const [expanded, setExpanded] = useState(false);
  const noticesRef = useRef<HTMLDivElement>(null);

  // La lista desplegada se cierra con un clic fuera o con Escape, como un menú.
  useEffect(() => {
    if (!expanded) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!noticesRef.current?.contains(event.target as Node)) setExpanded(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [expanded]);
  const items = stripItems(input);
  if (items.length === 0) return null;
  const shortcut = labelOf("togglePauseNahual");

  const lines = items.flatMap((item) =>
    item.kind === "notice" || item.kind === "error" ? [item] : [],
  );
  const group = items.find((item) => item.kind === "group");

  return (
    <div className="strip" role="region" aria-label={t("strip_label")}>
      {input.globalPaused ? (
        <div className="strip-line strip-pause">
          <Icon name="paused" />
          <span className="grow">{t("status_global_paused")}</span>
          <button
            type="button"
            aria-keyshortcuts={ariaOf("togglePauseNahual")}
            onClick={() => void updateSettings({ globalPaused: false })}
          >
            {t("action_resume")} <kbd>{shortcut}</kbd>
          </button>
        </div>
      ) : null}
      <RelaxIndicator onReport={openReport} />
      {lines.length > 0 || group ? (
        <div
          ref={noticesRef}
          className="notices"
          onKeyDown={(event) => {
            if (event.key !== "Escape" || !expanded) return;
            // Tampoco llega a DevTools (research D2).
            event.stopPropagation();
            setExpanded(false);
          }}
        >
          {lines.map((line) => (
            <NoticeLine key={lineKey(line)} line={line} />
          ))}
          {group?.kind === "group" ? (
            <>
              <div className="strip-line" data-kind="notice">
                <Icon name="warning" />
                <button
                  type="button"
                  aria-expanded={expanded}
                  aria-controls="notice-group"
                  onClick={() => setExpanded(!expanded)}
                >
                  {t("notices_count", String(group.count))}
                </button>
              </div>
              <div id="notice-group" className="notice-group" hidden={!expanded}>
                {group.items.map((line) => (
                  <NoticeLine key={lineKey(line)} line={line} />
                ))}
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
