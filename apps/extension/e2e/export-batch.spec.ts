import type { BrowserContext, Page, Worker } from "@playwright/test";
import { readFile } from "node:fs/promises";
import {
  attachAndReload,
  callApi,
  openApp,
  openPanel,
  tabIdOf,
  trafficRow,
} from "./fixtures/panel.ts";
import type { TestServers } from "./fixtures/servers.ts";
import { expect, test } from "./fixtures/extension.ts";

// 007 US1: exportación por lote (FR-016, FR-016a, FR-016b, FR-016c).

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

const dialog = (panel: Page) => panel.getByRole("dialog", { name: /^Export/ });
const codeText = (panel: Page) =>
  dialog(panel)
    .locator(".cm-line")
    .allTextContents()
    .then((lines) => lines.join("\n"));
/** Código completo: el archivo descargado (el visor solo pinta las líneas visibles). */
async function downloaded(panel: Page) {
  const download = panel.waitForEvent("download");
  await dialog(panel).getByRole("button", { name: "Download" }).click();
  const file = await download;
  return { name: file.suggestedFilename(), text: await readFile(await file.path(), "utf8") };
}
const batchBar = (panel: Page) => panel.getByRole("toolbar", { name: /selected requests/i });
const check = (panel: Page, text: string, method = "GET") =>
  trafficRow(panel, text)
    .filter({ has: panel.getByRole("gridcell", { name: method, exact: true }) })
    .first()
    .getByRole("checkbox")
    .check();

test("FR-016c: con 2 filas aparecen exactamente las tres acciones por lote", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const { app, panel } = await setup({ context, nahualWorker, extensionId, servers });
  await callApi(app, "export-items");
  await callApi(app, "export-item");
  await check(panel, "/export/items?page=1");
  await expect(batchBar(panel)).toHaveCount(0);
  await check(panel, "/export/items/4");
  await expect(batchBar(panel).getByRole("button")).toHaveText([
    "Export MSW handlers",
    "Export Zod schema",
    "Export Postman collection",
  ]);
  // Endpoints distintos: Zod sigue enfocable pero deshabilitado, con el motivo.
  const zod = batchBar(panel).getByRole("button", { name: "Export Zod schema" });
  await expect(zod).toHaveAttribute("aria-disabled", "true");
  await expect(zod).toHaveAttribute("title", "Select only requests with the same method and path");
  await zod.click({ force: true });
  await expect(dialog(panel)).toHaveCount(0);
});

test("FR-016: MSW por lote, un handler por endpoint, en orden y con fusionados", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const { app, panel } = await setup({ context, nahualWorker, extensionId, servers });
  for (const id of ["export-items", "export-items-2", "export-item", "export-post"])
    await callApi(app, id);
  await check(panel, "/export/items?page=1");
  await check(panel, "/export/items?page=2");
  await check(panel, "/export/items/4");
  await check(panel, "/export/items?token", "POST");
  await batchBar(panel).getByRole("button", { name: "Export MSW handlers" }).click();
  await expect(dialog(panel)).toHaveAccessibleName("Export 4 requests");
  await expect(dialog(panel).getByRole("tab")).toHaveText(["MSW handler", "Zod schema", "Postman"]);
  await expect(dialog(panel).getByRole("tab", { name: "MSW handler" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  const { name, text: code } = await downloaded(panel);
  expect(name).toBe("handlers.ts");
  expect(code.match(/http\.get\(/g)).toHaveLength(2);
  expect(code.match(/http\.post\(/g)).toHaveLength(1);
  expect(code).toContain("merged 2 requests");
  expect(code).not.toContain("secret-export-token");
  await expect(dialog(panel).getByRole("status")).toContainText("2 merged by endpoint");
  // Postman del mismo lote: 4 elementos.
  await dialog(panel).getByRole("tab", { name: "Postman" }).click();
  const collection = await downloaded(panel);
  expect(collection.name).toMatch(/^nahual-127\.0\.0\.1-\d+\.postman_collection\.json$/);
  expect(JSON.parse(collection.text).item).toHaveLength(4);
});

test("FR-016a: Zod de varias respuestas del mismo endpoint", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const { app, panel } = await setup({ context, nahualWorker, extensionId, servers });
  for (const id of ["export-items", "export-items-2", "export-items-3"]) await callApi(app, id);
  await check(panel, "/export/items?page=1");
  await check(panel, "/export/items?page=2");
  await check(panel, "/export/items?page=3");
  await batchBar(panel).getByRole("button", { name: "Export Zod schema" }).click();
  await expect
    .poll(() => codeText(panel))
    .toContain("inferred from 3 responses of GET /export/items");
  const code = await codeText(panel);
  expect(code).toContain("next: z.string().optional(),");
  expect(code).toContain("deletedAt: z.iso.datetime().nullable()");
});
