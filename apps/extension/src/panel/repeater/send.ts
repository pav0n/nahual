import type { RepeaterError, RepeaterMode, RepeaterRequest, RepeaterSend } from "@nahual/domain";
import { usePanelStore } from "../store/index.ts";
import { sw } from "../sw-client.ts";
import { originAccess } from "./permissions.ts";

const pendingSend = (
  sendId: string,
  request: RepeaterRequest,
  mode: RepeaterMode,
): RepeaterSend => ({
  sendId,
  request,
  mode,
  startedAt: Date.now(),
  state: "pending",
  response: null,
  error: null,
  durationMs: null,
  size: null,
  preflight: null,
  ruleEffects: [],
  relaxed: false,
  cors: null,
  notSentHeaders: [],
  exchangeId: null,
});

const failed = (send: RepeaterSend, error: RepeaterError) =>
  usePanelStore.getState().applyRepeaterResult({ ...send, state: "failed", error });

/**
 * Envía el borrador de una pestaña (FR-014): registra el envío como pendiente, pide acceso al
 * origen si es contexto limpio (FR-011a) y manda `repeaterSend`; el resultado llega como
 * `repeaterResult`. Un cuerpo de texto vacío se envía sin body.
 */
export async function sendRepeaterTab(tabId: string): Promise<void> {
  const store = usePanelStore.getState();
  const tab = store.repeaterTabs.find((t) => t.id === tabId);
  if (!tab) return;
  const request: RepeaterRequest =
    tab.draft.body.kind === "text" && tab.draft.body.text === ""
      ? { ...tab.draft, body: { kind: "none" } }
      : tab.draft;
  const send = pendingSend(crypto.randomUUID(), request, tab.mode);
  // El permiso se pide antes de cualquier espera: Chrome exige el gesto del clic.
  const access = tab.mode === "clean" ? originAccess.request(new URL(request.url).origin) : null;
  store.startRepeaterSend(tabId, send);
  if (access) {
    const granted = await access.catch(() => false);
    if (!granted) {
      failed(send, {
        code: "permission_denied",
        messageKey: "repeater_error_permission_denied",
        params: [new URL(request.url).origin],
      });
      return;
    }
  }
  const reply = await sw.send("repeaterSend", { sendId: send.sendId, mode: tab.mode, request });
  if (!reply.ok) failed(send, { code: "network", messageKey: reply.messageKey });
}

export const cancelRepeaterSend = (sendId: string) => void sw.send("repeaterCancel", { sendId });
