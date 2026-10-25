/// <reference lib="webworker" />
import { applyIgnores, diffResponses, redactDiff } from "@nahual/domain";
import { DiffRequestSchema, type DiffReply } from "./diff-protocol.ts";

/**
 * Worker del diff (005, research R12): calcula, filtra los ignorados y redacta fuera del hilo del
 * panel. Valida cada petición; una inválida se descarta y se registra. El resultado sale ya
 * redactado; los valores reales van aparte para "Mostrar valores sensibles".
 */
self.addEventListener("message", (event: MessageEvent<unknown>) => {
  const data = event.data as { type?: unknown } | null;
  // Ping del experimento X3 (build de pruebas).
  if (data?.type === "ping") {
    self.postMessage({ type: "pong" });
    return;
  }
  const parsed = DiffRequestSchema.safeParse(event.data);
  if (!parsed.success) {
    console.warn("[nahual] Mensaje inválido para el worker del diff.");
    return;
  }
  const { requestId, before, after, ignores } = parsed.data;
  let reply: DiffReply;
  try {
    const { result, revealed } = redactDiff(applyIgnores(diffResponses(before, after), ignores));
    reply = { type: "result", requestId, result, revealed };
  } catch {
    reply = { type: "error", requestId };
  }
  self.postMessage(reply);
});
