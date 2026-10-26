import { t } from "../../../shared/i18n.ts";
import { formatDuration } from "../../format.ts";
import type { HookExecution } from "../../hooks/hook-host.ts";
import { usePanelStore } from "../../store/index.ts";
import { Icon } from "../common/icons.tsx";

const RESULT_ICON = {
  hooked: "relaxed",
  hook_unchanged: "attached",
  hook_failed: "error",
  hook_responded: "relaxed",
  hook_skipped_suspended: "paused",
} as const;

/** Mensaje de error: las claves `hook_error_*` y `rule_error_*` se traducen. */
export const hookMessage = (message: string) =>
  /^(hook|rule)_error_/.test(message) ? t(message) : message;

/**
 * Pestaña Hooks del detalle (006, FR-014, contracts/panel-ui.md), como Timing en Network: una
 * fila por ejecución con regla, resultado (icono y texto), duración y partes cambiadas; debajo,
 * sus registros como filas de Console; al final, la duración de la cadena.
 */
export function HooksTab({ exchangeId }: { exchangeId: string }) {
  const executions = usePanelStore((s) => s.hookExecutions[exchangeId]) ?? [];
  const openRules = () => usePanelStore.getState().setSection("rules");
  const byRun = new Map<string, HookExecution[]>();
  for (const e of executions) byRun.set(e.runId, [...(byRun.get(e.runId) ?? []), e]);

  return (
    <div className="hooks-tab">
      {[...byRun.values()].map((run) => (
        <section key={run[0]?.runId} aria-label={t(`stage_${run[0]?.stage ?? "request"}`)}>
          <table className="timing-table">
            <caption className="visually-hidden">{t("hooks_tab_caption")}</caption>
            <thead>
              <tr>
                <th scope="col">{t("hooks_col_rule")}</th>
                <th scope="col">{t("hooks_col_result")}</th>
                <th scope="col">{t("hooks_col_changes")}</th>
                <th scope="col" className="num">
                  {t("hooks_col_time")}
                </th>
              </tr>
            </thead>
            <tbody>
              {run.map((e) => (
                <tr key={e.id} data-result={e.result}>
                  <td>{e.ruleName}</td>
                  <td>
                    <span className="hook-result">
                      <Icon name={RESULT_ICON[e.result]} />
                      {t(`result_${e.result}`)}
                    </span>
                  </td>
                  <td>
                    {e.parts.length > 0 ? e.parts.map((p) => t(`hook_part_${p}`)).join(", ") : "—"}
                    {e.destination ? (
                      <div className="mono hook-destination">
                        {t("hooks_destination", [e.destination.from, e.destination.to])}
                      </div>
                    ) : null}
                  </td>
                  <td className="num">{formatDuration(e.durationMs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {run.map((e) =>
            e.error || e.logs.length > 0 ? (
              <ul key={`${e.id}-logs`} className="plain console-rows" aria-label={e.ruleName}>
                {e.error ? (
                  <li className="console-row" data-level="error">
                    <Icon name="error" />
                    <span className="console-text mono">
                      {t(`hook_error_type_${e.error.type}`)}: {hookMessage(e.error.message)}
                      {e.error.line ? ` · ${t("hook_line", String(e.error.line))}` : ""}
                    </span>
                    <button type="button" className="link" onClick={openRules}>
                      {t("hooks_open_rule")}
                    </button>
                  </li>
                ) : null}
                {e.logs.map((log, i) => (
                  <li key={i} className="console-row" data-level="log">
                    <span className="console-text mono">{log}</span>
                  </li>
                ))}
              </ul>
            ) : null,
          )}
          <p className="muted">
            {t("hooks_chain", [
              String(run.length),
              formatDuration(run.reduce((sum, e) => sum + e.durationMs, 0)),
            ])}
          </p>
        </section>
      ))}
    </div>
  );
}
