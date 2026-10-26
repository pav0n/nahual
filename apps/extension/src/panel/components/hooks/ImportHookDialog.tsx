import { LIMITS, type HookFileConfig } from "@nahual/domain";
import { parseHookFile, type ParsedHookFile } from "@nahual/hook-runtime";
import { useId, useRef, useState } from "react";
import { t } from "../../../shared/i18n.ts";
import { command } from "../../commands.ts";
import { formatBytes } from "../../format.ts";
import { Dialog } from "../common/Dialog.tsx";

/** Lee un archivo `.ts` de hasta 100 KB como UTF-8 estricto (FR-038). */
export async function readHookFile(
  file: File,
): Promise<{ ok: true; text: string } | { ok: false; reasonKey: string }> {
  if (file.size > LIMITS.hookSourceBytesMax) return { ok: false, reasonKey: "hook_file_too_large" };
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
    return { ok: true, text };
  } catch {
    return { ok: false, reasonKey: "hook_file_not_text" };
  }
}

function ConfigSummary({ config }: { config: HookFileConfig }) {
  return (
    <dl className="summary import-config">
      <div>
        <dt>{t("rule_name")}</dt>
        <dd>{config.name}</dd>
      </div>
      <div>
        <dt>{t("rule_stage")}</dt>
        <dd>{t(`stage_${config.stage}`)}</dd>
      </div>
      <div>
        <dt>{t("rule_prefilter")}</dt>
        <dd className="mono">{config.prefilter.pattern}</dd>
      </div>
      <div>
        <dt>{t("hook_import_types")}</dt>
        <dd>
          {config.resourceTypes.length > 0
            ? config.resourceTypes.join(", ")
            : t("hook_import_all_types")}
        </dd>
      </div>
      <div>
        <dt>{t("rule_conditions")}</dt>
        <dd>{String(config.conditions.length)}</dd>
      </div>
    </dl>
  );
}

/**
 * "Importar hook…" (006, FR-036 a FR-038, contracts/panel-ui.md): elige un `.ts`, lo rechaza con
 * motivo si no vale y, si vale, muestra la configuración y el código completo como texto (sin
 * ejecutar nada) antes de crear una regla nueva y desactivada.
 */
export function ImportHookButton({ disabled = false }: { disabled?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<ParsedHookFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<string | null>(null);
  const describedBy = useId();

  const choose = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setIssues(null);
    const read = await readHookFile(file);
    if (!read.ok) {
      setError(t(read.reasonKey, formatBytes(LIMITS.hookSourceBytesMax)));
      return;
    }
    setParsed(parseHookFile(read.text));
  };

  const confirm = async () => {
    if (!parsed) return;
    const reply = await command("importHook", {
      config: parsed.config as Record<string, unknown> | null,
      source: parsed.source,
    });
    if (reply.ok) setParsed(null);
    else setIssues(t(reply.issues[0]?.messageKey ?? reply.messageKey));
  };

  return (
    <>
      <button type="button" disabled={disabled} onClick={() => input.current?.click()}>
        {t("hook_import")}
      </button>
      <input
        ref={input}
        type="file"
        accept=".ts,text/plain"
        hidden
        aria-label={t("hook_import")}
        onChange={(event) => {
          void choose(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      {error ? (
        <p role="alert" className="field-error import-error">
          {error}
        </p>
      ) : null}
      <Dialog
        open={parsed !== null}
        title={t("hook_import_title")}
        onClose={() => setParsed(null)}
        describedBy={describedBy}
        className="import-dialog"
      >
        {parsed ? (
          <div className="import-preview">
            <p id={describedBy} className="field-warning">
              {t("hook_import_disabled_note")}
            </p>
            {parsed.config ? (
              <ConfigSummary config={parsed.config} />
            ) : (
              <p className="muted">{t(parsed.configError)}</p>
            )}
            <pre className="import-code" aria-label={t("hook_import_code")} tabIndex={0}>
              {parsed.source.split("\n").map((line, i) => (
                <span key={i} className="import-line">
                  <span className="import-line-number" aria-hidden="true">
                    {i + 1}
                  </span>
                  {line}
                  {"\n"}
                </span>
              ))}
            </pre>
            {issues ? (
              <p role="alert" className="field-error">
                {issues}
              </p>
            ) : null}
            <div className="row">
              <button type="button" className="primary" onClick={() => void confirm()}>
                {t("hook_import_confirm")}
              </button>
              <button type="button" onClick={() => setParsed(null)}>
                {t("action_cancel")}
              </button>
            </div>
          </div>
        ) : null}
      </Dialog>
    </>
  );
}
