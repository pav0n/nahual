import type { SettingsPatch } from "@nahual/domain";
import { command } from "./commands.ts";
import { usePanelStore } from "./store/index.ts";

/** Cambia ajustes de forma optimista; si el SW lo rechaza, se vuelve al valor anterior. */
export async function updateSettings(patch: SettingsPatch) {
  const store = usePanelStore.getState();
  const before = store.settings;
  store.patchSettingsLocal(patch);
  const reply = await command("updateSettings", patch);
  if (!reply.ok && before) usePanelStore.getState().setSettings(before);
  return reply;
}

/** Activa o desactiva una regla de forma optimista. */
export async function setRuleEnabled(ruleId: string, enabled: boolean) {
  const store = usePanelStore.getState();
  store.setRuleEnabledLocal(ruleId, enabled);
  const reply = await command("setRuleEnabled", { ruleId, enabled });
  if (!reply.ok) usePanelStore.getState().setRuleEnabledLocal(ruleId, !enabled);
  return reply;
}
