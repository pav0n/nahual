import type { BrowserContext, Page, Worker } from "@playwright/test";
import {
  attachAndReload,
  callApi,
  openApp,
  openPanel,
  openQueue,
  openSection,
  pausedEditor,
  setPauseTimeout,
  tabIdOf,
  trafficRow,
} from "./fixtures/panel.ts";
import type { TestServers } from "./fixtures/servers.ts";
import { expect, test } from "./fixtures/extension.ts";

// 004 US2: los pausados se marcan y se atienden desde Tráfico (FR-016/017/018, SC-003).

interface Fx {
  context: BrowserContext;
  nahualWorker: Worker;
  extensionId: string;
  servers: TestServers;
}

async function setup({ context, nahualWorker, extensionId, servers }: Fx) {
  const app = await openApp(context, servers.appOrigin);
  const tabId = await tabIdOf(nahualWorker, `${servers.appOrigin}/`);
  const panel = await openPanel(context, extensionId, tabId);
  await panel.setViewportSize({ width: 1000, height: 800 });
  await attachAndReload(panel, app);
  return { app, panel };
}

/** Regla de la plantilla "errors" de 002 (Pause error responses). */
async function errorsTemplate(panel: Page) {
  await openSection(panel, "Rules");
  await panel
    .getByRole("group", { name: "Templates" })
    .getByRole("button", { name: /Pause error responses/ })
    .click();
  await panel.locator(".editor").getByRole("button", { name: "Save rule" }).click();
  await expect(
    panel.locator(".rule-item").filter({ hasText: "Pause error responses" }),
  ).toBeVisible();
  await openSection(panel, "Traffic");
}

test("FR-016, SC-003: el pausado se marca en Tráfico y su detalle abre en Editar", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const { app, panel } = await setup({ context, nahualWorker, extensionId, servers });
  await errorsTemplate(panel);
  const error = callApi(app, "error");
  const row = trafficRow(panel, "/api/error").last();
  await expect(row).toContainText("Paused");
  await row.click();
  const detail = panel.locator(".detail");
  await expect(detail.getByRole("tab", { name: "Edit" })).toHaveAttribute("aria-selected", "true");
  const editor = pausedEditor(panel);
  for (const name of ["Continue", "Continue unchanged", "Respond with mock", "Abort"]) {
    await expect(editor.getByRole("button", { name, exact: true })).toBeVisible();
  }
  await expect(editor).toContainText(/Continues automatically in \d+ s/);
  // SC-003: un clic desde el detalle.
  await editor.getByRole("button", { name: "Continue unchanged" }).click();
  expect((await error).status).toBe(500);
  await expect(row).not.toContainText("Paused");
  await expect(detail.getByRole("tab", { name: "Headers" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
});

test("FR-017: con dos pausados, Pausados los atiende seguidos y Continuar todos sigue igual", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const { app, panel } = await setup({ context, nahualWorker, extensionId, servers });
  await errorsTemplate(panel);
  const first = callApi(app, "error");
  const second = callApi(app, "error");
  await openQueue(panel);
  const options = panel.locator(".queue").getByRole("option");
  await expect(options).toHaveCount(2);
  await options.first().click();
  await pausedEditor(panel).getByRole("button", { name: "Continue unchanged" }).click();
  await expect(options).toHaveCount(1);
  await expect(pausedEditor(panel)).toBeVisible();

  const third = callApi(app, "error");
  await expect(options).toHaveCount(2);
  await panel.keyboard.press("Alt+Shift+K");
  const statuses = (await Promise.all([first, second, third])).map((r) => r.status);
  expect(statuses).toEqual([500, 500, 500]);
  await expect(panel.getByText("Nothing is paused")).toBeVisible();
});

test("FR-018: si el pausado vence con el detalle abierto, el detalle pasa a Headers", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const { app, panel } = await setup({ context, nahualWorker, extensionId, servers });
  await setPauseTimeout(panel, 5);
  await errorsTemplate(panel);
  const error = callApi(app, "error");
  await trafficRow(panel, "/api/error").last().click();
  const detail = panel.locator(".detail");
  await expect(detail.getByRole("tab", { name: "Edit" })).toHaveAttribute("aria-selected", "true");
  expect((await error).status).toBe(500);
  await expect(detail.getByRole("tab", { name: "Headers" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(detail.getByRole("tab", { name: "Edit" })).toHaveCount(0);
  await expect(detail).toContainText("continued after timeout");
});
