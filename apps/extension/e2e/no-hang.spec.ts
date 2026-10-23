import type { Page } from "@playwright/test";
import {
  attachAndReload,
  openApp,
  openPanel,
  ownSessions,
  setFault,
  statusOf,
  tabIdOf,
} from "./fixtures/panel.ts";
import { expect, test } from "./fixtures/extension.ts";

// SC-003: ningún error ni corte de Nahual deja la página colgada. Cada caso lanza una ráfaga de
// requests y exige que todos terminen.

/** Lanza n fetch en paralelo desde la app y devuelve cuántos terminaron con status 200. */
function burst(app: Page, apiOrigin: string, n = 30) {
  return app.evaluate(
    async ([base, count]) => {
      const results = await Promise.all(
        Array.from({ length: count as number }, async (_, i) => {
          const response = await fetch(`${base as string}/data?burst=${i}`);
          await response.text();
          return response.status;
        }),
      );
      return results.filter((s) => s === 200).length;
    },
    [apiOrigin, n] as const,
  );
}

test.describe("captura (historia 1)", () => {
  test("soltar el debugger en medio de una ráfaga", async ({
    context,
    nahualWorker,
    extensionId,
    servers,
  }) => {
    const app = await openApp(context, servers.appOrigin);
    const tabId = await tabIdOf(nahualWorker, `${servers.appOrigin}/`);
    const panel = await openPanel(context, extensionId, tabId);
    await attachAndReload(panel, app);
    const done = burst(app, servers.apiOrigin);
    await panel.getByRole("button", { name: /^Detach/ }).click();
    expect(await done).toBe(30);
    await expect(statusOf(panel)).toContainText("Disconnected");
  });

  test("cerrar el panel en medio de una ráfaga", async ({
    context,
    nahualWorker,
    extensionId,
    servers,
  }) => {
    const app = await openApp(context, servers.appOrigin);
    const tabId = await tabIdOf(nahualWorker, `${servers.appOrigin}/`);
    const panel = await openPanel(context, extensionId, tabId);
    await attachAndReload(panel, app);
    const done = burst(app, servers.apiOrigin);
    await panel.close();
    expect(await done).toBe(30);
    await expect.poll(() => ownSessions(nahualWorker)).toEqual([]);
  });

  test("un error en la captura no afecta al tráfico", async ({
    context,
    nahualWorker,
    extensionId,
    servers,
  }) => {
    const app = await openApp(context, servers.appOrigin);
    const tabId = await tabIdOf(nahualWorker, `${servers.appOrigin}/`);
    const panel = await openPanel(context, extensionId, tabId);
    await attachAndReload(panel, app);
    await setFault(nahualWorker, "capture", true);
    try {
      expect(await burst(app, servers.apiOrigin)).toBe(30);
      await app.reload();
      await expect(app.getByRole("heading", { name: "Nahual test app" })).toBeVisible();
    } finally {
      await setFault(nahualWorker, "capture", false);
    }
  });
});
