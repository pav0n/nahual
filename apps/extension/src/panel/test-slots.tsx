import { BATCH_ACTIONS } from "./actions/batch-actions.ts";
import { RULE_EDITOR_SLOTS } from "./components/rules/editor-slots.ts";
import { createDiffWorker } from "./repeater/diff-client.ts";
import { originAccess } from "./repeater/permissions.ts";
import { SETTINGS_SECTIONS } from "./settings/sections.ts";
import { DRAWER_SLOT } from "./shell/Drawer.tsx";
import { SECTIONS } from "./shell/sections.ts";
import { STATUS_ITEMS } from "./shell/status-items.ts";
import { usePanelStore } from "./store/index.ts";
import type { PanelSection } from "./store/ui.ts";

const SlotSection = () => <p className="pane">Slot section</p>;
const slotStatus = (n: number) => {
  const SlotStatus = () => (
    <button type="button" className="session-trigger">
      Slot status {n}
    </button>
  );
  return SlotStatus;
};
const SlotDrawer = () => <p>Slot drawer content</p>;
const SlotWideEditor = () => (
  <div className="field">
    <span>Slot editor</span>
    <div style={{ overflowX: "auto" }}>
      <div className="slot-wide-editor mono" style={{ width: 900 }}>
        Slot wide editor
      </div>
    </div>
  </div>
);
const SlotSettings = () => <p>Slot settings</p>;

/**
 * Gancho solo del build de pruebas (004, research R13): `__nahualUiSlots.enable()` llena los
 * lugares reservados de contracts/panel-shell.md con contenido simulado para comprobar que nada
 * se desborda ni se tapa (SC-009); `pushNotice` empuja avisos del catálogo a la franja
 * (FR-013a). La rama se elimina del build de producción porque `import.meta.env.MODE` se
 * reemplaza al compilar; `verify:dist` lo comprueba.
 */
export function installTestSlots(): void {
  if (import.meta.env.MODE !== "test") return;
  // 005 (SC-005b, research X2): Playwright no puede contestar el diálogo del permiso. El espía
  // registra cada petición de acceso con su origen y contesta lo que la prueba pida.
  const calls: string[] = [];
  (window as { __nahualPermissionsSpy?: unknown }).__nahualPermissionsSpy = {
    calls,
    install(answer: boolean) {
      originAccess.request = (origin: string) => {
        calls.push(origin);
        return Promise.resolve(answer);
      };
    },
  };
  // 005-X3: el worker del diff carga bajo la CSP del panel y responde.
  (window as { __nahualDiffWorkerPing?: unknown }).__nahualDiffWorkerPing = () =>
    new Promise<string>((resolve) => {
      const worker = createDiffWorker() as Worker;
      const timer = setTimeout(() => resolve("timeout"), 3000);
      worker.addEventListener("message", (event: MessageEvent<{ type: string }>) => {
        clearTimeout(timer);
        worker.terminate();
        resolve(event.data.type);
      });
      worker.addEventListener("error", (event) => resolve(`error: ${event.message}`));
      worker.postMessage({ type: "ping" });
    });
  let enabled = false;
  (window as { __nahualUiSlots?: unknown }).__nahualUiSlots = {
    pushNotice: (messageKey: string, params?: string[]) =>
      usePanelStore.getState().pushNotice(messageKey, params),
    enable: () => {
      if (enabled) return;
      enabled = true;
      SECTIONS.push({
        id: "slot" as PanelSection,
        labelKey: "slot",
        label: "Slot",
        count: () => 3,
        countTone: "neutral",
        render: SlotSection,
      });
      STATUS_ITEMS.push(
        { id: "slot1", render: slotStatus(1) },
        { id: "slot2", render: slotStatus(2) },
      );
      BATCH_ACTIONS.push({
        id: "slot",
        labelKey: "slot",
        label: "Slot batch action",
        minSelected: 2,
        run: () => undefined,
      });
      SETTINGS_SECTIONS.push({
        id: "slot",
        labelKey: "slot",
        label: "Slot settings",
        render: SlotSettings,
      });
      DRAWER_SLOT.label = "Slot drawer";
      DRAWER_SLOT.content = SlotDrawer;
      RULE_EDITOR_SLOTS.push(SlotWideEditor);
      usePanelStore.getState().bumpSlots();
    },
  };
}
