import {
  RELAXATION_DURATIONS,
  isSensitiveHeader,
  matchProductionOrigin,
  parseOrigin,
  type CorsDiagnosis,
  type RelaxationDuration,
} from "@nahual/domain";
import type { Issue } from "@nahual/protocol";
import { useId, useMemo, useState } from "react";
import { t } from "../../../shared/i18n.ts";
import { relaxCors } from "../../cors-commands.ts";
import { usePanelStore } from "../../store/index.ts";

/** Referencia estable: un `[]` nuevo en el selector haría renderizar en bucle. */
const NO_ORIGINS: readonly string[] = [];

const NAME = /^[!#$%&'*+\-.^_`|~0-9a-z]+$/;

const originOf = (url: string) => {
  try {
    return parseOrigin(new URL(url).origin);
  } catch {
    return null;
  }
};

/** Nombres de headers que ya devolvió ese origen de API (para elegir Expose-Headers, FR-014). */
function seenHeaderNames(apiOrigin: string): string[] {
  const names = new Set<string>();
  for (const e of usePanelStore.getState().exchanges) {
    if (originOf(e.url) !== apiOrigin) continue;
    for (const h of e.responseHeaders) {
      const name = h.name.toLowerCase();
      if (!name.startsWith("access-control-") && !isSensitiveHeader(name) && NAME.test(name))
        names.add(name);
    }
  }
  return [...names].sort().slice(0, 30);
}

const issueText = (issue: Issue, diagnosis: CorsDiagnosis, production: readonly string[]) => {
  if (issue.messageKey === "cors_issue_production_origin") {
    const origin = issue.path === "appOrigin" ? diagnosis.appOrigin : diagnosis.apiOrigin;
    const entry = origin ? matchProductionOrigin(origin, production) : null;
    return t("cors_not_relaxable_production", [entry ?? origin ?? ""]);
  }
  return t(issue.messageKey);
};

/**
 * Confirmación en línea de "Permitir CORS para desarrollo" (FR-008, SC-001): alcance, duración,
 * credenciales, Expose-Headers y aviso; "Permitir" la crea con un solo clic más.
 */
export function RelaxForm({
  diagnosis,
  onDone,
}: {
  diagnosis: CorsDiagnosis;
  onDone(created: boolean): void;
}) {
  const defaultDuration = usePanelStore((s) => s.settings?.corsDefaultDurationMinutes ?? 480);
  const production = usePanelStore((s) => s.settings?.productionOrigins ?? NO_ORIGINS);
  const seen = useMemo(() => seenHeaderNames(diagnosis.apiOrigin), [diagnosis.apiOrigin]);
  const [duration, setDuration] = useState<RelaxationDuration>(defaultDuration);
  const [credentials, setCredentials] = useState(diagnosis.credentials === "yes");
  const [expose, setExpose] = useState<string[]>([]);
  const [extra, setExtra] = useState("");
  const [issues, setIssues] = useState<Issue[]>([]);
  const [busy, setBusy] = useState(false);
  const warningId = useId();
  const extraError = useId();

  const extraNames = extra
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter((v) => v !== "");
  const extraInvalid = extraNames.some((name) => !NAME.test(name));

  const submit = async () => {
    if (extraInvalid) return;
    setBusy(true);
    const reply = await relaxCors({
      appOrigin: diagnosis.appOrigin ?? "null",
      apiOrigin: diagnosis.apiOrigin,
      durationMinutes: duration,
      exposeHeaders: [...new Set([...expose, ...extraNames])].slice(0, 30),
      credentials,
    });
    setBusy(false);
    if (reply.ok) onDone(true);
    else setIssues(reply.issues);
  };

  return (
    <form
      className="relax-form"
      aria-describedby={warningId}
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <p>
        <strong>{t("cors_relax_scope")}</strong>{" "}
        <span className="mono">
          {t("cors_relax_scope_value", [diagnosis.appOrigin ?? "null", diagnosis.apiOrigin])}
        </span>
      </p>
      <label className="field">
        <span>{t("cors_relax_duration")}</span>
        <select
          value={duration}
          onChange={(e) => setDuration(Number(e.target.value) as RelaxationDuration)}
        >
          {RELAXATION_DURATIONS.map((minutes) => (
            <option key={minutes} value={minutes}>
              {t(`cors_duration_${minutes}`)}
            </option>
          ))}
        </select>
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={credentials}
          onChange={(e) => setCredentials(e.target.checked)}
        />
        {t("cors_relax_credentials")}
      </label>
      <fieldset className="types">
        <legend>{t("cors_relax_expose")}</legend>
        {seen.length === 0 ? <p className="muted">{t("cors_relax_expose_none_seen")}</p> : null}
        {seen.map((name) => (
          <label key={name} className="check mono">
            <input
              type="checkbox"
              checked={expose.includes(name)}
              onChange={(e) =>
                setExpose(e.target.checked ? [...expose, name] : expose.filter((x) => x !== name))
              }
            />
            {name}
          </label>
        ))}
        <label className="field">
          <span>{t("cors_relax_expose_extra")}</span>
          <input
            type="text"
            className="mono"
            value={extra}
            placeholder="x-total, x-page"
            aria-invalid={extraInvalid}
            aria-describedby={extraInvalid ? extraError : undefined}
            onChange={(e) => setExtra(e.target.value)}
          />
          {extraInvalid ? (
            <span id={extraError} className="field-error">
              {t("cors_error_header_name")}
            </span>
          ) : null}
        </label>
      </fieldset>
      <p id={warningId} className="warning">
        {t("cors_relax_warning")}
      </p>
      {issues.length > 0 ? (
        <ul className="plain field-error" role="alert">
          {issues.map((issue, i) => (
            <li key={i}>{issueText(issue, diagnosis, production)}</li>
          ))}
        </ul>
      ) : null}
      <div className="row">
        <button type="submit" className="primary" disabled={busy || extraInvalid}>
          {t("cors_relax_confirm")}
        </button>
        <button type="button" onClick={() => onDone(false)}>
          {t("action_cancel")}
        </button>
      </div>
    </form>
  );
}
