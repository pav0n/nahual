import type { RepeaterSend } from "@nahual/domain";
import { t } from "../../../shared/i18n.ts";
import { formatBytes, formatDuration } from "../../format.ts";
import type { SideRef } from "../../repeater/compare.ts";

const time = (ms: number) =>
  new Date(ms).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

/**
 * Historial de envíos de una pestaña (FR-018, FR-019), del más reciente al más antiguo. Elegir
 * uno muestra su request y su respuesta; "Cargar en el editor" lo vuelve a poner en el borrador.
 */
export function SendHistory({
  sends,
  droppedCount,
  selectedId,
  onSelect,
  onLoad,
  onCompare,
  hasOriginal,
}: {
  sends: RepeaterSend[];
  droppedCount: number;
  selectedId: string | null;
  onSelect(sendId: string): void;
  onLoad(send: RepeaterSend): void;
  /** Abre el diff con estos lados (FR-022). */
  onCompare(before: SideRef, after: SideRef): void;
  /** La pestaña salió de un request capturado: se puede comparar con su respuesta. */
  hasOriginal: boolean;
}) {
  if (sends.length === 0) return <p className="muted">{t("repeater_history_empty")}</p>;
  return (
    <section className="send-history" aria-label={t("repeater_history_label")}>
      <ul className="plain">
        {sends.map((send, index) => {
          const selected = send.sendId === selectedId;
          const outcome =
            send.state === "pending"
              ? t("repeater_sending")
              : send.response
                ? String(send.response.status)
                : t(`repeater_state_${send.state}`);
          return (
            <li key={send.sendId} className="history-item" data-selected={selected}>
              <button
                type="button"
                className="history-select"
                aria-pressed={selected}
                aria-label={t("repeater_history_item", [String(sends.length - index), outcome])}
                onClick={() => onSelect(send.sendId)}
              >
                <span className="mono">{time(send.startedAt)}</span>{" "}
                <span className="mono">
                  {send.request.method} {send.request.url}
                </span>{" "}
                <span>{outcome}</span>
                {send.durationMs !== null ? ` · ${formatDuration(send.durationMs)}` : ""}
                {send.size !== null ? ` · ${formatBytes(send.size)}` : ""}
                {` · ${t(`repeater_mode_${send.mode}`)}`}
              </button>
              {selected ? (
                <>
                  <button type="button" className="link" onClick={() => onLoad(send)}>
                    {t("repeater_load_in_editor")}
                  </button>
                  {hasOriginal && send.state !== "pending" ? (
                    <button
                      type="button"
                      className="link"
                      onClick={() =>
                        onCompare({ kind: "original" }, { kind: "send", sendId: send.sendId })
                      }
                    >
                      {t("diff_compare_original")}
                    </button>
                  ) : null}
                  {sends[index + 1] && send.state !== "pending" ? (
                    <button
                      type="button"
                      className="link"
                      onClick={() =>
                        onCompare(
                          { kind: "send", sendId: sends[index + 1]?.sendId ?? "" },
                          { kind: "send", sendId: send.sendId },
                        )
                      }
                    >
                      {t("diff_compare_previous")}
                    </button>
                  ) : null}
                </>
              ) : null}
            </li>
          );
        })}
      </ul>
      {droppedCount > 0 ? (
        <p className="muted">{t("repeater_history_dropped", String(droppedCount))}</p>
      ) : null}
    </section>
  );
}
