import { useEffect } from "react";
import { autoAttach } from "./attach-control.ts";
import { dispatchSwEvent } from "./store/dispatch.ts";
import { usePanelStore } from "./store/index.ts";
import { sw } from "./sw-client.ts";

/** Abre el puerto con el SW mientras el panel está montado (contracts/panel-protocol.md). */
export function useSwConnection(tabId: number | null): void {
  useEffect(() => {
    if (tabId === null) return;
    sw.connect(tabId, {
      onEvent: dispatchSwEvent,
      onConnected: (reconnected) => {
        // El estado anterior puede ser de antes de un reinicio del SW: se espera el nuevo.
        usePanelStore.getState().setSession(null);
        if (reconnected) usePanelStore.getState().beginReconnect();
        autoAttach.connected();
      },
    });
    return () => sw.disconnect();
  }, [tabId]);
}
