import { matchProductionOrigin, type CapturedExchange, type CorsDiagnosis } from "@nahual/domain";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { t } from "../../../shared/i18n.ts";
import { usePanelStore } from "../../store/index.ts";
import { HeaderList } from "./HeaderList.tsx";
import { RelaxForm } from "./RelaxForm.tsx";

/** Referencia estable: un `[]` nuevo en el selector haría renderizar en bucle. */
const NO_ORIGINS: readonly string[] = [];

interface Props {
  exchange: CapturedExchange;
  /** Intercambio relacionado: el preflight de un request o el request de un preflight (FR-006). */
  relatedId: string | null;
  onOpen(id: string): void;
  /** Acciones que añaden otras historias (relajar, reporte). */
  children?: ReactNode;
}

interface Difference {
  name: string;
  expected: string;
  received: string;
}

const serverValue = (d: CorsDiagnosis, name: string) =>
  d.serverCorsHeaders.find((h) => h.name.toLowerCase() === name)?.value ?? t("cors_missing");

/** Header o status que el servidor debe cambiar, con lo esperado y lo recibido (FR-005). */
function differenceOf(d: CorsDiagnosis): Difference | null {
  const origin = d.appOrigin ?? "null";
  switch (d.cause) {
    case "missing_allow_origin":
    case "origin_mismatch":
    case "wildcard_with_credentials":
      return {
        name: "Access-Control-Allow-Origin",
        expected: origin,
        received: serverValue(d, "access-control-allow-origin"),
      };
    case "missing_allow_credentials":
      return {
        name: "Access-Control-Allow-Credentials",
        expected: "true",
        received: serverValue(d, "access-control-allow-credentials"),
      };
    case "method_not_allowed":
      return {
        name: "Access-Control-Allow-Methods",
        expected: d.method,
        received: serverValue(d, "access-control-allow-methods"),
      };
    case "header_not_allowed":
      return {
        name: "Access-Control-Allow-Headers",
        expected:
          d.failedParameter && d.failedParameter !== "*"
            ? d.failedParameter
            : d.requestedHeaders.join(", ") || "*",
        received: serverValue(d, "access-control-allow-headers"),
      };
    case "preflight_status":
    case "preflight_redirect":
      return {
        name: t("cors_preflight_status"),
        expected: "2xx",
        received: d.preflightStatus === null ? t("cors_not_observed") : String(d.preflightStatus),
      };
    case "unrecognized":
      return null;
  }
}

/** Motivo para no ofrecer relajar (FR-007), con la lista de producción vigente (FR-029). */
export function notRelaxableReason(
  d: CorsDiagnosis,
  productionOrigins: readonly string[],
): { key: string; params?: string[] } | null {
  if (!d.relaxable) return { key: `cors_not_relaxable_${d.notRelaxableReason ?? "unrecognized"}` };
  for (const origin of [d.appOrigin, d.apiOrigin]) {
    const entry = origin ? matchProductionOrigin(origin, productionOrigins) : null;
    if (entry) return { key: "cors_not_relaxable_production", params: [entry] };
  }
  return null;
}

/**
 * Sección CORS del detalle (historia 1): causa en lenguaje claro y su solución, qué pidió la app
 * y qué respondió el servidor, y el preflight relacionado. Todo como texto.
 */
export function CorsSection({ exchange, relatedId, onOpen, children }: Props) {
  const productionOrigins = usePanelStore((s) => s.settings?.productionOrigins ?? NO_ORIGINS);
  const diagnosis = exchange.cors?.diagnosis;
  const relaxed = exchange.cors?.relaxed;
  const active = usePanelStore((s) =>
    diagnosis
      ? s.relaxations.find(
          (r) => r.apiOrigin === diagnosis.apiOrigin && r.appOrigin === diagnosis.appOrigin,
        )
      : undefined,
  );
  const [relaxing, setRelaxing] = useState(false);
  const openReport = usePanelStore((s) => s.openReport);
  const relaxButton = useRef<HTMLButtonElement>(null);
  const activeText = useRef<HTMLParagraphElement>(null);
  const focusAfter = useRef<"button" | "active" | null>(null);

  useEffect(() => {
    if (focusAfter.current === "button") relaxButton.current?.focus();
    if (focusAfter.current === "active") activeText.current?.focus();
    focusAfter.current = null;
  });
  const related = relatedId ? (
    <p>
      <button type="button" className="link" onClick={() => onOpen(relatedId)}>
        {t(exchange.isPreflight ? "cors_open_request" : "cors_open_preflight")}
      </button>
    </p>
  ) : null;
  if (!diagnosis && !relaxed && !children) {
    return related ? (
      <section className="cors" aria-labelledby="cors-title">
        <h3 id="cors-title">{t("cors_section_title")}</h3>
        {related}
      </section>
    ) : null;
  }
  const difference = diagnosis ? differenceOf(diagnosis) : null;
  const blocked = diagnosis ? notRelaxableReason(diagnosis, productionOrigins) : null;
  const param = diagnosis?.failedParameter ?? "";
  return (
    <section className="cors" aria-labelledby="cors-title">
      <h3 id="cors-title">{t("cors_section_title")}</h3>
      {diagnosis ? (
        <>
          <p className="cors-cause">
            <strong>
              {diagnosis.cause === "unrecognized"
                ? t("cors_cause_unrecognized", [diagnosis.browserCode])
                : t(`cors_cause_${diagnosis.cause}`, [
                    diagnosis.appOrigin ?? "null",
                    param,
                    diagnosis.method,
                  ])}
            </strong>
          </p>
          {diagnosis.cause !== "unrecognized" ? (
            <p>
              {t(`cors_fix_${diagnosis.cause}`, [
                diagnosis.appOrigin ?? "null",
                param,
                diagnosis.method,
              ])}
            </p>
          ) : null}
          {difference ? (
            <p className="cors-diff">
              {t("cors_diff", [difference.name, difference.expected, difference.received])}
            </p>
          ) : null}
          <div className="cors-columns">
            <div>
              <h4>{t("cors_requested_title")}</h4>
              <dl className="summary">
                <div>
                  <dt>{t("cors_app_origin")}</dt>
                  <dd className="mono">{diagnosis.appOrigin ?? "null"}</dd>
                </div>
                <div>
                  <dt>{t("cors_method")}</dt>
                  <dd className="mono">{diagnosis.method}</dd>
                </div>
                <div>
                  <dt>{t("cors_requested_headers")}</dt>
                  <dd className="mono">
                    {diagnosis.requestedHeaders.join(", ") || t("cors_none")}
                  </dd>
                </div>
                <div>
                  <dt>{t("cors_credentials")}</dt>
                  <dd>{t(`cors_credentials_${diagnosis.credentials}`)}</dd>
                </div>
              </dl>
            </div>
            <div>
              <h4>{t("cors_responded_title")}</h4>
              <dl className="summary">
                <div>
                  <dt>{t("cors_api_origin")}</dt>
                  <dd className="mono">{diagnosis.apiOrigin}</dd>
                </div>
                <div>
                  <dt>{t("cors_request_status")}</dt>
                  <dd>
                    {diagnosis.responseStatus === null
                      ? t("cors_no_response")
                      : String(diagnosis.responseStatus)}
                  </dd>
                </div>
                <div>
                  <dt>{t("cors_preflight_status")}</dt>
                  <dd>
                    {diagnosis.preflightStatus === null
                      ? t("cors_not_observed")
                      : String(diagnosis.preflightStatus)}
                  </dd>
                </div>
              </dl>
              {diagnosis.atPreflight && diagnosis.preflightStatus === null ? (
                <p className="muted">{t("cors_preflight_not_observed_help")}</p>
              ) : null}
              <HeaderList headers={diagnosis.serverCorsHeaders} emptyKey="cors_no_cors_headers" />
            </div>
          </div>
          {blocked ? (
            <p className="muted">{t(blocked.key, blocked.params)}</p>
          ) : active ? (
            <p ref={activeText} tabIndex={-1} className="relax-active">
              {t("cors_relax_active", [active.apiOrigin])}
            </p>
          ) : relaxing ? (
            <RelaxForm
              diagnosis={diagnosis}
              onDone={(created) => {
                setRelaxing(false);
                focusAfter.current = created ? "active" : "button";
              }}
            />
          ) : (
            <p>
              <button
                ref={relaxButton}
                type="button"
                aria-expanded={false}
                onClick={() => setRelaxing(true)}
              >
                {t("cors_relax_action")}
              </button>
            </p>
          )}
        </>
      ) : null}
      {relaxed ? (
        <div className="cors-relaxed">
          {relaxed.errorKey ? (
            <p role="alert" className="field-error">
              {t("cors_relaxed_failed", [t(relaxed.errorKey)])}
            </p>
          ) : (
            <p>
              <strong>{t("cors_relaxed_title")}</strong>
            </p>
          )}
          {relaxed.preflightReplaced ? (
            <p>
              {relaxed.serverStatus === 0
                ? t("cors_relaxed_preflight_local")
                : t("cors_relaxed_preflight", [String(relaxed.serverStatus)])}
            </p>
          ) : null}
          {relaxed.alreadyValid ? <p>{t("cors_relaxed_already_valid")}</p> : null}
          {relaxed.added.length > 0 ? (
            <>
              <h4>{t("cors_relaxed_added")}</h4>
              <HeaderList headers={relaxed.added} emptyKey="cors_none" />
            </>
          ) : null}
          {relaxed.removed.length > 0 ? (
            <>
              <h4>{t("cors_relaxed_removed")}</h4>
              <HeaderList headers={relaxed.removed} emptyKey="cors_none" />
            </>
          ) : null}
        </div>
      ) : null}
      {diagnosis || relaxed ? (
        <p>
          <button
            type="button"
            className="link"
            onClick={() => openReport(diagnosis?.apiOrigin ?? new URL(exchange.url).origin)}
          >
            {t("cors_report_action")}
          </button>
        </p>
      ) : null}
      {related}
      {children}
    </section>
  );
}
