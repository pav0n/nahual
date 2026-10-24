import { FRAMEWORKS, buildCorsReport, renderCorsReport, type Framework } from "@nahual/domain";
import { useMemo, useRef, useState } from "react";
import { t } from "../../../shared/i18n.ts";
import { usePanelStore } from "../../store/index.ts";
import { Dialog } from "../common/Dialog.tsx";
import { EmptyState } from "../common/EmptyState.tsx";

type CopyState = "idle" | "copied" | "manual";

/**
 * Copia dentro del gesto del usuario (research R14): `navigator.clipboard` y, si DevTools lo
 * bloquea, `execCommand("copy")` sobre el texto seleccionado. Sin permiso `clipboardWrite`.
 */
async function copyText(text: string, area: HTMLTextAreaElement | null): Promise<CopyState> {
  try {
    await navigator.clipboard.writeText(text);
    return "copied";
  } catch {
    if (!area) return "manual";
    area.focus();
    area.select();
    try {
      return document.execCommand("copy") ? "copied" : "manual";
    } catch {
      return "manual";
    }
  }
}

/**
 * Reporte para backend (historia 3): lo que el servidor debe permitir, con ejemplo opcional por
 * framework, aviso de que la relajación solo existe en este navegador y "Copiar" (FR-032–037).
 */
export function CorsReportDialog() {
  const apiOrigin = usePanelStore((s) => s.reportApiOrigin);
  const exchanges = usePanelStore((s) => s.exchanges);
  const close = usePanelStore((s) => s.closeReport);
  const [framework, setFramework] = useState<Framework | "">("");
  const [copy, setCopy] = useState<CopyState>("idle");
  const area = useRef<HTMLTextAreaElement>(null);

  const onClose = () => {
    setCopy("idle");
    close();
  };

  const report = useMemo(
    () => (apiOrigin === null ? null : buildCorsReport(exchanges, apiOrigin)),
    [exchanges, apiOrigin],
  );
  const text = report
    ? renderCorsReport(report, { t, ...(framework === "" ? {} : { framework }) })
    : "";

  return (
    <Dialog
      open={apiOrigin !== null}
      className="report"
      title={t("cors_report_dialog_title", apiOrigin ?? "")}
      onClose={onClose}
      closeButton={false}
    >
      {report && report.exchangeCount > 0 ? (
        <>
          <p className="warning">{t("cors_report_warning")}</p>
          <label className="field">
            <span>{t("cors_report_framework")}</span>
            <select
              value={framework}
              onChange={(e) => setFramework(e.target.value as Framework | "")}
            >
              <option value="">{t("cors_report_framework_none")}</option>
              {FRAMEWORKS.map((fw) => (
                <option key={fw} value={fw}>
                  {t(`cors_framework_${fw}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>{t("cors_report_text")}</span>
            <textarea ref={area} className="mono report-text" readOnly rows={14} value={text} />
          </label>
          <p className="muted" aria-live="polite">
            {copy === "copied"
              ? t("cors_report_copied")
              : copy === "manual"
                ? t("cors_report_copy_manual")
                : ""}
          </p>
        </>
      ) : (
        <EmptyState title={t("cors_report_empty_title")}>{t("cors_report_empty_body")}</EmptyState>
      )}
      <div className="row">
        {report && report.exchangeCount > 0 ? (
          <button
            type="button"
            className="primary"
            onClick={() => void copyText(text, area.current).then(setCopy)}
          >
            {t("cors_report_copy")}
          </button>
        ) : null}
        <button type="button" onClick={onClose}>
          {t("action_close")}
        </button>
      </div>
    </Dialog>
  );
}
