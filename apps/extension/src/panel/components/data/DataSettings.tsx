import { useRef, useState } from "react";
import { t } from "../../../shared/i18n.ts";
import {
  parseImport,
  parseRequestly,
  readImportFile,
  rejectionText,
} from "../../import/run-import.ts";
import { usePanelStore } from "../../store/index.ts";
import { ConfirmDialog } from "../common/ConfirmDialog.tsx";
import { downloadText } from "../common/download.ts";
import { Switch } from "../common/Switch.tsx";
import { ImportPreviewDialog, type PendingImport } from "./ImportPreviewDialog.tsx";

/** Versión de Nahual para el campo `app` del archivo. */
const appVersion = () => globalThis.chrome?.runtime?.getManifest?.().version ?? "dev";

/**
 * Ajustes ⇒ Importar y exportar (007, US4, FR-026 a FR-033, contracts/panel-ui.md): resumen de lo
 * que viaja, descargar con los valores sensibles redactados salvo confirmación, e importar con
 * validación completa y vista previa. Un archivo rechazado se explica en línea (FR-004).
 */
export function DataSettings() {
  const rules = usePanelStore((s) => s.rules);
  const profiles = usePanelStore((s) => s.profiles);
  const origins = usePanelStore((s) => s.settings?.productionOrigins.length ?? 0);
  const relaxations = usePanelStore((s) => s.relaxations.length);
  const [includeSensitive, setIncludeSensitive] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingImport | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const requestlyInput = useRef<HTMLInputElement>(null);

  const sites = new Set(rules.map((r) => r.site)).size;
  const hooks = rules.filter((r) => r.action.kind === "hook").length;

  const download = async () => {
    const { exportConfig } = await import("@nahual/domain/portable");
    const store = usePanelStore.getState();
    const { text } = exportConfig(
      store.rules,
      store.profiles,
      store.settings ?? { productionOrigins: [] },
      {
        appVersion: appVersion(),
        includeSensitive,
        now: Date.now(),
      },
    );
    const name = `nahual-config-${new Date().toISOString().slice(0, 10)}.json`;
    downloadText(name, text, "application/json");
    store.pushToast({ messageKey: "export_downloaded", params: [name] });
    // Vale solo para esta exportación (FR-011).
    setIncludeSensitive(false);
  };

  const choose = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    const read = await readImportFile(file);
    if (!read.ok) {
      setError(t(read.errorKey));
      return;
    }
    const result = await parseImport(read.text);
    if (!result.ok) {
      setError(rejectionText(result));
      return;
    }
    setPending({
      source: "config",
      config: result.config,
      preview: result.preview,
      migratedFrom: result.migratedFrom,
    });
  };

  const chooseRequestly = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    const read = await readImportFile(file);
    if (!read.ok) {
      setError(t(read.errorKey));
      return;
    }
    const result = await parseRequestly(read.text);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setPending({
      source: "requestly",
      config: result.config,
      preview: result.preview,
      migratedFrom: null,
      unsupported: result.unsupported,
    });
  };

  return (
    <div className="data-settings">
      <section aria-labelledby="config-export-title">
        <h3 id="config-export-title">{t("config_export_title")}</h3>
        <p>
          {t("config_export_summary", [
            String(rules.length),
            String(sites),
            String(hooks),
            String(profiles.length),
            String(origins),
          ])}
        </p>
        {relaxations > 0 ? <p className="muted">{t("config_export_cors_note")}</p> : null}
        <div className="row">
          <Switch
            label={t("export_include_sensitive")}
            checked={includeSensitive}
            onChange={(checked) => (checked ? setConfirming(true) : setIncludeSensitive(false))}
          />
          <span className="grow" />
          <button type="button" onClick={() => void download()}>
            {t("config_download")}
          </button>
        </div>
      </section>
      <section aria-labelledby="config-import-title">
        <h3 id="config-import-title">{t("config_import")}</h3>
        <p className="muted">{t("config_import_hint")}</p>
        <div className="row">
          <button type="button" onClick={() => input.current?.click()}>
            {t("config_import")}
          </button>
          <button type="button" onClick={() => requestlyInput.current?.click()}>
            {t("requestly_import")}
          </button>
        </div>
        <p className="muted">{t("requestly_import_hint")}</p>
        <input
          ref={input}
          type="file"
          accept=".json,application/json"
          hidden
          aria-label={t("config_import")}
          onChange={(event) => {
            void choose(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
        <input
          ref={requestlyInput}
          type="file"
          accept=".json,application/json"
          hidden
          aria-label={t("requestly_import")}
          onChange={(event) => {
            void chooseRequestly(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
        {error ? (
          <p role="alert" className="field-error import-error">
            {error}
          </p>
        ) : null}
      </section>
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
      <ImportPreviewDialog pending={pending} onClose={() => setPending(null)} />
    </div>
  );
}
