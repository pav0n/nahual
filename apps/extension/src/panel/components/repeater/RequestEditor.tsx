import {
  HTTP_TOKEN,
  MASK,
  isForbiddenHeader,
  isSensitiveHeader,
  type RepeaterBody,
  type RepeaterHeader,
  type RepeaterRequest,
} from "@nahual/domain";
import type { Issue } from "@nahual/protocol";
import { useState } from "react";
import { t } from "../../../shared/i18n.ts";
import { formatBytes } from "../../format.ts";
import { Field, issueAt } from "../common/Field.tsx";
import { IconButton } from "../common/IconButton.tsx";
import { BodyEditor } from "../queue/BodyEditor.tsx";

/**
 * Headers del repeater: activos o no (FR-005), sensibles enmascarados con "Mostrar" (FR-006) y
 * los que el navegador no deja fijar marcados con su explicación (FR-008).
 */
function RepeaterHeaders({
  headers,
  issues,
  onChange,
}: {
  headers: RepeaterHeader[];
  issues: Issue[];
  onChange(headers: RepeaterHeader[]): void;
}) {
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const update = (index: number, patch: Partial<RepeaterHeader>) =>
    onChange(headers.map((h, i) => (i === index ? { ...h, ...patch } : h)));
  return (
    <fieldset className="headers-editor">
      <legend>{t("detail_request_headers")}</legend>
      {headers.map((header, index) => {
        // Un valor vacío no tiene nada que ocultar: así se puede escribir en un header nuevo.
        const masked =
          isSensitiveHeader(header.name) && header.value !== "" && !revealed.has(index);
        const invalidName = header.name !== "" && !HTTP_TOKEN.test(header.name);
        const forbidden = header.enabled && isForbiddenHeader(header.name);
        const error =
          issueAt(issues, `headers.${index}.name`) ?? issueAt(issues, `headers.${index}.value`);
        return (
          <div key={index} className="header-row">
            <input
              type="checkbox"
              checked={header.enabled}
              aria-label={t("repeater_header_enabled", header.name || String(index + 1))}
              onChange={(e) => update(index, { enabled: e.target.checked })}
            />
            <input
              aria-label={t("header_name_n", String(index + 1))}
              className="mono"
              value={header.name}
              aria-invalid={invalidName}
              onChange={(e) => update(index, { name: e.target.value })}
            />
            <input
              aria-label={t("header_value_of", header.name || String(index + 1))}
              className="mono"
              value={masked ? MASK : header.value}
              readOnly={masked}
              data-masked={masked}
              onFocus={() => {
                if (masked) setRevealed((current) => new Set(current).add(index));
              }}
              onChange={(e) => update(index, { value: e.target.value })}
            />
            <IconButton
              icon="close"
              label={t("action_remove_header", header.name || String(index + 1))}
              onClick={() => onChange(headers.filter((_, i) => i !== index))}
            />
            {forbidden ? (
              <span className="field-warning header-error">{t("repeater_header_forbidden")}</span>
            ) : null}
            {invalidName || error ? (
              <span className="field-error header-error">
                {t(error ?? "rule_error_header_name")}
              </span>
            ) : null}
          </div>
        );
      })}
      <button
        type="button"
        onClick={() => onChange([...headers, { name: "", value: "", enabled: true }])}
      >
        {t("action_add_header")}
      </button>
    </fieldset>
  );
}

/** Body: texto editable, original no textual intacto (FR-002a) o ausente con su motivo. */
function RepeaterBodyField({
  body,
  contentType,
  error,
  onChange,
}: {
  body: RepeaterBody;
  contentType: string;
  error: string | undefined;
  onChange(body: RepeaterBody, undo?: RepeaterBody): void;
}) {
  if (body.kind === "original") {
    return (
      <div className="field repeater-original">
        <span className="field-label">{t("body_label_request")}</span>
        <p className="muted" role="note">
          {t("repeater_body_original", [body.contentType ?? "?", formatBytes(body.size)])}
        </p>
        <div className="row">
          <button type="button" onClick={() => onChange({ kind: "text", text: "" }, body)}>
            {t("repeater_body_replace")}
          </button>
        </div>
      </div>
    );
  }
  return (
    <>
      {body.kind === "none" && body.reason ? (
        <p className="field-warning" role="note">
          {t(`repeater_body_none_${body.reason}`)}
        </p>
      ) : null}
      <BodyEditor
        label={t("body_label_request")}
        value={body.kind === "text" ? body.text : ""}
        json={contentType.includes("json")}
        onChange={(text) => onChange(text === "" ? { kind: "none" } : { kind: "text", text })}
      />
      {error ? <p className="field-error">{t(error)}</p> : null}
    </>
  );
}

/**
 * Editor del request de una pestaña (FR-005 a FR-008): método, URL, headers y body. Los errores
 * de validación salen junto a su campo y bloquean "Enviar" (FR-007).
 */
export function RequestEditor({
  draft,
  issues,
  onChange,
  onBodyReplaced,
}: {
  draft: RepeaterRequest;
  issues: Issue[];
  onChange(draft: RepeaterRequest): void;
  /** "Reemplazar por texto" con deshacer (FR-002a). */
  onBodyReplaced(undo: RepeaterBody): void;
}) {
  const contentType =
    draft.headers.find((h) => h.enabled && h.name.toLowerCase() === "content-type")?.value ?? "";
  return (
    <section className="detail repeater-editor" aria-label={t("repeater_editor_label")}>
      <div className="detail-header">
        <h2>{t("detail_tab_request")}</h2>
      </div>
      <div className="detail-body">
        <div className="row">
          <Field label={t("paused_method")} error={issueAt(issues, "method")} className="method">
            {(props) => (
              <input
                {...props}
                className="mono"
                value={draft.method}
                onChange={(e) => onChange({ ...draft, method: e.target.value.toUpperCase() })}
              />
            )}
          </Field>
          <Field label={t("paused_url")} error={issueAt(issues, "url")} className="grow">
            {(props) => (
              <input
                {...props}
                className="mono"
                value={draft.url}
                placeholder="https://"
                onChange={(e) => onChange({ ...draft, url: e.target.value })}
              />
            )}
          </Field>
        </div>
        <RepeaterHeaders
          headers={draft.headers}
          issues={issues}
          onChange={(headers) => onChange({ ...draft, headers })}
        />
        <RepeaterBodyField
          body={draft.body}
          contentType={contentType}
          error={issueAt(issues, "body.text") ?? issueAt(issues, "body")}
          onChange={(body, undo) => {
            onChange({ ...draft, body });
            if (undo) onBodyReplaced(undo);
          }}
        />
      </div>
    </section>
  );
}
