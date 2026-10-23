import { usePanelStore } from "../../store/index.ts";
import { PausedEditor } from "./PausedEditor.tsx";
import { PauseQueue, type useContinueAll } from "./PauseQueue.tsx";

/** Pestaña de la cola: lista de pausados y editor del seleccionado. */
export function QueueView({ continueAll }: { continueAll: ReturnType<typeof useContinueAll> }) {
  const paused = usePanelStore((s) => s.paused);
  const selectedId = usePanelStore((s) => s.selectedPausedId);
  const selected = paused.find((p) => p.pausedId === selectedId) ?? paused[0] ?? null;
  return (
    <>
      <PauseQueue onContinueAll={continueAll.request} />
      {selected ? <PausedEditor key={selected.pausedId} item={selected} /> : null}
    </>
  );
}
