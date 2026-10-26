import type { ImportPreview, PortableConfigV1 } from "@nahual/domain/portable";
import { Suspense, lazy, useEffect, useId, useState } from "react";
import { t } from "../../../shared/i18n.ts";
import { confirmImport, reviewHooks, type HookReview } from "../../import/run-import.ts";
import { Dialog } from "../common/Dialog.tsx";

// El visor va en el chunk de CodeMirror, como en "Exportar como…".
const CodeView = lazy(() => import("../export/CodeView.tsx"));

export interface PendingImport {
  source: "config" | "requestly";
  config: PortableConfigV1;
  preview: ImportPreview;
  migratedFrom: number | null;
  /** Solo Requestly: reglas que no se importan, con su motivo (FR-036). */
  unsupported?: { name: string; reasonKey: string }[];
}

interface Props {
  pending: PendingImport | null;
  onClose(): void;
}

/**
 * Vista previa de una importación (007, FR-030, FR-032, contracts/panel-ui.md): qué reglas,
 * perfiles, hooks (su código como texto, sin ejecutar nada) y orígenes de producción se añaden,
 * qué perfiles se renombran y, de Requestly, qué no se importa. Mismo patrón que importar un hook
 * en 006.
 */
export function ImportPreviewDialog({ pending, onClose }: Props) {
  const describedBy = useId();
  return (
    <Dialog
      open={pending !== null}
      title={t(
        pending?.source === "requestly" ? "requestly_import" : "config_import_preview_title",
      )}
      onClose={onClose}
      describedBy={describedBy}
      className="import-dialog"
    >
      {pending ? <Preview pending={pending} describedBy={describedBy} onClose={onClose} /> : null}
    </Dialog>
  );
}

function Preview({
  pending,
  describedBy,
  onClose,
}: {
  pending: PendingImport;
  describedBy: string;
  onClose(): void;
}) {
  const { config, preview, unsupported = [] } = pending;
  const [reviews, setReviews] = useState<HookReview[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void reviewHooks(config).then((result) => {
      if (!cancelled) setReviews(result);
    });
    return () => {
      cancelled = true;
    };
  }, [config]);

  const confirm = async () => {
    if (!reviews) return;
    const reply = await confirmImport(config, pending.source, reviews);
    if (reply.ok) onClose();
    else setError(t(reply.issues[0]?.messageKey ?? reply.messageKey, reply.issues[0]?.path ?? ""));
  };

  const reviewOf = (ruleId: string) => reviews?.find((r) => r.ruleId === ruleId);

  return (
    <div className="import-preview">
      <p id={describedBy} className="field-warning">
        {t("config_import_hint")}
      </p>
      {pending.migratedFrom !== null ? <p className="muted">{t("config_migrated")}</p> : null}
      {config.sites.map((site) => {
        const summary = preview.sites.find((s) => s.site === site.site);
        return (
          <section key={site.site} className="import-site" aria-label={site.site}>
            <h3 className="mono">{site.site}</h3>
            {summary?.renamedProfiles.length ? (
              <p className="muted">
                {summary.renamedProfiles
                  .map((name) => t("config_profile_renamed", name))
                  .join(" · ")}
              </p>
            ) : null}
            {site.profiles.length ? (
              <p>
                {t("profile_settings_title")}:{" "}
                {site.profiles.map((p) => (
                  <span key={p.id} className="tag profile-tag">
                    {p.name}
                  </span>
                ))}
              </p>
            ) : null}
            <ul className="plain rule-list">
              {site.rules.map((rule) => {
                const review = reviewOf(rule.id);
                const errors =
                  review?.result.diagnostics.filter((d) => d.severity === "error") ?? [];
                return (
                  <li key={rule.id} className="rule-item">
                    <div className="row">
                      <strong className="grow">{rule.name}</strong>
                      <span className="muted">
                        {t(`stage_${rule.stage}`)} · {rule.action.kind}
                      </span>
                    </div>
                    {config.redacted.rules.includes(rule.id) ? (
                      <p className="field-warning">{t("config_rule_redacted")}</p>
                    ) : null}
                    {rule.action.kind === "hook" ? (
                      <>
                        <Suspense fallback={<p className="muted">{t("export_generating")}</p>}>
                          <CodeView
                            code={rule.action.source}
                            language="typescript"
                            label={`${t("hook_import_code")}: ${rule.name}`}
                          />
                        </Suspense>
                        {errors.length ? (
                          <p className="field-warning">{t("hook_error_not_checked")}</p>
                        ) : null}
                      </>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
      {config.productionOrigins.length ? (
        <section aria-label={t("settings_section_cors")}>
          <h3>{t("settings_section_cors")}</h3>
          <ul className="plain production-list">
            {config.productionOrigins.map((origin) => (
              <li key={origin} className="row">
                <span className="mono grow">{origin}</span>
                <span className="tag">
                  {t(
                    preview.productionOrigins.new.includes(origin)
                      ? "config_origin_new"
                      : "config_origin_existing",
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {unsupported.length ? (
        <details open className="import-unsupported">
          <summary>{t("requestly_unsupported_title", String(unsupported.length))}</summary>
          <ul>
            {unsupported.map((u, i) => (
              <li key={i}>
                <strong>{u.name}</strong> · {t(u.reasonKey)}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {error ? (
        <p role="alert" className="field-error">
          {error}
        </p>
      ) : null}
      <div className="row">
        <button
          type="button"
          className="primary"
          disabled={reviews === null}
          onClick={() => void confirm()}
        >
          {t("config_import_confirm")}
        </button>
        <button type="button" onClick={onClose}>
          {t("action_cancel")}
        </button>
      </div>
    </div>
  );
}
