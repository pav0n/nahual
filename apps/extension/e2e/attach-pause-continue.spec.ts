import {
  addPattern,
  attach,
  openApp,
  openPanel,
  ownSessions,
  pausedOption,
  removeAllPatterns,
  startFetch,
  statusOf,
  tabIdOf,
} from "./fixtures/panel.ts";
import { expect, test } from "./fixtures/extension.ts";

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

  await test.step("pausa en Request y continuar sin cambios", async () => {
    await addPattern(panel, "*echo-headers*", "request");
    const response = startFetch(app, `${servers.apiOrigin}/echo-headers`);
    await expect(pausedOption(panel, "/echo-headers")).toBeVisible();
    await expect(pausedOption(panel, "/echo-headers")).toContainText("Continues automatically in");
    await panel.getByRole("button", { name: /^Continue Alt/ }).click();
    expect((await response).status).toBe(200);
    await expect(panel.getByText("Continued unchanged")).toBeVisible();
  });

  await test.step("pausa en Request y continuar con X-Nahual: 1", async () => {
    const response = startFetch(app, `${servers.apiOrigin}/echo-headers`);
    await expect(pausedOption(panel, "/echo-headers")).toBeVisible();
    await panel.getByRole("button", { name: "Add header" }).click();
    await panel.getByLabel("Name").last().fill("X-Nahual");
    await panel.getByLabel("Value").last().fill("1");
    await panel.getByRole("button", { name: "Continue with changes" }).click();
    const { body } = await response;
    expect(JSON.parse(body).headers["x-nahual"]).toBe("1");
    await expect(panel.getByText("Continued with changes")).toBeVisible();
  });

  await test.step("pausa en Response y añadir un header de respuesta", async () => {
    await removeAllPatterns(panel);
    await addPattern(panel, "*/data", "response");
    const response = startFetch(app, `${servers.apiOrigin}/data`);
    await expect(pausedOption(panel, "/data")).toContainText("Status 200");
    await expect(pausedOption(panel, "/data")).toContainText("Body: 11 bytes");
    await panel.getByRole("button", { name: "Add header" }).click();
    await panel.getByLabel("Name").last().fill("X-Nahual-Response");
    await panel.getByLabel("Value").last().fill("yes");
    await panel.getByRole("button", { name: "Continue with changes" }).click();
    expect((await response).nahualResponse).toBe("yes");
  });

  await test.step("redirección: body no disponible", async () => {
    await removeAllPatterns(panel);
    await addPattern(panel, "*redirect*", "response");
    const response = startFetch(app, `${servers.apiOrigin}/redirect`);
    await expect(pausedOption(panel, "/redirect")).toContainText("Status 302");
    await expect(pausedOption(panel, "/redirect")).toContainText("Body not available");
    await panel.getByRole("button", { name: /^Continue Alt/ }).click();
    const result = await response;
    expect(result.status).toBe(200);
    expect(result.url).toBe(`${servers.apiOrigin}/data`);
  });

  await test.step("navegar con un request pausado: la pausa se abandona y la página carga", async () => {
    await removeAllPatterns(panel);
    await panel.getByLabel(/Pause timeout/).fill("5");
    await panel.getByRole("button", { name: "Apply" }).click();
    await addPattern(panel, "*echo-headers*", "request");
    void startFetch(app, `${servers.apiOrigin}/echo-headers`).catch(() => {});
    await expect(pausedOption(panel, "/echo-headers")).toBeVisible();
    await app.goto(`${servers.appOrigin}/next`);
    await expect(app.getByRole("heading", { name: "Nahual test app" })).toBeVisible();
    await expect(pausedOption(panel, "/echo-headers")).toHaveCount(0, { timeout: 10_000 });
    await expect(panel.locator('[data-outcome="abandoned"]')).toHaveCount(1);
  });

  await test.step("soltar", async () => {
    await panel.getByRole("button", { name: /^Detach/ }).click();
    await expect(statusOf(panel)).toContainText("Disconnected");
    expect(await ownSessions(nahualWorker)).toEqual([]);
  });
});
