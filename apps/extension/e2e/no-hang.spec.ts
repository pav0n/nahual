import type { BrowserContext, Page, Worker } from "@playwright/test";
import type { TestServers } from "./fixtures/servers.ts";
import {
  attachAndReload,
  createRule,
  openApp,
  openPanel,
  openQueue,
  openTab,
  ownSessions,
  pausedEditor,
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

/** Lanza n fetch a la API desde la app sin esperarlos (quedarán pausados). */
function startMany(app: Page, apiOrigin: string, path: string, n: number) {
  return app.evaluate(
    async ([base, p, count]) => {
      const results = await Promise.allSettled(
        Array.from({ length: count as number }, async (_, i) => {
          const response = await fetch(`${base as string}${p as string}?n=${i}`);
          await response.text();
          return response.status;
        }),
      );
      return results.filter((r) => r.status === "fulfilled").length;
    },
    [apiOrigin, path, n] as const,
  );
}

test.describe("cola de pausados (historia 2)", () => {
  async function withQueue(
    {
      context,
      nahualWorker,
      extensionId,
      servers,
    }: { context: BrowserContext; nahualWorker: Worker; extensionId: string; servers: TestServers },
    count = 3,
  ) {
    const app = await openApp(context, servers.appOrigin);
    const tabId = await tabIdOf(nahualWorker, `${servers.appOrigin}/`);
    const panel = await openPanel(context, extensionId, tabId);
    await attachAndReload(panel, app);
    await createRule(panel, { name: "Data", pattern: "*/data*", stage: "request" });
    const done = startMany(app, servers.apiOrigin, "/data", count);
    // Al navegar o cerrar la pestaña, la evaluación pendiente se rechaza: es lo esperado.
    done.catch(() => {});
    await openQueue(panel);
    await expect(panel.locator(".queue").getByRole("option")).toHaveCount(count);
    return { app, panel, done };
  }

  test("navegar con items en cola: la página navega y la cola se vacía", async ({
    context,
    nahualWorker,
    extensionId,
    servers,
  }) => {
    const fixtures = { context, nahualWorker, extensionId, servers };
    const { app, panel } = await withQueue(fixtures);
    await app.goto(`${fixtures.servers.appOrigin}/next`);
    await expect(app.getByRole("heading", { name: "Nahual test app" })).toBeVisible();
    await expect(panel.getByText("Nothing is paused")).toBeVisible();
  });

  test("cerrar la pestaña con items en cola no deja sesiones ni pausas", async ({
    context,
    nahualWorker,
    extensionId,
    servers,
  }) => {
    const fixtures = { context, nahualWorker, extensionId, servers };
    const { app } = await withQueue(fixtures);
    await app.close();
    await expect.poll(() => ownSessions(fixtures.nahualWorker)).toEqual([]);
  });

  test("Soltar con items en cola: todos continúan sin cambios", async ({
    context,
    nahualWorker,
    extensionId,
    servers,
  }) => {
    const fixtures = { context, nahualWorker, extensionId, servers };
    const { panel, done } = await withQueue(fixtures);
    await panel.getByRole("button", { name: /^Detach/ }).click();
    expect(await done).toBe(3);
    await expect(panel.getByText("Nothing is paused")).toBeVisible();
    await expect(statusOf(panel)).toContainText("Disconnected");
  });

  test("cerrar el panel con items en cola: todos continúan", async ({
    context,
    nahualWorker,
    extensionId,
    servers,
  }) => {
    const fixtures = { context, nahualWorker, extensionId, servers };
    const { panel, done } = await withQueue(fixtures);
    await panel.close();
    expect(await done).toBe(3);
  });

  test("un fallo al aplicar un cambio continúa sin modificar y lo avisa", async ({
    context,
    nahualWorker,
    extensionId,
    servers,
  }) => {
    const fixtures = { context, nahualWorker, extensionId, servers };
    const { panel, done } = await withQueue(fixtures, 1);
    await setFault(fixtures.nahualWorker, "apply", true);
    try {
      await pausedEditor(panel).getByRole("button", { name: "Add header" }).click();
      await pausedEditor(panel)
        .getByLabel(/^Header name \d+$/)
        .last()
        .fill("x-nahual");
      await pausedEditor(panel).getByRole("button", { name: "Continue with changes" }).click();
      expect(await done).toBe(1);
      await expect(panel.getByText(/could not be applied|was not applied/)).toBeVisible();
      const received = fixtures.servers.received.filter((r) => r.path === "/data").at(-1);
      expect(received?.headers["x-nahual"]).toBeUndefined();
    } finally {
      await setFault(fixtures.nahualWorker, "apply", false);
    }
  });

  test("cola llena (101 pausas): el 101 continúa sin cambios y nada queda colgado", async ({
    context,
    nahualWorker,
    extensionId,
    servers,
  }) => {
    const fixtures = { context, nahualWorker, extensionId, servers };
    test.setTimeout(120_000);
    const { panel, done } = await withQueue(fixtures, 100).catch(async () => {
      throw new Error("no se pudieron pausar 100 requests");
    });
    const extra = fixtures.servers.received.length;
    const app = fixtures.context
      .pages()
      .find((p) => p.url().startsWith(fixtures.servers.appOrigin));
    if (!app) throw new Error("sin app");
    const overflow = await startMany(app, fixtures.servers.apiOrigin, "/data", 1);
    expect(overflow).toBe(1);
    expect(fixtures.servers.received.length).toBeGreaterThan(extra);
    await panel.getByRole("button", { name: /^Continue all/ }).click();
    expect(await done).toBe(100);
  });

  test("dos pestañas del mismo sitio: cola y sesión independientes, reglas compartidas", async ({
    context,
    nahualWorker,
    extensionId,
    servers,
  }) => {
    const appA = await openApp(context, servers.appOrigin);
    const tabA = await tabIdOf(nahualWorker, `${servers.appOrigin}/`);
    const panelA = await openPanel(context, extensionId, tabA);
    await attachAndReload(panelA, appA);
    await createRule(panelA, { name: "Data", pattern: "*/data*", stage: "request" });

    const appB = await context.newPage();
    await appB.goto(`${servers.appOrigin}/next`);
    const tabB = await tabIdOf(nahualWorker, `${servers.appOrigin}/next`);
    const panelB = await openPanel(context, extensionId, tabB);
    await panelB.getByRole("button", { name: /^Attach/ }).click();
    await openTab(panelB, "Rules");
    await expect(panelB.locator(".rule-item").filter({ hasText: "Data" })).toBeVisible();

    const doneA = startMany(appA, servers.apiOrigin, "/data", 1);
    await openQueue(panelA);
    await openQueue(panelB);
    await expect(panelA.locator(".queue").getByRole("option")).toHaveCount(1);
    await expect(panelB.getByText("Nothing is paused")).toBeVisible();

    await panelB.getByRole("button", { name: /^Detach/ }).click();
    await expect(statusOf(panelA)).toContainText("Attached");
    await expect(panelA.locator(".queue").getByRole("option")).toHaveCount(1);
    await panelA.keyboard.press("Alt+Shift+C");
    expect(await doneA).toBe(1);
  });
});
