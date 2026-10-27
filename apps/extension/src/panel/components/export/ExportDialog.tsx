import {
  EXPORT_FORMATS,
  FORMATS,
  formatAvailability,
  type ExportFormat,
  type ExportResult,
  type ExportSource,
} from "@nahual/domain/export";
import { Suspense, lazy, useEffect, useId, useMemo, useState } from "react";
import { t } from "../../../shared/i18n.ts";
import {
  repeaterExportSource,
  trafficExportSources,
  type SelectionOmission,
} from "../../export/build-source.ts";
import { loadBody, runExport } from "../../export/run-export.ts";
import { usePanelStore } from "../../store/index.ts";
import type { ExportRequest } from "../../store/ui.ts";
import { uiPrefs } from "../../ui-prefs.ts";
import { copyText } from "../common/clipboard.ts";
import { ConfirmDialog } from "../common/ConfirmDialog.tsx";
import { Dialog } from "../common/Dialog.tsx";
import { downloadText } from "../common/download.ts";
import { EmptyState } from "../common/EmptyState.tsx";
import { Icon } from "../common/icons.tsx";
import { Switch } from "../common/Switch.tsx";
import { Tabs } from "../common/Tabs.tsx";

// El visor va en el chunk de CodeMirror: nada de esto entra en la carga inicial del panel.
const CodeView = lazy(() => import("./CodeView.tsx"));

const PREFIX = "export-format";
const LANGUAGE: Record<ExportFormat, "typescript" | "json" | "text"> = {
  curl: "text",
  fetch: "typescript",
  vitest: "typescript",
  msw: "typescript",
  zod: "typescript",
  postman: "json",
};
const MIME: Record<ExportFormat, string> = {
  curl: "text/x-shellscript",
  fetch: "text/typescript",
  vitest: "text/typescript",
  msw: "text/typescript",
  zod: "text/typescript",
  postman: "application/json",
};

interface Loaded {
  sources: ExportSource[];
  /** Id del intercambio de cada fuente (Tráfico), para nombrar los omitidos. */
  exchangeIds: string[];
  omitted: SelectionOmission[];
}

const endpoint = (method: string, url: string) => {
  try {
    return `${method} ${new URL(url).pathname}`;
  } catch {
    return `${method} ${url}`;
  }
};

/** Formatos que se ofrecen: los seis para un request; los de lote para varios (FR-016c). */
const formatsFor = (batch: boolean) => EXPORT_FORMATS.filter((f) => !batch || FORMATS[f].batch);

/** Formato elegido, o el recordado si se ofrece, o el primero (FR-018). */
function pickFormat(
  chosen: ExportFormat | null,
  remembered: ExportFormat,
  batch: boolean,
): ExportFormat {
  if (chosen) return chosen;
  const offered = formatsFor(batch);
  return offered.includes(remembered) ? remembered : (offered[0] ?? "curl");
}

/** Título del diálogo, del store y sin esperar a los bodies. */
function titleOf(request: ExportRequest | null): string {
  const store = usePanelStore.getState();
  if (request?.kind === "repeater") {
    const tab = store.repeaterTabs.find((x) => x.id === request.tabId);
    return tab ? t("export_dialog_title", endpoint(tab.draft.method, tab.draft.url)) : "";
  }
  if (request?.kind === "traffic") {
    const first = store.exchanges.find((e) => e.id === request.exchangeIds[0]);
    if (request.exchangeIds.length === 1 && first)
      return t("export_dialog_title", endpoint(first.method, first.url));
    return t("export_dialog_title_many", String(request.exchangeIds.length));
  }
  return t("action_export_as");
}

/** Fuente del repeater: síncrona (el request en edición y la respuesta mostrada). */
function repeaterLoaded(request: Extract<ExportRequest, { kind: "repeater" }>): Loaded {
  const tab = usePanelStore.getState().repeaterTabs.find((x) => x.id === request.tabId);
  if (!tab) return { sources: [], exchangeIds: [], omitted: [] };
  const send =
    tab.sends.find((s) => s.sendId === request.sendId) ?? tab.sends.find((s) => s.response) ?? null;
  return {
    sources: [repeaterExportSource(tab.draft, send?.response ?? null, send?.startedAt ?? 0)],
    exchangeIds: [],
    omitted: [],
  };
}

/**
 * Contenido de una apertura del diálogo. Se monta de nuevo con cada "Exportar como…" (`key`), así
 * que "Incluir valores sensibles" y el formato elegido empiezan limpios (FR-011).
 */
function ExportBody({ request, statusId }: { request: ExportRequest; statusId: string }) {
  const site = usePanelStore((s) => s.session?.site ?? null);
  const pushToast = usePanelStore((s) => s.pushToast);
  const [loaded, setLoaded] = useState<Loaded | null>(() =>
    request.kind === "repeater" ? repeaterLoaded(request) : null,
  );
  const [progress, setProgress] = useState<[number, number] | null>(null);
  const [chosen, setChosen] = useState<ExportFormat | null>(
    request.kind === "traffic" ? (request.format ?? null) : null,
  );
  const [remembered] = useState(() => uiPrefs().get().exportFormat);
  const [includeSensitive, setIncludeSensitive] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (request.kind !== "traffic") return;
    let cancelled = false;
    const store = usePanelStore.getState();
    const selected = request.exchangeIds.flatMap((id) => {
      const found = store.exchanges.find((e) => e.id === id);
      return found ? [found] : [];
    });
    void trafficExportSources(selected, loadBody, (done, total) => {
      if (!cancelled) setProgress([done, total]);
    }).then((result) => {
      if (!cancelled) setLoaded(result);
    });
    return () => {
      cancelled = true;
    };
  }, [request]);

  const sources = useMemo(() => loaded?.sources ?? [], [loaded]);
  const batch =
    sources.length > 1 || (request.kind === "traffic" && request.exchangeIds.length > 1);
  const formats = formatsFor(batch);
  const format = pickFormat(chosen, remembered, batch);
  const availability = sources.length ? formatAvailability(format, sources) : null;

  // Sin memo: el cuerpo solo se vuelve a pintar con su propio estado (no sigue el tráfico), así
  // que el código se genera al cambiar formato, inclusión o fuentes.
  const result: ExportResult | null =
    availability?.ok === true ? runExport(format, sources, includeSensitive, site) : null;

  if (!loaded)
    return (
      <p className="muted" role="status">
        {progress
          ? t("export_loading_bodies", [String(progress[0]), String(progress[1])])
          : t("export_generating")}
      </p>
    );
  if (sources.length === 0)
    return <EmptyState title={t("export_nothing")}>{t("export_nothing_hint")}</EmptyState>;

  const choose = (next: ExportFormat) => {
    setChosen(next);
    uiPrefs().update({ exportFormat: next });
  };
  const copy = async () => {
    if (!result) return;
    const outcome = await copyText(result.code, null);
    pushToast({ messageKey: outcome === "copied" ? "export_copied" : "export_copy_manual" });
  };
  const download = () => {
    if (!result) return;
    downloadText(result.fileName, result.code, MIME[format]);
    pushToast({ messageKey: "export_downloaded", params: [result.fileName] });
  };
  const name = (exchangeId: string) => {
    const e = usePanelStore.getState().exchanges.find((x) => x.id === exchangeId);
    return e ? endpoint(e.method, e.url) : exchangeId;
  };
  const omissions = [
    ...loaded.omitted.map((o) => ({ label: name(o.exchangeId), reasonKey: o.reasonKey })),
    ...(result?.omitted ?? []).map((o) => ({
      label: name(loaded.exchangeIds[o.index] ?? ""),
      reasonKey: o.reasonKey,
    })),
  ];
  const nonJsonBody = sources.some(
    (s) => s.request.body.kind === "text" && !/json/i.test(s.request.body.contentType ?? "json"),
  );

  return (
    <>
      <Tabs
        idPrefix={PREFIX}
        label={t("export_formats_label")}
        tabs={formats.map((f) => ({ id: f, label: t(`export_format_${f}`) }))}
        selected={format}
        onSelect={choose}
      />
      <div
        role="tabpanel"
        id={`${PREFIX}-panel-${format}`}
        aria-labelledby={`${PREFIX}-tab-${format}`}
        className="export-panel"
      >
        {availability && !availability.ok ? (
          <EmptyState title={t(availability.reasonKey)} />
        ) : result ? (
          <Suspense fallback={<p className="muted">{t("export_generating")}</p>}>
            <CodeView
              code={result.code}
              language={LANGUAGE[format]}
              label={t(`export_format_${format}`)}
            />
          </Suspense>
        ) : null}
      </div>
      <div id={statusId} className="export-status" role="status">
        <span className={result?.redacted.length ? "field-warning" : "muted"}>
          {result?.redacted.length
            ? t("export_redacted_count", String(result.redacted.length))
            : t("export_redacted_none")}
        </span>
        {result?.merged.length ? (
          <span className="muted">
            {t("export_merged", String(result.merged.reduce((sum, m) => sum + m.count, 0)))}
          </span>
        ) : null}
        {nonJsonBody && !includeSensitive ? (
          <span className="muted">{t("export_non_json_note")}</span>
        ) : null}
      </div>
      {omissions.length ? (
        <details className="export-omitted">
          <summary>{t("export_omitted", String(omissions.length))}</summary>
          <ul>
            {omissions.map((o, i) => (
              <li key={i}>
                <span className="mono">{o.label}</span> · {t(o.reasonKey)}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      <div className="row export-actions">
        <Switch
          label={t("export_include_sensitive")}
          checked={includeSensitive}
          onChange={(checked) => (checked ? setConfirming(true) : setIncludeSensitive(false))}
        />
        <span className="grow" />
        <button type="button" disabled={!result} onClick={() => void copy()}>
          <Icon name="copy" />
          {t("export_copy")}
        </button>
        <button type="button" className="primary" disabled={!result} onClick={download}>
          <Icon name="download" />
          {t("export_download")}
        </button>
      </div>
      <ConfirmDialog
        open={confirming}
        title={t("export_include_sensitive_confirm_title")}
        body={t("export_include_sensitive_confirm_body")}
        confirmLabel={t("export_include_sensitive_confirm_ok")}
        onConfirm={() => {
          setIncludeSensitive(true);
          setConfirming(false);
        }}
        onCancel={() => setConfirming(false)}
      />
    </>
  );
}

/**
 * "Exportar como…" (007, US1, contracts/panel-ui.md): vista previa del código con el editor de
 * 006 en solo lectura, formato en pestañas, valores sensibles redactados salvo confirmación, y
 * "Copiar" y "Descargar" con el mismo código que se ve (FR-009, FR-010, FR-011). Este módulo se
 * carga con `lazy()` la primera vez que se exporta: los exportadores no van en la carga inicial.
 */
export default function ExportDialog() {
  const request = usePanelStore((s) => s.exportRequest);
  const seq = usePanelStore((s) => s.exportSeq);
  const close = usePanelStore((s) => s.closeExport);
  const statusId = useId();
  return (
    <Dialog
      open={request !== null}
      title={titleOf(request)}
      onClose={close}
      describedBy={statusId}
      className="import-dialog export-dialog"
    >
      <div className="import-preview">
        {request ? <ExportBody key={seq} request={request} statusId={statusId} /> : null}
      </div>
    </Dialog>
  );
}
