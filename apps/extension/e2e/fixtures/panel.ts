import { expect, type BrowserContext, type Page, type Worker } from "@playwright/test";

/** tabId de la pestaña con esa URL, vía chrome.debugger.getTargets (sin permiso "tabs"). */
export async function tabIdOf(worker: Worker, url: string): Promise<number> {
  const find = () =>
    worker.evaluate(
      async (u) => (await chrome.debugger.getTargets()).find((t) => t.url === u)?.tabId ?? -1,
      url,
    );
  await expect.poll(find).toBeGreaterThanOrEqual(0);
  return find();
}

/**
 * Pestañas en las que Nahual sigue adjunto. getTargets no dice qué cliente está adjunto
 * (research D6): se prueba un comando inocuo, que solo funciona si la sesión es nuestra.
 */
export function ownSessions(worker: Worker) {
  return worker.evaluate(async () => {
    const tabs = (await chrome.debugger.getTargets()).flatMap((t) =>
      t.attached && t.tabId !== undefined ? [t.tabId] : [],
    );
    const own: number[] = [];
    for (const tabId of tabs) {
      try {
        await chrome.debugger.sendCommand({ tabId }, "Target.getTargetInfo");
        own.push(tabId);
      } catch {
        // No es nuestra.
      }
    }
    return own;
  });
}

export async function openApp(context: BrowserContext, appOrigin: string) {
  const app = await context.newPage();
  await app.goto(`${appOrigin}/`);
  return app;
}

/** Abre el panel fuera de DevTools (solo build de pruebas, research D7). */
export async function openPanel(context: BrowserContext, extensionId: string, tabId: number) {
  const panel = await context.newPage();
  await panel.goto(
    `chrome-extension://${extensionId}/src/panel/panel.html?__nahualTestTabId=${tabId}`,
  );
  await expect(panel.getByRole("status")).toBeVisible();
  return panel;
}

export const statusOf = (panel: Page) => panel.getByRole("status");

export async function attach(panel: Page) {
  await panel.getByRole("button", { name: /^Attach/ }).click();
  await expect(statusOf(panel)).toContainText("Attached");
}

export async function addPattern(panel: Page, urlPattern: string, stage: "request" | "response") {
  await panel.getByLabel("URL pattern").fill(urlPattern);
  await panel.getByLabel("Stage").selectOption(stage);
  await panel.getByRole("button", { name: "Add pattern" }).click();
  await expect(panel.getByText(urlPattern, { exact: true })).toBeVisible();
}

export async function removeAllPatterns(panel: Page) {
  const buttons = panel.getByRole("button", { name: /^Remove pattern/ });
  while ((await buttons.count()) > 0) {
    const before = await buttons.count();
    await buttons.first().click();
    await expect(buttons).toHaveCount(before - 1);
  }
}

export const pausedOption = (panel: Page, text: string | RegExp) =>
  panel.getByRole("listbox").getByRole("option").filter({ hasText: text });

/** Lanza un fetch desde la app sin esperarlo (quedará pausado). */
export function startFetch(app: Page, url: string) {
  return app.evaluate(async (u) => {
    const r = await fetch(u);
    return {
      status: r.status,
      url: r.url,
      nahualResponse: r.headers.get("x-nahual-response"),
      body: await r.text(),
    };
  }, url);
}
