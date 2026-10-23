import type { SwMessage } from "@nahual/protocol";
import { t } from "../../shared/i18n.ts";
import { autoAttach } from "../attach-control.ts";
import { usePanelStore } from "./index.ts";

/** Aplica un evento del SW al store. */
export function dispatchSwEvent(message: SwMessage): void {
  const store = usePanelStore.getState();
  switch (message.type) {
    case "state":
      store.setSession(message.payload);
      // Sin sesión no hay pausas: Chrome las liberó al soltar el debugger (FR-025).
      if (message.payload.status !== "attached" && store.paused.length > 0) {
        store.clearPaused();
        store.pushToast({ messageKey: "toast_queue_released" });
      }
      autoAttach.update(usePanelStore.getState().settings, message.payload);
      break;
    case "paused":
      store.addPaused(message.payload);
      if (store.tab !== "queue") {
        store.pushToast({
          messageKey: "toast_paused",
          params: [message.payload.request.url.slice(0, 80)],
          actionKey: "action_view_queue",
          onAction: () => usePanelStore.getState().setTab("queue"),
        });
      }
      break;
    case "resolved": {
      const draft = store.removePaused(message.payload.pausedId);
      const { outcome } = message.payload;
      if (draft && outcome !== "modified" && outcome !== "mocked") {
        store.pushToast({ messageKey: "toast_edit_not_applied", params: [t(`result_${outcome}`)] });
      } else if (outcome === "apply_failed" && message.payload.errorKey) {
        store.pushToast({ messageKey: "toast_apply_failed" });
      }
      break;
    }
    case "settings":
      store.setSettings(message.payload);
      autoAttach.update(message.payload, usePanelStore.getState().session);
      break;
    case "exchanges":
      store.applyUpdates(message.payload.updates);
      break;
    case "navigated":
      break;
    case "notice":
      store.pushNotice(message.payload.messageKey, message.payload.params);
      break;
    case "rules":
      store.setRules(message.payload.rules);
      for (const d of message.payload.discarded) store.pushNotice(d.reasonKey, [String(d.count)]);
      break;
    default:
      break;
  }
}
