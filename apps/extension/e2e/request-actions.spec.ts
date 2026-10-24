import type { BrowserContext, Locator, Page, Worker } from "@playwright/test";
import {
  attachAndReload,
  callApi,
  corsCall,
  openApp,
  openPanel,
  relaxIndicator,
  requestRow,
  tabIdOf,
  trafficGrid,
  trafficRow,
} from "./fixtures/panel.ts";
import type { TestServers } from "./fixtures/servers.ts";
import { expect, test } from "./fixtures/extension.ts";

// 004 US3: acciones de un request en un solo lugar (FR-020 a FR-024, SC-003).

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
  await panel.setViewportSize({ width: 1000, height: 700 });
  await attachAndReload(panel, app);
  return { app, panel };
}

const menu = (panel: Page) => panel.getByRole("menu");
const menuItems = (panel: Page) => menu(panel).getByRole("menuitem");
const headerActions = (panel: Page) =>
  panel.locator(".detail").getByRole("toolbar", { name: "Request actions" }).getByRole("button");

/** Las acciones de la cabecera del detalle y del menú contextual de una fila. */
async function actionsOf(panel: Page, row: Locator) {
  await row.click();
  const header = await headerActions(panel).allTextContents();
  await row.click({ button: "right" });
  await expect(menu(panel)).toBeVisible();
  const items = (await menuItems(panel).allTextContents()).map((s) => s.trim());
  await panel.keyboard.press("Escape");
  await expect(menu(panel)).toBeHidden();
  return { header: header.map((s) => s.trim()), items };
}

test("FR-020/022: cabecera y menú muestran las mismas acciones según el request", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const { app, panel } = await setup({ context, nahualWorker, extensionId, servers });
  await callApi(app, "items");
  await corsCall(app, "cors-preflight-401");

  const normal = await actionsOf(panel, trafficRow(panel, "/api/items"));
  expect(normal.header).toEqual(["Create rule from this request"]);
  expect(normal.items).toEqual(normal.header);

  const blocked = await actionsOf(panel, requestRow(panel, "/cors/preflight-401").last());
  expect(blocked.header).toEqual(["Create rule from this request", "Allow CORS for development"]);
  expect(blocked.items).toEqual(blocked.header);

  const preflight = trafficRow(panel, "/cors/preflight-401").filter({
    has: panel.getByRole("gridcell", { name: "OPTIONS", exact: true }),
  });
  const options = await actionsOf(panel, preflight.last());
  expect(options.header).toEqual(["Create rule from this request"]);
  expect(options.items).toEqual(options.header);
});

test("FR-021: el menú se abre con clic derecho, Shift+F10 y la tecla de menú; teclado y foco", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const { app, panel } = await setup({ context, nahualWorker, extensionId, servers });
  await callApi(app, "items");
  await callApi(app, "empty");
  const row = trafficRow(panel, "/api/empty");

  // Clic derecho: selecciona la fila.
  await row.click({ button: "right" });
  await expect(menu(panel)).toBeVisible();
  await expect(row).toHaveAttribute("aria-selected", "true");
  await expect(menuItems(panel).first()).toBeFocused();
  await panel.keyboard.press("ArrowDown");
  await expect(menuItems(panel).first()).toBeFocused();
  await panel.keyboard.press("Escape");
  await expect(menu(panel)).toBeHidden();
  await expect(row).toBeFocused();

  // Shift+F10 y la tecla de menú sobre la fila enfocada.
  for (const key of ["Shift+F10", "ContextMenu"]) {
    await row.focus();
    await panel.keyboard.press(key);
    await expect(menu(panel), key).toBeVisible();
    await panel.keyboard.press("Escape");
    await expect(row).toBeFocused();
  }

  // Cerca de las esquinas, el menú queda entero dentro del panel.
  const viewport = panel.viewportSize() ?? { width: 1000, height: 700 };
  const box = await row.boundingBox();
  for (const x of [5, viewport.width - 5]) {
    await row.click({
      button: "right",
      position: { x: Math.min(x, (box?.width ?? 20) - 12), y: 5 },
    });
    const menuBox = await menu(panel).locator("..").boundingBox();
    expect(menuBox && menuBox.x >= 0 && menuBox.x + menuBox.width <= viewport.width).toBe(true);
    await panel.keyboard.press("Escape");
  }

  // Área vacía de la lista: sin menú.
  const grid = await trafficGrid(panel).boundingBox();
  if (grid) {
    await panel.mouse.click(grid.x + 20, grid.y + grid.height - 10, { button: "right" });
    await expect(menu(panel)).toHaveCount(0);
  }
});

test("FR-023: crear regla desde un request abre Reglas con el borrador sin guardarlo", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const { app, panel } = await setup({ context, nahualWorker, extensionId, servers });
  await callApi(app, "items");
  await trafficRow(panel, "/api/items").click({ button: "right" });
  await menu(panel).getByRole("menuitem", { name: "Create rule from this request" }).click();
  const editor = panel.locator(".editor");
  await expect(editor).toBeVisible();
  await expect(editor.getByLabel("Name", { exact: true })).toBeFocused();
  await expect(editor.getByLabel("Name", { exact: true })).toHaveValue("GET /api/items");
  await expect(editor.getByLabel("URL prefilter")).toHaveValue(`${servers.apiOrigin}/api/items*`);
  await expect(editor.getByRole("checkbox", { name: "GET", exact: true })).toBeChecked();
  await expect(editor.getByLabel("Stage")).toHaveValue("request");
  await expect(panel.locator(".rule-item")).toHaveCount(0);
  await editor.getByRole("button", { name: "Save rule" }).click();
  await expect(panel.locator(".rule-item").filter({ hasText: "GET /api/items" })).toBeVisible();
});

test("FR-024, SC-003: permitir CORS desde el menú lleva a la confirmación de 003", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const { app, panel } = await setup({ context, nahualWorker, extensionId, servers });
  await corsCall(app, "cors-none");
  await requestRow(panel, "/cors/none").last().click({ button: "right" });
  await menu(panel).getByRole("menuitem", { name: "Allow CORS for development" }).click();
  const form = panel.locator(".detail .relax-form");
  await expect(form).toBeVisible();
  await form.getByRole("button", { name: "Allow", exact: true }).click();
  await expect(relaxIndicator(panel)).toBeVisible();
  expect((await corsCall(app, "cors-none")).status).toBe(200);
});
