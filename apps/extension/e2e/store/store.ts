import { readFileSync } from "node:fs";
import path from "node:path";
import type { BrowserContext, Page, Worker } from "@playwright/test";
import { expect, test as base } from "../fixtures/extension.ts";
import { openApp, openPanel, tabIdOf } from "../fixtures/panel.ts";
import { startServers, type TestServers } from "../fixtures/servers.ts";

// 007 T038: lo común de las capturas y el video del listing (docs/store/assets/README.md).

export const ROOT = path.resolve(import.meta.dirname, "../../../..");
export const ASSETS = path.join(ROOT, "docs/store/assets");
export const LOGO = readFileSync(path.join(ROOT, "docs/brand/nahual.svg"), "utf8");
export const SIZE = { width: 1280, height: 800 };

/** Puertos fijos y con aspecto de desarrollo local: las URLs salen en las capturas. */
export const test = base.extend<{ servers: TestServers }>({
  // eslint-disable-next-line no-empty-pattern -- Playwright exige desestructurar los fixtures.
  servers: async ({}, use) => {
    const servers = await startServers({ app: 5173, api: 8787, third: 8788 });
    await use(servers);
    await servers.close();
  },
});

export async function setup(
  context: BrowserContext,
  worker: Worker,
  extensionId: string,
  servers: TestServers,
) {
  const app = await openApp(context, servers.appOrigin);
  const tabId = await tabIdOf(worker, `${servers.appOrigin}/`);
  const panel = await openPanel(context, extensionId, tabId);
  await panel.setViewportSize(SIZE);
  return { app, panel };
}

/** Sin avisos pasajeros ni foco en la captura. */
export async function settle(panel: Page) {
  await expect(panel.locator(".toast")).toHaveCount(0, { timeout: 15_000 });
  await panel.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
}
