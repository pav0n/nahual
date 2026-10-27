import type { BrowserContext, Page, Worker } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  attachAndReload,
  callApi,
  closeSettings,
  openApp,
  openPanel,
  openSection,
  openSettings,
  tabIdOf,
} from "./fixtures/panel.ts";
import type { TestServers } from "./fixtures/servers.ts";
import { expect, test } from "./fixtures/extension.ts";

// 007 US5: importar desde Requestly (FR-034 a FR-038, SC-009; quickstart 17).

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
  await panel.setViewportSize({ width: 1100, height: 800 });
  await attachAndReload(panel, app);
  return { app, panel };
}

const ruleItem = (panel: Page, name: string) =>
  panel.locator(".rule-item").filter({ hasText: name });

async function exportFile(servers: TestServers) {
  const raw = await readFile(
    path.join(import.meta.dirname, "fixtures/requestly-export.json"),
    "utf8",
  );
  return raw.replaceAll("__API__", servers.apiOrigin).replaceAll("__THIRD__", servers.thirdOrigin);
}

async function importRequestly(panel: Page, content: string) {
  const dialog = await openSettings(panel, "Import and export");
  await dialog.locator('input[type="file"][aria-label="Import from Requestly"]').setInputFiles({
    name: "requestly.json",
    mimeType: "application/json",
    buffer: Buffer.from(content),
  });
  return dialog;
}

test("US5-1/2/3, SC-009: vista previa con lo no soportado, todo desactivado y lo activado se comporta como en Requestly", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const { app, panel } = await setup({ context, nahualWorker, extensionId, servers });
  await importRequestly(panel, await exportFile(servers));

  const preview = panel.getByRole("dialog", { name: "Import from Requestly" });
  await expect(preview).toContainText("API a tercer origen");
  await expect(preview).toContainText("Headers en ambas etapas (request)");
  await expect(preview).toContainText("Headers en ambas etapas (response)");
  await expect(preview.locator(".profile-tag")).toHaveText(["QA staging"]);
  // Las no soportadas, con su motivo; nada se importa a medias (FR-036).
  const unsupported = preview.locator(".import-unsupported");
  await expect(unsupported.locator("summary")).toHaveText("Not supported (7)");
  await expect(unsupported.locator("li")).toHaveCount(7);
  await expect(unsupported).toContainText("Map local");
  await expect(unsupported).toContainText("Dos parejas, una no convertible");
  await expect(preview).not.toContainText("Dos parejas, una no convertible (1)");
  // Los hooks generados se analizan antes de importar.
  const confirm = preview.getByRole("button", { name: "Import (turned off)" });
  await expect(confirm).toBeEnabled({ timeout: 15_000 });
  await confirm.click();
  await expect(preview).toBeHidden();
  await expect(panel.getByText("Imported 7 rules and 1 profiles")).toBeVisible();
  await closeSettings(panel);

  await openSection(panel, "Rules");
  await expect(panel.locator(".rule-item")).toHaveCount(7);
  for (const item of await panel.locator(".rule-item").all()) {
    await expect(item.getByRole("switch")).not.toBeChecked();
    await expect(item).toContainText("imported from Requestly");
  }

  // Desactivadas: nada cambia todavía.
  expect((await callApi(app, "error")).status).toBe(500);

  // Response estática ⇒ mock con el status y el body de Requestly.
  await ruleItem(panel, "API caida").getByRole("switch").click();
  await expect(ruleItem(panel, "API caida").getByRole("switch")).toBeChecked();
  const error = await callApi(app, "error");
  expect(error.status).toBe(503);
  expect(JSON.parse(error.body ?? "")).toEqual({ error: "mantenimiento" });

  // Headers de request ⇒ hook; solo en POST, como el filtro de Requestly.
  await ruleItem(panel, "Header de request").getByRole("switch").click();
  await expect(ruleItem(panel, "Header de request").getByRole("switch")).toBeChecked();
  const echo = JSON.parse((await callApi(app, "echo")).body ?? "{}") as {
    headers: Record<string, string>;
  };
  expect(echo.headers["x-nahual-test"]).toBe("from-requestly");
});

test("FR-037: un archivo que no es un export de Requestly se rechaza en línea y no cambia nada", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const { panel } = await setup({ context, nahualWorker, extensionId, servers });
  for (const [content, message] of [
    ["nope", "The file isn't JSON"],
    [JSON.stringify({ nahual: "config" }), "Requestly"],
    [JSON.stringify([{ objectType: "group", id: "g", name: "x" }]), "Requestly"],
  ] as const) {
    const dialog = await importRequestly(panel, content);
    await expect(dialog.getByRole("alert")).toContainText(message);
  }
  await expect(panel.getByRole("dialog", { name: "Import from Requestly" })).toHaveCount(0);
  await closeSettings(panel);
  await openSection(panel, "Rules");
  await expect(panel.locator(".rule-item")).toHaveCount(0);
});
