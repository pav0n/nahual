import type { Page, Worker } from "@playwright/test";
import {
  callApi,
  openApp,
  openQueue,
  openTab,
  ownSessions,
  pausedEditor,
  statusOf,
  tabIdOf,
} from "./fixtures/panel.ts";
import { expect, test } from "./fixtures/extension.ts";

test.use({ freshProfile: true });

const onboarding = (panel: Page) => panel.getByRole("dialog");

async function storedSettings(worker: Worker) {
  return worker.evaluate(
    async () =>
      (
        (await chrome.storage.local.get("nahual.settings.v1"))["nahual.settings.v1"] as
          { settings: Record<string, unknown> } | undefined
      )?.settings,
  );
}

/** Abre el panel sin esperar el indicador: en el primer uso aparece el onboarding encima. */
async function openFreshPanel(page: Page, extensionId: string, tabId: number) {
  await page.goto(
    `chrome-extension://${extensionId}/src/panel/panel.html?__nahualTestTabId=${tabId}`,
  );
  return page;
}

test("US3-1/3: onboarding de 3 pasos que termina en «Adjuntar y empezar»", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  await openApp(context, servers.appOrigin);
  const tabId = await tabIdOf(nahualWorker, `${servers.appOrigin}/`);
  const panel = await openFreshPanel(await context.newPage(), extensionId, tabId);

  const dialog = onboarding(panel);
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Step 1 of 3");
  await expect(dialog.getByRole("heading")).toHaveText("Chrome will show a yellow bar");
  await dialog.getByRole("button", { name: "Next" }).click();
  await expect(dialog.getByRole("heading")).toHaveText("What Nahual sees");
  await expect(dialog).toContainText("including cookies and tokens");
  await dialog.getByRole("button", { name: "Next" }).click();
  await expect(dialog.getByRole("heading")).toHaveText("Nothing leaves your browser");
  await dialog.getByRole("button", { name: "Attach and start" }).click();

  await expect(dialog).toBeHidden();
  await expect(statusOf(panel)).toContainText("Attached");
  await expect
    .poll(() => storedSettings(nahualWorker))
    .toMatchObject({
      onboardingSeen: true,
      attachConsent: true,
    });
});

test("US3-2/4: tras el consentimiento, abrir el panel adjunta solo; el ajuste lo desactiva", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  await openApp(context, servers.appOrigin);
  const tabId = await tabIdOf(nahualWorker, `${servers.appOrigin}/`);
  let panel = await openFreshPanel(await context.newPage(), extensionId, tabId);
  await onboarding(panel).getByRole("button", { name: "Next" }).click();
  await onboarding(panel).getByRole("button", { name: "Next" }).click();
  await onboarding(panel).getByRole("button", { name: "Attach and start" }).click();
  await expect(statusOf(panel)).toContainText("Attached");
  await panel.close();
  await expect.poll(() => ownSessions(nahualWorker)).toEqual([]);

  panel = await openFreshPanel(await context.newPage(), extensionId, tabId);
  await expect(onboarding(panel)).toBeHidden();
  await expect(statusOf(panel)).toContainText("Attached");

  await panel.locator("details.settings summary").click();
  await panel.getByRole("switch", { name: "Attach when the panel opens" }).uncheck();
  await expect.poll(() => storedSettings(nahualWorker)).toMatchObject({ autoAttach: false });
  await panel.close();

  panel = await openFreshPanel(await context.newPage(), extensionId, tabId);
  await expect(statusOf(panel)).toContainText("Disconnected");
  await panel.waitForTimeout(500);
  expect(await ownSessions(nahualWorker)).toEqual([]);
});

test("US3-2: omitir el onboarding no adjunta; no vuelve a salir y «Ayuda» lo reabre", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  await openApp(context, servers.appOrigin);
  const tabId = await tabIdOf(nahualWorker, `${servers.appOrigin}/`);
  let panel = await openFreshPanel(await context.newPage(), extensionId, tabId);
  await onboarding(panel).getByRole("button", { name: "Skip" }).click();
  await expect(onboarding(panel)).toBeHidden();
  await expect(statusOf(panel)).toContainText("Disconnected");
  expect(await ownSessions(nahualWorker)).toEqual([]);
  await panel.close();

  panel = await openFreshPanel(await context.newPage(), extensionId, tabId);
  await expect(statusOf(panel)).toBeVisible();
  await expect(onboarding(panel)).toBeHidden();
  await panel.getByRole("button", { name: "Help" }).click();
  await expect(onboarding(panel)).toBeVisible();
  await panel.keyboard.press("Escape");
  await expect(onboarding(panel)).toBeHidden();
});

test("US3-5: indicador con estado, sitio, reglas y cola; Soltar no se readjunta solo", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  await openApp(context, servers.appOrigin);
  const tabId = await tabIdOf(nahualWorker, `${servers.appOrigin}/`);
  const panel = await openFreshPanel(await context.newPage(), extensionId, tabId);
  await onboarding(panel).getByRole("button", { name: "Next" }).click();
  await onboarding(panel).getByRole("button", { name: "Next" }).click();
  await onboarding(panel).getByRole("button", { name: "Attach and start" }).click();
  await expect(statusOf(panel)).toContainText(
    `Attached · Site: ${servers.appOrigin} · 0 active rules · 0 queued`,
  );
  await panel.getByRole("button", { name: /^Detach/ }).click();
  await expect(statusOf(panel)).toContainText("Disconnected");
  await expect(panel.getByRole("button", { name: /^Reconnect/ })).toBeVisible();
  await panel.waitForTimeout(800);
  await expect(statusOf(panel)).toContainText("Disconnected");
  expect(await ownSessions(nahualWorker)).toEqual([]);
});

test("US3-6/7/8 y SC-001: estados vacíos, plantilla y primera respuesta editada", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const app = await openApp(context, servers.appOrigin);
  const tabId = await tabIdOf(nahualWorker, `${servers.appOrigin}/`);
  const started = Date.now();
  const panel = await openFreshPanel(await context.newPage(), extensionId, tabId);
  await onboarding(panel).getByRole("button", { name: "Next" }).click();
  await onboarding(panel).getByRole("button", { name: "Next" }).click();
  await onboarding(panel).getByRole("button", { name: "Attach and start" }).click();

  // US3-8: sin tráfico capturado, sugiere recargar.
  await expect(panel.getByText("Reload the page to capture its requests.")).toBeVisible();

  // US3-6/7: estado vacío de reglas con la plantilla sugerida.
  await openTab(panel, "Rules");
  await expect(panel.getByText("No rules yet")).toBeVisible();
  const templates = panel.getByRole("group", { name: "Templates" });
  await expect(templates.getByRole("button").first()).toContainText("Pause error responses");
  await expect(templates.getByRole("button", { name: /Pause empty responses/ })).toBeVisible();
  await templates.getByRole("button", { name: /Pause error responses/ }).click();
  const editor = panel.locator(".editor");
  await expect(editor.getByLabel("Name", { exact: true })).toHaveValue("Pause error responses");
  await expect(editor.getByLabel("Stage")).toHaveValue("response");
  await expect(editor.getByRole("checkbox", { name: "Fetch", exact: true })).toBeChecked();
  await expect(editor.getByRole("checkbox", { name: "XHR", exact: true })).toBeChecked();
  await expect(editor.locator("fieldset.condition").getByLabel("Value")).toHaveValue("400");
  await editor.getByRole("button", { name: "Save rule" }).click();
  await expect(
    panel.locator(".rule-item").filter({ hasText: "Pause error responses" }),
  ).toBeVisible();

  // Primera pausa y edición: el aviso lleva a la cola.
  const response = callApi(app, "error");
  await panel.getByRole("button", { name: "View queue" }).click();
  await expect(pausedEditor(panel)).toBeVisible();
  await pausedEditor(panel).getByLabel("Status").fill("200");
  await pausedEditor(panel).getByLabel("Response body").fill('{"ok":true}');
  await pausedEditor(panel).getByRole("button", { name: "Continue with changes" }).click();
  const result = await response;
  expect(result).toMatchObject({ status: 200, body: '{"ok":true}' });
  const elapsed = Date.now() - started;
  console.log(`[SC-001] recorrido guiado automatizado: ${elapsed} ms`);
  test.info().annotations.push({ type: "SC-001", description: `${elapsed} ms` });
  await openQueue(panel);
  await expect(panel.getByText("Nothing is paused")).toBeVisible();
});
