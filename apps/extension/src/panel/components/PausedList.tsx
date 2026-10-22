import type { PausedRequestView } from "@nahual/protocol";
import { useEffect, useState, type KeyboardEvent } from "react";
import { t } from "../../shared/i18n.ts";

function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

interface Props {
  paused: PausedRequestView[];
  selectedId: string | null;
  onSelect(pausedId: string): void;
  labelId: string;
}

/** Lista de pausas navegable con flechas; el detalle de la seleccionada va aparte. */
export function PausedList({ paused, selectedId, onSelect, labelId }: Props) {
  const now = useNow();

  if (paused.length === 0) return <p className="muted">{t("empty_no_paused")}</p>;

  const index = Math.max(
    0,
    paused.findIndex((p) => p.pausedId === selectedId),
  );

  const onKeyDown = (event: KeyboardEvent) => {
    const delta = event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
    if (delta === 0) return;
    event.preventDefault();
    const next = paused[(index + delta + paused.length) % paused.length];
    if (next) onSelect(next.pausedId);
  };

  return (
    <ul
      role="listbox"
      tabIndex={0}
      aria-labelledby={labelId}
      aria-activedescendant={`paused-${paused[index]?.pausedId ?? ""}`}
      onKeyDown={onKeyDown}
    >
      {paused.map((p, i) => {
        const seconds = Math.max(0, Math.ceil((p.expiresAt - now) / 1000));
        return (
          <li
            key={p.pausedId}
            id={`paused-${p.pausedId}`}
            role="option"
            aria-selected={i === index}
            onClick={() => onSelect(p.pausedId)}
          >
            <div className="row">
              <strong>{p.method}</strong>
              <span>{t(`stage_${p.stage}`)}</span>
              {p.statusCode !== null ? (
                <span>{t("paused_status", String(p.statusCode))}</span>
              ) : null}
              <span className="muted">{t("paused_expires_in", String(seconds))}</span>
            </div>
            <div className="mono">{p.url}</div>
            <div className="muted">
              {p.bodyAvailable && p.bodySize !== null
                ? t("paused_body_size", String(p.bodySize))
                : p.bodyAvailable
                  ? null
                  : t("paused_body_unavailable")}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
