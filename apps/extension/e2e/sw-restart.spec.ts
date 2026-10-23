import type { BrowserContext, Page, Worker } from "@playwright/test";
import {
  addPattern,
  attach,
  openApp,
  openPanel,
  ownSessions,
  pausedOption,
  startFetch,
  statusOf,
  tabIdOf,
} from "./fixtures/panel.ts";
import { expect, test } from "./fixtures/extension.ts";

const isNahual = (w: Worker) => w.url().endsWith("/service-worker-loader.js");

async function nextNahualWorker(context: BrowserContext, previous: Worker): Promise<Worker> {
  for (;;) {
    const current = context.serviceWorkers().find((w) => isNahual(w) && w !== previous);
    if (current) return current;
    await context.waitForEvent("serviceworker", { timeout: 10_000 });
  }
}

async function pauseOne(page: Page, panel: Page, apiOrigin: string) {
  await addPattern(panel, "*echo-headers*", "request");
  const started = Date.now();
  const response = startFetch(page, `${apiOrigin}/echo-headers`);
  await expect(pausedOption(panel, "/echo-headers")).toBeVisible();
  return { response, started };
}

async function registryOf(worker: Worker) {
  return worker.evaluate(
    async () => (await chrome.storage.session.get("nahual.sessions"))["nahual.sessions"] ?? [],
  );
}

// Pendiente de T075: v2 reemplazó los patrones por reglas; se migra con la historia 2.
test.fixme("variante 1: chrome.runtime.reload() con un request pausado", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const app = await openApp(context, servers.appOrigin);
  const tabId = await tabIdOf(nahualWorker, `${servers.appOrigin}/`);
  const panel = await openPanel(context, extensionId, tabId);
  await attach(panel);
  const { response } = await pauseOne(app, panel, servers.apiOrigin);

  const t0 = Date.now();
  await nahualWorker.evaluate(() => chrome.runtime.reload()).catch(() => {});

  // El request pausado recibe su respuesta sin cambios en < 5 s.
  const result = await response;
  expect(result.status).toBe(200);
  expect(JSON.parse(result.body).headers["x-nahual"]).toBeUndefined();
  expect(Date.now() - t0).toBeLessThan(5_000);

  // La recarga cierra la pestaña del panel.
  await expect.poll(() => panel.isClosed()).toBe(true);

  // Con --load-extension, Chromium deja la extensión descargada tras runtime.reload() (limitación
  // del entorno de pruebas, ver research E5). Si vuelve, se verifica el arranque limpio; la
  // limpieza tras un reinicio con el panel abierto la cubre la variante 2.
  const reopened = await openPanel(context, extensionId, tabId).catch(() => undefined);
  if (!reopened) {
    test.info().annotations.push({
      type: "limitación",
      description: "La extensión no vuelve a cargarse tras runtime.reload() con --load-extension.",
    });
    return;
  }
  await expect(statusOf(reopened)).toContainText("Disconnected");
  const worker = await nextNahualWorker(context, nahualWorker);
  expect(await ownSessions(worker)).toEqual([]);
  expect(await registryOf(worker)).toEqual([]);
});

// Pendiente de T075: v2 reemplazó los patrones por reglas; se migra con la historia 2.
test.fixme("variante 2: detener el service worker con el panel abierto", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const app = await openApp(context, servers.appOrigin);
  const tabId = await tabIdOf(nahualWorker, `${servers.appOrigin}/`);
  const panel = await openPanel(context, extensionId, tabId);
  await attach(panel);
  const { response } = await pauseOne(app, panel, servers.apiOrigin);

  const cdp = await context.newCDPSession(app);
  const versions: { versionId: string; scriptURL: string; runningStatus: string }[] = [];
  cdp.on("ServiceWorker.workerVersionUpdated", (e) => versions.push(...e.versions));
  await cdp.send("ServiceWorker.enable");
  await expect
    .poll(() => versions.some((v) => v.scriptURL.includes("service-worker-loader")))
    .toBe(true);
  const version = versions.find((v) => v.scriptURL.includes("service-worker-loader"));
  const t0 = Date.now();
  await cdp.send("ServiceWorker.stopWorker", { versionId: version?.versionId ?? "" });
  await expect.poll(() => versions.at(-1)?.runningStatus).toBe("stopped");

  // La página recibe la respuesta sin cambios en < 5 s.
  const result = await response;
  expect(result.status).toBe(200);
  expect(JSON.parse(result.body).headers["x-nahual"]).toBeUndefined();
  expect(Date.now() - t0).toBeLessThan(5_000);

  // El panel reconecta su puerto solo, el SW arrancó de nuevo y limpió la sesión.
  await expect(statusOf(panel)).toContainText("Disconnected", { timeout: 5_000 });
  const worker = await nextNahualWorker(context, nahualWorker).catch(() => nahualWorker);
  expect(await ownSessions(worker)).toEqual([]);
  expect(await registryOf(worker)).toEqual([]);
});
