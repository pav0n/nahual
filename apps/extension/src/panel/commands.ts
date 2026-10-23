import type { PanelPayload } from "@nahual/protocol";
import { usePanelStore } from "./store/index.ts";
import { sw, type CommandType, type Reply } from "./sw-client.ts";

/**
 * Envía un comando al SW. Si falla, guarda el error (con `issues` por campo) para mostrarlo con
 * causa y solución (principio III).
 */
export async function command<T extends CommandType>(
  type: T,
  payload: PanelPayload<T>,
): Promise<Reply> {
  const reply = await sw.send(type, payload);
  usePanelStore
    .getState()
    .setError(reply.ok ? null : { messageKey: reply.messageKey, issues: reply.issues });
  return reply;
}
