import type { HeaderEdit } from "@nahual/protocol";
import { useEffect, useId, useState } from "react";
import { t } from "../shared/i18n.ts";
import { HeaderEditor } from "./components/HeaderEditor.tsx";
import { PatternForm } from "./components/PatternForm.tsx";
import { PausedList } from "./components/PausedList.tsx";
import { StatusBar } from "./components/StatusBar.tsx";
import "./theme.css";
import { applyTheme } from "./theme.ts";
import { useShortcuts } from "./use-shortcuts.ts";
import { useSwConnection } from "./use-sw-connection.ts";

export function App({ tabId }: { tabId: number | null }) {
  const { state, paused, recent, error, send } = useSwConnection(tabId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const pausedTitleId = useId();

  useEffect(applyTheme, []);

  // Si la pausa seleccionada se resolvió, se selecciona la primera que quede.
  const selected = paused.find((p) => p.pausedId === selectedId) ?? paused[0] ?? null;
  const attached = state?.status === "attached";

  const continueSelected = (headers?: HeaderEdit[]) => {
    if (!selected) return;
    send(
      "continue",
      headers ? { pausedId: selected.pausedId, headers } : { pausedId: selected.pausedId },
    );
  };

  useShortcuts({
    toggleAttach: () => {
      if (!state || state.status === "attaching") return;
      if (state.status === "attached") send("detach", {});
      else send(state.status === "conflict" || state.cause ? "reconnect" : "attach", {});
    },
    continueSelected: () => continueSelected(),
  });

  if (tabId === null) {
    return (
      <main>
        <h1>{t("panelTitle")}</h1>
        <p role="alert" className="alert">
          {t("error_no_tab")}
        </p>
      </main>
    );
  }

  return (
    <main>
      <h1>{t("panelTitle")}</h1>
      <StatusBar
        state={state}
        onAttach={() => send("attach", {})}
        onDetach={() => send("detach", {})}
        onReconnect={() => send("reconnect", {})}
      />

      {error ? (
        <p role="alert" className="alert">
          {t(error.messageKey)}
        </p>
      ) : null}

      {!attached && state?.status !== "attaching" ? (
        <p className="muted">{t("empty_not_attached")}</p>
      ) : null}

      <PatternForm
        patterns={state?.patterns ?? []}
        pauseTimeoutSeconds={state?.pauseTimeoutSeconds ?? 30}
        disabled={!attached}
        onPatternsChange={(patterns) => send("setPatterns", { patterns })}
        onTimeoutChange={(seconds) => send("setPauseTimeout", { seconds })}
      />

      <section aria-labelledby={pausedTitleId}>
        <h2 id={pausedTitleId}>{t("section_paused")}</h2>
        <PausedList
          paused={paused}
          selectedId={selected?.pausedId ?? null}
          onSelect={setSelectedId}
          labelId={pausedTitleId}
        />
      </section>

      {selected ? (
        <HeaderEditor key={selected.pausedId} pause={selected} onContinue={continueSelected} />
      ) : null}

      {recent.length > 0 ? (
        <section aria-live="polite">
          <ul className="plain">
            {recent.map((r) => (
              <li key={r.pausedId} data-outcome={r.outcome}>
                <span>{t(`outcome_${r.outcome}`)}</span> <span className="mono muted">{r.url}</span>
                {r.errorKey ? <span className="muted"> — {t(r.errorKey)}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
