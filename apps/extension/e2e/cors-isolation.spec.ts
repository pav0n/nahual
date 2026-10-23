import {
  attachAndReload,
  corsCall,
  openApp,
  openCorsDetail,
  openPanel,
  relaxFrom,
  relaxIndicator,
  requestRow,
  tabIdOf,
} from "./fixtures/panel.ts";
import { expect, test } from "./fixtures/extension.ts";

const BLOCKED = "Blocked by CORS";
const MISSING = /did not send Access-Control-Allow-Origin/;

test("SC-002: la relajación no sale de su pestaña ni de sus orígenes", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  // Pestaña 1 con la relajación A ⇒ B.
  const app = await openApp(context, servers.appOrigin);
  const tabId = await tabIdOf(nahualWorker, `${servers.appOrigin}/`);
  const panel = await openPanel(context, extensionId, tabId);
  await attachAndReload(panel, app);
  await corsCall(app, "cors-none");
  await relaxFrom(panel, "/cors/none");
  expect((await corsCall(app, "cors-none")).status).toBe(200);

  // (a) La misma app en la pestaña 2, con su panel adjunto, sigue bloqueada.
  const second = await context.newPage();
  await second.goto(`${servers.appOrigin}/?second=1`);
  const secondTab = await tabIdOf(nahualWorker, `${servers.appOrigin}/?second=1`);
  const secondPanel = await openPanel(context, extensionId, secondTab);
  await attachAndReload(secondPanel, second);
  expect((await corsCall(second, "cors-none")).error).toContain("Failed to fetch");
  await expect(requestRow(secondPanel, "/cors/none").last()).toContainText(BLOCKED);
  const section = await openCorsDetail(secondPanel, "/cors/none");
  await expect(section.locator(".cors-cause")).toContainText(MISSING);
  // (d) La pestaña 2 no muestra indicador.
  await expect(relaxIndicator(secondPanel)).toHaveCount(0);

  // (b) Desde la pestaña 1, un tercer origen sigue bloqueado.
  expect((await corsCall(app, "cors-third")).error).toContain("Failed to fetch");
  await expect(requestRow(panel, servers.thirdOrigin).last()).toContainText(BLOCKED);

  // (c) Un iframe de otro origen en la pestaña 1 que llama a B sigue bloqueado.
  await app.getByTestId("load-frame").click();
  await expect.poll(() => app.frames().some((f) => f.url().endsWith("/frame"))).toBe(true);
  const frame = app.frames().find((f) => f.url().endsWith("/frame"));
  await frame?.waitForLoadState();
  const fromFrame = await frame?.evaluate(() =>
    (window as unknown as { callApi(): Promise<unknown> }).callApi(),
  );
  expect(String(fromFrame)).toContain("Failed to fetch");

  // La pestaña 1 sigue relajada para su app.
  expect((await corsCall(app, "cors-none")).status).toBe(200);
});
