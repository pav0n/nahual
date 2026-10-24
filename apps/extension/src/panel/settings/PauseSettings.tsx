import { LIMITS } from "@nahual/domain";
import { t } from "../../shared/i18n.ts";
import { command } from "../commands.ts";
import { usePanelStore } from "../store/index.ts";
import { AutoSaveField } from "./AutoSaveField.tsx";

const validTimeout = (raw: string) => {
  const seconds = Number(raw.trim());
  return raw.trim() !== "" &&
    Number.isInteger(seconds) &&
    seconds >= LIMITS.pauseTimeoutMin &&
    seconds <= LIMITS.pauseTimeoutMax
    ? null
    : "settings_timeout_range";
};

/** Ajustes ⇒ Pausas: tiempo máximo de pausa (002 FR-022) con guardado al confirmar. */
export function PauseSettings() {
  const saved = usePanelStore((s) => s.settings?.pauseTimeoutSeconds ?? LIMITS.pauseTimeoutDefault);
  return (
    <AutoSaveField
      label={t("settings_timeout")}
      hint={t("settings_timeout_hint")}
      saved={String(saved)}
      inputMode="numeric"
      validate={validTimeout}
      save={(raw) => command("updateSettings", { pauseTimeoutSeconds: Number(raw.trim()) })}
    />
  );
}
