import { headerValues, type Header, type PausedItemView } from "@nahual/domain";
import type { Issue } from "@nahual/protocol";
import { useState } from "react";
import { t } from "../../../shared/i18n.ts";
import { command } from "../../commands.ts";
import { usePanelStore } from "../../store/index.ts";
import type { PausedDraft } from "../../store/queue.ts";
import { Field, issueAt } from "../common/Field.tsx";
import { BodyEditor } from "./BodyEditor.tsx";
import { Countdown } from "./Countdown.tsx";
import { HeadersEditor } from "./HeadersEditor.tsx";
import { MockForm, toMockAction, type MockFormValue } from "./MockForm.tsx";

const isAbsoluteHttpUrl = (value: string) => {
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
};

/** Validación local antes de enviar; el SW vuelve a validar (edge case de valores inválidos). */
function localIssues(item: PausedItemView, draft: PausedDraft): Issue[] {
  const issues: Issue[] = [];
  if (draft.url !== undefined && !isAbsoluteHttpUrl(draft.url))
    issues.push({ path: "url", messageKey: "rule_error_url" });
  if (
    draft.status !== undefined &&
    (!Number.isInteger(draft.status) || draft.status < 100 || draft.status > 599)
  ) {
    issues.push({ path: "status", messageKey: "rule_error_status" });
  }
  if (item.stage === "request" && draft.method !== undefined && !/^[A-Za-z]+$/.test(draft.method)) {
    issues.push({ path: "method", messageKey: "rule_error_method" });
  }
  return issues;
}

/**
 * Item pausado editable (FR-020, FR-021). Request: método, URL, headers y body; Response: status,
 * headers y body. La edición se guarda como borrador por item mientras la cuenta regresiva sigue.
 */
export function PausedEditor({
  item,
  inDetail = false,
}: {
  item: PausedItemView;
  /** Dentro de la pestaña "Editar" del detalle de Tráfico (004): el título es de nivel 3. */
  inDetail?: boolean;
}) {
  const draft = usePanelStore((s) => s.drafts[item.pausedId]) ?? {};
  const setDraft = usePanelStore((s) => s.setDraft);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [mock, setMock] = useState<MockFormValue | null>(null);
  const [busy, setBusy] = useState(false);

  const Heading = inDetail ? "h3" : "h2";
  const isRequest = item.stage === "request";
  const original = isRequest ? item.request : item.response;
  const originalHeaders = (isRequest ? item.request.headers : item.response?.headers) ?? [];
  const headers = draft.headers ?? originalHeaders;
  const bodyInfo = original?.bodyInfo ?? { available: false, size: null };
  const body = draft.body ?? original?.body ?? "";
  const status = item.response?.status ?? 200;
  const editableBody = bodyInfo.available && !(status >= 300 && status < 400);
  const json = (headerValues(headers, "content-type")[0] ?? "").includes("json");

  const update = (patch: Partial<PausedDraft>) => {
    const next: PausedDraft = { ...draft, ...patch };
    // Un campo que vuelve a su valor original deja de ser una edición.
    if (next.method === item.request.method) delete next.method;
    if (next.url === item.request.url) delete next.url;
    if (next.status === item.response?.status) delete next.status;
    if (next.body !== undefined && next.body === (original?.body ?? "")) delete next.body;
    setDraft(item.pausedId, next);
    setIssues(localIssues(item, next));
  };

  const run = async (payload: Parameters<typeof command<"resolvePaused">>[1]) => {
    setBusy(true);
    const reply = await command("resolvePaused", payload);
    setBusy(false);
    if (!reply.ok) setIssues(reply.issues);
  };

  const edited = Object.keys(draft).length > 0;
  const blocked = issues.some((i) => i.path !== "body");

  return (
    <section className="paused-editor" aria-labelledby="paused-editor-title">
      <Heading id="paused-editor-title" className="mono">
        {t(isRequest ? "paused_editor_request" : "paused_editor_response")}: {item.request.method}{" "}
        {item.request.url}
      </Heading>
      <p className="muted">
        {t("paused_rule", item.ruleName)} ·{" "}
        <Countdown expiresAt={item.expiresAt} totalMs={item.expiresAt - item.pausedAt} />
      </p>

      {isRequest ? (
        <div className="row">
          <Field label={t("paused_method")} error={issueAt(issues, "method")}>
            {(props) => (
              <input
                {...props}
                className="mono"
                value={draft.method ?? item.request.method}
                onChange={(e) => update({ method: e.target.value })}
              />
            )}
          </Field>
          <Field label={t("paused_url")} error={issueAt(issues, "url")} className="grow">
            {(props) => (
              <input
                {...props}
                className="mono"
                value={draft.url ?? item.request.url}
                onChange={(e) => update({ url: e.target.value })}
              />
            )}
          </Field>
        </div>
      ) : (
        <Field label={t("paused_status_field")} error={issueAt(issues, "status")}>
          {(props) => (
            <input
              {...props}
              inputMode="numeric"
              value={String(draft.status ?? status)}
              onChange={(e) => update({ status: Number(e.target.value) })}
            />
          )}
        </Field>
      )}

      <HeadersEditor
        legend={t(isRequest ? "detail_request_headers" : "detail_response_headers")}
        headers={headers}
        onChange={(next: Header[]) => update({ headers: next })}
      />
      {issues
        .filter((i) => i.path.startsWith("headers."))
        .map((i) => (
          <p key={i.path} className="field-error">
            {t(i.messageKey)}
          </p>
        ))}

      {editableBody ? (
        <BodyEditor
          label={t(isRequest ? "body_label_request" : "body_label_response")}
          value={body}
          json={json}
          onChange={(value) => update({ body: value })}
        />
      ) : (
        <p className="muted">
          {t(
            `body_unavailable_${status >= 300 && status < 400 ? "redirect" : (bodyInfo.reason ?? "none")}`,
          )}
        </p>
      )}

      {mock ? (
        <div className="mock">
          <h3>{t("action_respond_mock")}</h3>
          <MockForm value={mock} issues={issues} prefix="" onChange={setMock} />
          <div className="row">
            <button
              type="button"
              className="primary"
              disabled={busy}
              onClick={() =>
                void run({ pausedId: item.pausedId, action: "mock", mock: toMockAction(mock) })
              }
            >
              {t("action_send_mock")}
            </button>
            <button type="button" onClick={() => setMock(null)}>
              {t("action_cancel")}
            </button>
          </div>
        </div>
      ) : null}

      {issues.length > 0 ? (
        <p role="alert" className="alert">
          {t("error_edit_invalid")}
        </p>
      ) : null}

      <div className="row actions">
        <button
          type="button"
          className="primary"
          disabled={busy || blocked}
          onClick={() =>
            void run(
              edited
                ? { pausedId: item.pausedId, action: "continue", edit: { ...draft } }
                : { pausedId: item.pausedId, action: "continue" },
            )
          }
        >
          {t(edited ? "action_continue_edited" : "action_continue")}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void run({ pausedId: item.pausedId, action: "continueUnchanged" })}
        >
          {t("action_continue_unchanged")}
        </button>
        <button
          type="button"
          disabled={busy || mock !== null}
          onClick={() =>
            setMock({
              status: String(draft.status ?? item.response?.status ?? 200),
              headers: isRequest ? [{ name: "content-type", value: "application/json" }] : headers,
              body: isRequest ? "" : body,
            })
          }
        >
          {t("action_respond_mock")}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void run({ pausedId: item.pausedId, action: "abort" })}
        >
          {t("action_abort")}
        </button>
      </div>
    </section>
  );
}
