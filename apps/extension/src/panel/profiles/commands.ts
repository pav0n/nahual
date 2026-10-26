import { command } from "../commands.ts";
import { usePanelStore } from "../store/index.ts";

// Comandos de perfiles (007, contracts/panel-protocol.md). El SW responde con `profiles`,
// `rules` y `state`; aquí solo los avisos de la interfaz.

export const setActiveProfile = (profileId: string | null) =>
  command("setActiveProfile", { profileId });

export const saveProfile = (name: string, id?: string) =>
  command("saveProfile", id === undefined ? { name } : { id, name });

export const duplicateProfile = (id: string, name: string) =>
  command("duplicateProfile", { id, name });

export const setRuleProfiles = (ruleId: string, profileIds: string[]) =>
  command("setRuleProfiles", { ruleId, profileIds });

/** Eliminar con "Deshacer" durante 10 s, como borrar regla (FR-023, FR-004). */
export async function deleteProfile(id: string, name: string) {
  const reply = await command("deleteProfile", { id });
  if (!reply.ok) return reply;
  usePanelStore.getState().pushToast({
    messageKey: "profile_deleted_undo",
    params: [name],
    actionKey: "action_undo",
    onAction: () => void command("restoreProfile", { id }),
  });
  return reply;
}
