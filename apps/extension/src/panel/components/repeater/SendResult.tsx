import type { RepeaterSend } from "@nahual/domain";
import { t } from "../../../shared/i18n.ts";
import { formatBytes, formatDuration } from "../../format.ts";
import { usePanelStore } from "../../store/index.ts";
import { BodyText } from "../traffic/BodyView.tsx";
import { HeaderList } from "../traffic/HeaderList.tsx";

/**
 * Resultado de un envío (FR-015 a FR-017, FR-010a): status, tiempo y tamaño; la respuesta con los
 * límites de 002; las reglas que actuaron, el preflight, el bloqueo CORS y los headers que no
 * salieron tal cual; un error con causa y solución.
 */
export function SendResult({ send, onUsePage }: { send: RepeaterSend; onUsePage(): void }) {
  // Lleva a Reglas, donde está la regla que actuó (FR-010a).
  const openRules = () => usePanelStore.getState().setSection("rules");
  const { response, error } = send;
  return (
    <section className="send-result" aria-label={t("repeater_result_label")} aria-live="polite">
      <p className="send-summary">
        {send.state === "pending" ? (
          <span aria-busy="true">{t("repeater_sending")}</span>
        ) : (
          <>
            <strong>
              {response ? String(response.status) : t(`repeater_state_${send.state}`)}
            </strong>
            {send.durationMs !== null ? ` · ${formatDuration(send.durationMs)}` : ""}
            {send.size !== null ? ` · ${formatBytes(send.size)}` : ""}
            {` · ${t(`repeater_mode_${send.mode}`)}`}
          </>
        )}
      </p>
      {error ? (
        <div role="alert" className="alert">
          <p>{t(error.messageKey, error.params)}</p>
          <p className="muted">{t(`${error.messageKey}_fix`)}</p>
          {error.code === "permission_denied" || error.code === "permission_required" ? (
            <button type="button" onClick={onUsePage}>
              {t("repeater_use_page")}
            </button>
          ) : null}
        </div>
      ) : null}
      {send.ruleEffects.length > 0 ? (
        <ul className="plain effects">
          {send.ruleEffects.map((effect, i) => (
            <li key={i}>
              {t("traffic_rule_applied", [effect.ruleName, t(`result_${effect.result}`)])}{" "}
              <button type="button" className="link" onClick={openRules}>
                {t("repeater_open_rule")}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {send.preflight ? (
        <p className="muted">
          {t(send.preflight.blocked ? "repeater_preflight_blocked" : "repeater_preflight", [
            send.preflight.status === null ? "—" : String(send.preflight.status),
          ])}
        </p>
      ) : null}
      {send.relaxed ? <p className="muted">{t("repeater_relaxed")}</p> : null}
      {send.cors ? <p className="field-warning">{t("repeater_cors_blocked_detail")}</p> : null}
      {send.notSentHeaders.length > 0 ? (
        <p className="field-warning">
          {t("repeater_not_sent_headers", send.notSentHeaders.join(", "))}
        </p>
      ) : null}
      {response ? (
        <>
          <h3>{t("detail_response_headers")}</h3>
          <HeaderList headers={response.headers} emptyKey="detail_no_headers" />
          <h3>{t("detail_tab_response")}</h3>
          {response.body.encoding === "text" ? (
            <BodyText
              side="response"
              content={response.body.text}
              size={new TextEncoder().encode(response.body.text).length}
            />
          ) : (
            <p className="muted">
              {t(`body_unavailable_${response.body.info.reason ?? "none"}`)}
              {response.body.info.size !== null ? ` · ${formatBytes(response.body.info.size)}` : ""}
            </p>
          )}
        </>
      ) : null}
    </section>
  );
}
