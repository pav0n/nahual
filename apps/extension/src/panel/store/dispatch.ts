import type { SwMessage } from "@nahual/protocol";
import { usePanelStore } from "./index.ts";

/** Aplica un evento del SW al store. */
export function dispatchSwEvent(message: SwMessage): void {
  const store = usePanelStore.getState();
  switch (message.type) {
    case "state":
      store.setSession(message.payload);
      break;
    case "settings":
      store.setSettings(message.payload);
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
      for (const d of message.payload.discarded) store.pushNotice(d.reasonKey, [String(d.count)]);
      break;
    default:
      break;
  }
}
