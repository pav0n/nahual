import type { BrowserContext, Page, Worker } from "@playwright/test";
import type { TestServers } from "./fixtures/servers.ts";
import {
  attach,
  attachAndReload,
  corsCall,
  openApp,
  openPanel,
  relaxFrom,
  relaxIndicator,
  statusOf,
  tabIdOf,
} from "./fixtures/panel.ts";
import { expect, test } from "./fixtures/extension.ts";

interface Fx {
  context: BrowserContext;
  nahualWorker: Worker;
  extensionId: string;
  servers: TestServers;
}

async function relaxed({ context, nahualWorker, extensionId, servers }: Fx) {
  const app = await openApp(context, servers.appOrigin);
  const tabId = await tabIdOf(nahualWorker, `${servers.appOrigin}/`);
  const panel = await openPanel(context, extensionId, tabId);
  await attachAndReload(panel, app);
  await corsCall(app, "cors-none");
  await relaxFrom(panel, "/cors/none");
  expect((await corsCall(app, "cors-none")).status).toBe(200);
  return { app, panel, tabId };
}

const blocked = async (app: Page) =>
  expect((await corsCall(app, "cors-none")).error).toContain("Failed to fetch");

test("(a) vence: indicador fuera, aviso y bloqueado de nuevo", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  // 15 min ⇒ 5 s con la escala del build de pruebas (research R16).
  await nahualWorker.evaluate(() => {
    const time = (globalThis as { __nahualCorsTimeScale?: { scale: number } })
      .__nahualCorsTimeScale;
    if (time) time.scale = 180;
  });
  const app = await openApp(context, servers.appOrigin);
  const tabId = await tabIdOf(nahualWorker, `${servers.appOrigin}/`);
  const panel = await openPanel(context, extensionId, tabId);
  await attachAndReload(panel, app);
  await corsCall(app, "cors-none");
  await relaxFrom(panel, "/cors/none", async (form) => {
    await form.getByLabel("Duration").selectOption({ label: "15 min" });
  });
  expect((await corsCall(app, "cors-none")).status).toBe(200);
  await expect(relaxIndicator(panel)).toHaveCount(0, { timeout: 15_000 });
  await expect(panel.locator(".notices")).toContainText("expired");
  await blocked(app);
});

test("(b) soltar el debugger la termina con aviso", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const fx = { context, nahualWorker, extensionId, servers };
  const { app, panel } = await relaxed(fx);
  await panel.getByRole("button", { name: /^Detach/ }).click();
  await expect(relaxIndicator(panel)).toHaveCount(0);
  await expect(panel.locator(".notices")).toContainText("debugger was detached");
  await blocked(app);
});

test("(c) cerrar el panel y reabrirlo: sin relajación", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const fx = { context, nahualWorker, extensionId, servers };
  const { app, panel, tabId } = await relaxed(fx);
  await panel.close();
  const reopened = await openPanel(fx.context, fx.extensionId, tabId);
  // Cerrar el panel soltó el debugger; volver a adjuntar no restaura la relajación (FR-017).
  await expect(statusOf(reopened)).toContainText("Disconnected");
  await reopened.getByRole("button", { name: /^(Attach|Reconnect)/ }).click();
  await expect(statusOf(reopened)).toContainText("Attached");
  await expect(relaxIndicator(reopened)).toHaveCount(0);
  await blocked(app);
});

test("(d) cerrar la pestaña: nada aplica en una pestaña nueva", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const fx = { context, nahualWorker, extensionId, servers };
  const { app, panel } = await relaxed(fx);
  await app.close();
  await expect(relaxIndicator(panel)).toHaveCount(0);
  const fresh = await openApp(fx.context, fx.servers.appOrigin);
  const freshTab = await tabIdOf(fx.nahualWorker, `${fx.servers.appOrigin}/`);
  const freshPanel = await openPanel(fx.context, fx.extensionId, freshTab);
  await attach(freshPanel);
  await expect(relaxIndicator(freshPanel)).toHaveCount(0);
  await blocked(fresh);
});

test("(e) reinicio del SW: aviso, sin indicador y bloqueado", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const fx = { context, nahualWorker, extensionId, servers };
  const { app, panel } = await relaxed(fx);
  const cdp = await fx.context.newCDPSession(app);
  const versions: { versionId: string; scriptURL: string; runningStatus: string }[] = [];
  cdp.on("ServiceWorker.workerVersionUpdated", (e) => versions.push(...e.versions));
  await cdp.send("ServiceWorker.enable");
  await expect
    .poll(() => versions.some((v) => v.scriptURL.includes("service-worker-loader")))
    .toBe(true);
  const version = versions.find((v) => v.scriptURL.includes("service-worker-loader"));
  await cdp.send("ServiceWorker.stopWorker", { versionId: version?.versionId ?? "" });
  await expect(panel.locator(".notices")).toContainText("Nahual restarted", { timeout: 10_000 });
  await expect(relaxIndicator(panel)).toHaveCount(0);
  await blocked(app);
});

test("(f) navegar a otro origen y volver: sin efecto y de nuevo activa", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const fx = { context, nahualWorker, extensionId, servers };
  const { app, panel } = await relaxed(fx);
  await app.getByTestId("nav-third").click();
  await app.waitForURL(`${fx.servers.thirdOrigin}/page`);
  await expect(relaxIndicator(panel)).toContainText("no effect");
  await app.getByTestId("nav-back").click();
  await app.waitForURL(`${fx.servers.appOrigin}/`);
  await expect(relaxIndicator(panel)).toContainText("active");
  expect((await corsCall(app, "cors-none")).status).toBe(200);
});
