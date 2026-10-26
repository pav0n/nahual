import { t } from "../../../shared/i18n.ts";
import { DRAWER_SLOT } from "../../shell/Drawer.tsx";
import { STATUS_ITEMS } from "../../shell/status-items.ts";
import { HookConsole } from "./HookConsole.tsx";
import { HookErrorCounter } from "./HookErrorCounter.tsx";

/**
 * 006: la consola de hooks en el cajón y su contador en la barra (puntos de extensión de 004,
 * contracts/panel-ui.md). La consola solo aparece si hay reglas con hook o registros.
 */
export function registerHooksUi(): void {
  DRAWER_SLOT.label = t("hook_console");
  DRAWER_SLOT.content = HookConsole;
  DRAWER_SLOT.visible = (state) =>
    state.hookConsole.length > 0 || state.rules.some((r) => r.action.kind === "hook");
  if (!STATUS_ITEMS.some((item) => item.id === "hooks"))
    STATUS_ITEMS.unshift({ id: "hooks", render: HookErrorCounter });
}
