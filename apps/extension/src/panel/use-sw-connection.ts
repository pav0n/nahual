import { useEffect } from "react";
import { dispatchSwEvent } from "./store/dispatch.ts";
import { sw } from "./sw-client.ts";

/** Abre el puerto con el SW mientras el panel está montado (contracts/panel-protocol.md). */
export function useSwConnection(tabId: number | null): void {
  useEffect(() => {
    if (tabId === null) return;
    sw.connect(tabId, { onEvent: dispatchSwEvent, onConnected: () => {} });
    return () => sw.disconnect();
  }, [tabId]);
}
