import { t } from "../../../shared/i18n.ts";
import { usePanelStore } from "../../store/index.ts";
import { SplitPane } from "../common/SplitPane.tsx";
import { PausedEditor } from "./PausedEditor.tsx";
import { PauseQueue, type useContinueAll } from "./PauseQueue.tsx";

/**
 * Sección Pausados (004, FR-017): la lista de pausados y el editor del seleccionado con un
 * divisor, para atender varios seguidos; "Continuar todos" y su atajo siguen aquí.
 */
export function QueueView({ continueAll }: { continueAll: ReturnType<typeof useContinueAll> }) {
  const paused = usePanelStore((s) => s.paused);
  const selectedId = usePanelStore((s) => s.selectedPausedId);
  const selected = paused.find((p) => p.pausedId === selectedId) ?? paused[0] ?? null;
  return (
    <SplitPane
      prefKey="paused"
      label={t("paused_divider")}
      minStart={240}
      minEnd={320}
      start={
        <div className="pane">
          <PauseQueue onContinueAll={continueAll.request} />
        </div>
      }
      end={
        selected ? (
          <div className="pane">
            <PausedEditor key={selected.pausedId} item={selected} />
          </div>
        ) : null
      }
    />
  );
}
