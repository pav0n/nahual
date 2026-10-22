import type { DebuggerPort } from "./debugger-port.ts";
import type { SessionRegistry } from "./session-registry.ts";

/**
 * Al arrancar el service worker (también tras una recarga o caída), suelta toda sesión de
 * debugger de esta extensión que haya quedado de la ejecución anterior (FR-005). Al soltarla,
 * Chrome continúa los requests que esa sesión tenía pausados. Nunca lanza.
 */
export async function cleanupOrphans(options: {
  debugger: DebuggerPort;
  registry: SessionRegistry;
  extensionId: string;
}): Promise<void> {
  const { debugger: cdp, registry, extensionId } = options;
  const tabs = new Set<number>();

  try {
    for (const target of await cdp.getTargets()) {
      if (target.attached && target.extensionId === extensionId && target.tabId !== undefined) {
        tabs.add(target.tabId);
      }
    }
  } catch {
    // Sin getTargets seguimos con el registro.
  }
  try {
    for (const tabId of await registry.list()) tabs.add(tabId);
  } catch {
    // Registro ilegible: nos quedamos con lo que dio getTargets.
  }

  await Promise.all(
    [...tabs].map((tabId) =>
      cdp.detach(tabId).catch(() => {
        // Ya no estaba adjunta o la pestaña no existe.
      }),
    ),
  );
  await registry.clear().catch(() => {});
}
