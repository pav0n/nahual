import { useState, type KeyboardEvent } from "react";
import { t } from "../../../shared/i18n.ts";
import { command } from "../../commands.ts";
import { usePanelStore } from "../../store/index.ts";
import { SHORTCUT_CONTINUE, SHORTCUT_CONTINUE_ALL } from "../../use-shortcuts.ts";
import { ConfirmDialog } from "../common/ConfirmDialog.tsx";
import { EmptyState } from "../common/EmptyState.tsx";
import { Countdown } from "./Countdown.tsx";
import { ariaOf } from "../../shortcuts.ts";

export const optionId = (pausedId: string) => `paused-${pausedId}`;

/** "Continuar todos" sin cambios; si hay ediciones sin aplicar, pide confirmación (FR-024). */
export function useContinueAll() {
  const drafts = usePanelStore((s) => s.drafts);
  const [confirming, setConfirming] = useState(false);
  const pending = Object.keys(drafts).length;
  const run = () => {
    setConfirming(false);
    void command("continueAll", {});
  };
  return {
    request: () => (pending > 0 ? setConfirming(true) : run()),
    dialog: (
      <ConfirmDialog
        open={confirming}
        title={t("confirm_continue_all_title")}
        body={t("confirm_continue_all_body", String(pending))}
        confirmLabel={t("action_continue_all")}
        onConfirm={run}
        onCancel={() => setConfirming(false)}
      />
    ),
  };
}

/** Cola de pausados en orden de llegada (FR-023); cada uno se resuelve en cualquier orden. */
export function PauseQueue({ onContinueAll }: { onContinueAll(): void }) {
  const paused = usePanelStore((s) => s.paused);
  const selectedId = usePanelStore((s) => s.selectedPausedId);
  const select = usePanelStore((s) => s.selectPaused);
  const drafts = usePanelStore((s) => s.drafts);

  if (paused.length === 0) {
    return <EmptyState title={t("empty_queue_title")}>{t("empty_queue_body")}</EmptyState>;
  }

  const index = Math.max(
    0,
    paused.findIndex((p) => p.pausedId === selectedId),
  );
  const onKeyDown = (event: KeyboardEvent) => {
    const next =
      event.key === "ArrowDown"
        ? index + 1
        : event.key === "ArrowUp"
          ? index - 1
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? paused.length - 1
              : null;
    if (next === null) return;
    event.preventDefault();
    const target = paused[Math.max(0, Math.min(paused.length - 1, next))];
    if (target) select(target.pausedId);
  };

  return (
    <div className="queue">
      <div className="row">
        <h2 className="grow" id="queue-title">
          {t("queue_title", String(paused.length))}
        </h2>
        <button
          type="button"
          onClick={onContinueAll}
          aria-keyshortcuts={ariaOf("continueAll")}
          title={t("shortcut_hint", SHORTCUT_CONTINUE_ALL)}
        >
          {t("action_continue_all")} <kbd>{SHORTCUT_CONTINUE_ALL}</kbd>
        </button>
      </div>
      <ul
        role="listbox"
        aria-labelledby="queue-title"
        tabIndex={0}
        aria-activedescendant={selectedId ? optionId(selectedId) : undefined}
        onKeyDown={onKeyDown}
        aria-keyshortcuts={ariaOf("continueSelected")}
        title={t("shortcut_continue_selected", SHORTCUT_CONTINUE)}
      >
        {paused.map((item) => (
          <li
            key={item.pausedId}
            id={optionId(item.pausedId)}
            role="option"
            aria-selected={item.pausedId === selectedId}
            onClick={() => select(item.pausedId)}
          >
            <div className="mono cell-url-wrap">
              {item.request.method} {item.request.url}
            </div>
            <div className="muted">
              {t(`stage_${item.stage}`)}
              {item.response ? ` · ${t("paused_status", String(item.response.status))}` : ""} ·{" "}
              {t("paused_rule", item.ruleName)}
              {drafts[item.pausedId] ? ` · ${t("paused_edited")}` : ""}
            </div>
            <Countdown expiresAt={item.expiresAt} totalMs={item.expiresAt - item.pausedAt} />
          </li>
        ))}
      </ul>
    </div>
  );
}
