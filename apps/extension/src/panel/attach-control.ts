import { createAutoAttach } from "./auto-attach.ts";
import { command } from "./commands.ts";
import { usePanelStore } from "./store/index.ts";

/** Adjunto automático del panel (FR-027a): una instancia por panel abierto. */
export const autoAttach = createAutoAttach(() => void command("attach", {}));

/** Adjuntar a mano; con `consent` guarda el consentimiento (último paso del onboarding). */
export function userAttach(consent = false) {
  autoAttach.userAttached();
  return command("attach", consent ? { consent: true } : {});
}

export function userReconnect() {
  autoAttach.userAttached();
  return command("reconnect", {});
}

/** "Soltar": queda suelto hasta "Reconectar" o una nueva apertura (FR-027b). */
export function userDetach() {
  autoAttach.userDetached();
  return command("detach", {});
}

/** Atajo `Alt+Shift+A`: soltar si está adjunto; si no, adjuntar o reconectar. */
export function toggleAttach() {
  const state = usePanelStore.getState().session;
  if (!state || state.status === "attaching") return;
  if (state.status === "attached") void userDetach();
  else if (state.status === "conflict" || state.cause) void userReconnect();
  else void userAttach();
}
