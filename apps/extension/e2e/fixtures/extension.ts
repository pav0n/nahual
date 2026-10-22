import { chromium, test as base, type BrowserContext, type Worker } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startServers, type TestServers } from "./servers.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
export const NAHUAL_DIST = path.resolve(here, "../../dist-test");
export const CONFLICT_EXTENSION = path.resolve(here, "conflict-extension");

interface Fixtures {
  /** Carga también la extensión auxiliar que actúa como segundo cliente de debugger. */
  withConflictExtension: boolean;
  context: BrowserContext;
  nahualWorker: Worker;
  extensionId: string;
  conflictWorker: Worker;
  servers: TestServers;
}

const isNahual = (w: Worker) => !w.url().endsWith("/background.js");

export const test = base.extend<Fixtures>({
  withConflictExtension: [false, { option: true }],

  context: async ({ withConflictExtension }, use) => {
    const extensions = withConflictExtension ? [NAHUAL_DIST, CONFLICT_EXTENSION] : [NAHUAL_DIST];
    const context = await chromium.launchPersistentContext("", {
      channel: "chromium",
      headless: process.env.HEADED !== "1",
      args: [
        `--disable-extensions-except=${extensions.join(",")}`,
        `--load-extension=${extensions.join(",")}`,
      ],
    });
    await use(context);
    await context.close();
  },

  nahualWorker: async ({ context }, use) => {
    let worker = context.serviceWorkers().find(isNahual);
    while (!worker) {
      const next = await context.waitForEvent("serviceworker");
      if (isNahual(next)) worker = next;
    }
    await use(worker);
  },

  extensionId: async ({ nahualWorker }, use) => {
    await use(new URL(nahualWorker.url()).host);
  },

  conflictWorker: async ({ context }, use) => {
    const isConflict = (w: Worker) => w.url().endsWith("/background.js");
    let worker = context.serviceWorkers().find(isConflict);
    while (!worker) {
      const next = await context.waitForEvent("serviceworker");
      if (isConflict(next)) worker = next;
    }
    await use(worker);
  },

  // eslint-disable-next-line no-empty-pattern -- Playwright exige desestructurar los fixtures.
  servers: async ({}, use) => {
    const servers = await startServers();
    await use(servers);
    await servers.close();
  },
});

export const expect = test.expect;
