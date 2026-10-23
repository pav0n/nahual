import {
  attach,
  createRule,
  openApp,
  openPanel,
  openQueue,
  ownSessions,
  pausedEditor,
  pausedOption,
  setPauseTimeout,
  startFetch,
  statusOf,
  tabIdOf,
} from "./fixtures/panel.ts";
import { expect, test } from "./fixtures/extension.ts";

// Ciclo de 001 con reglas (T075): adjuntar → pausar → continuar → soltar.
test("adjuntar → pausar → continuar → soltar", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const app = await openApp(context, servers.appOrigin);
  const tabId = await tabIdOf(nahualWorker, `${servers.appOrigin}/`);
  const panel = await openPanel(context, extensionId, tabId);

  await test.step("adjuntar", async () => {
    await expect(statusOf(panel)).toContainText("Disconnected");
    await attach(panel);
    expect(await ownSessions(nahualWorker)).toEqual([tabId]);
  });

  await createRule(panel, { name: "Echo", pattern: "*echo-headers*", stage: "request" });

  await test.step("pausar y continuar sin cambios", async () => {
    const response = startFetch(app, `${servers.apiOrigin}/echo-headers`);
    await openQueue(panel);
    await expect(pausedOption(panel, "/echo-headers")).toBeVisible();
    await expect(pausedOption(panel, "/echo-headers")).toContainText("Continues automatically in");
    await pausedEditor(panel).getByRole("button", { name: "Continue unchanged" }).click();
    const result = await response;
    expect(result.status).toBe(200);
    expect(JSON.parse(result.body).headers["x-nahual"]).toBeUndefined();
  });

  await test.step("continuar con un header añadido", async () => {
    const response = startFetch(app, `${servers.apiOrigin}/echo-headers`);
    await expect(pausedOption(panel, "/echo-headers")).toBeVisible();
    const editor = pausedEditor(panel);
    await editor.getByRole("button", { name: "Add header" }).click();
    const names = editor.getByLabel(/^Header name \d+$/);
    await names.last().fill("x-nahual");
    await editor.getByLabel("Value of x-nahual").fill("1");
    await editor.getByRole("button", { name: "Continue with changes" }).click();
    expect(JSON.parse((await response).body).headers["x-nahual"]).toBe("1");
  });

  await test.step("el timeout continúa sin cambios", async () => {
    await setPauseTimeout(panel, 5);
    void startFetch(app, `${servers.apiOrigin}/echo-headers`).catch(() => {});
    await expect(pausedOption(panel, "/echo-headers")).toContainText(
      "Continues automatically in 5 s",
    );
    await expect(pausedOption(panel, "/echo-headers")).toHaveCount(0, { timeout: 10_000 });
  });

  await test.step("soltar", async () => {
    await panel.getByRole("button", { name: /^Detach/ }).click();
    await expect(statusOf(panel)).toContainText("Disconnected");
    expect(await ownSessions(nahualWorker)).toEqual([]);
  });
});
