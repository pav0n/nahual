import type { PanelPayload } from "@nahual/protocol";
import { command } from "./commands.ts";

/** Crea una relajación en la pestaña del panel; el SW valida todo (contracts/panel-protocol.md). */
export const relaxCors = (draft: PanelPayload<"relaxCors">) => command("relaxCors", draft);

/** Termina una relajación, o todas si no hay id. No pide confirmación (spec, supuestos). */
export const endRelaxation = (relaxationId?: string) =>
  command("endRelaxation", relaxationId ? { relaxationId } : {});
