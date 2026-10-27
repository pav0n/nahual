import type { BrowserContext, Locator, Page, Worker } from "@playwright/test";
import type { TestServers } from "./fixtures/servers.ts";
import {
  attachAndReload,
  attachOrReconnect,
  callApi,
  closeSettings,
  filterTraffic,
  openApp,
  openPanel,
  openSettings,
  sessionStatus,
  tabIdOf,
  trafficGrid,
  trafficRow,
} from "./fixtures/panel.ts";
import { expect, test } from "./fixtures/extension.ts";

// 004 US1: el panel se siente parte de DevTools (FR-004 a FR-009, SC-002).

const theme = (panel: Page) => panel.locator("html").getAttribute("data-theme");

/** Cuántas filas visuales ocupan los controles visibles de un contenedor. */
async function visualRows(container: Locator) {
  return container.evaluate((element) => {
    const tops = new Set<number>();
    for (const child of element.querySelectorAll("button, input, select, .count")) {
      const rect = child.getBoundingClientRect();
      // Por el centro: en una fila los controles de distinto alto quedan centrados.
      if (rect.width > 0 && rect.height > 0) tops.add(Math.round((rect.top + rect.bottom) / 16));
    }
    return tops.size;
  });
}

async function noHorizontalScroll(panel: Page) {
  const overflow = await panel.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

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
  await panel.setViewportSize({ width: 1280, height: 800 });
  await attachAndReload(panel, app);
  await callApi(app, "items");
  await callApi(app, "empty");
  await expect(trafficRow(panel, "/api/empty")).toBeVisible();
  return { app, panel };
}

test("FR-004: el tema cambia en vivo sin perder selección, filtro, diálogo ni menú", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const { panel } = await setup({ context, nahualWorker, extensionId, servers });
  await panel.emulateMedia({ colorScheme: "light" });
  await expect.poll(() => theme(panel)).toBe("light");
  await filterTraffic(panel, "/api/");
  await trafficRow(panel, "/api/items").click();
  await expect(panel.locator(".detail h2")).toContainText("/api/items");

  await panel.emulateMedia({ colorScheme: "dark" });
  await expect.poll(() => theme(panel)).toBe("dark");
  await expect(panel.getByLabel("Search URLs")).toHaveValue("/api/");
  await expect(trafficRow(panel, "/api/items")).toHaveAttribute("aria-selected", "true");
  await expect(panel.locator(".detail h2")).toContainText("/api/items");

  const settings = await openSettings(panel);
  await panel.emulateMedia({ colorScheme: "light" });
  await expect.poll(() => theme(panel)).toBe("light");
  await expect(settings).toBeVisible();
  await closeSettings(panel);

  await panel.getByRole("button", { name: /^Session/ }).click();
  const menu = panel.getByRole("menu");
  await expect(menu).toBeVisible();
  await panel.emulateMedia({ colorScheme: "dark" });
  await expect.poll(() => theme(panel)).toBe("dark");
  await expect(menu).toBeVisible();
});

test("FR-006/007: detalle a la derecha con divisor; columnas compactas; reparto recordado", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const { app, panel } = await setup({ context, nahualWorker, extensionId, servers });
  const headers = trafficGrid(panel).getByRole("columnheader");
  await expect(headers).toHaveText(["Name", "Method", "Status", "Type", "Size", "Time"]);

  await trafficRow(panel, "/api/items").click();
  const separator = panel.getByRole("separator", { name: /divider/i });
  await expect(separator).toBeVisible();
  const grid = await trafficGrid(panel).boundingBox();
  const detail = await panel.locator(".detail").boundingBox();
  expect(grid && detail && detail.x >= grid.x + grid.width - 1).toBe(true);
  await expect(headers).toHaveText(["Name", "Method", "Status"]);

  const before = Number(await separator.getAttribute("aria-valuenow"));
  await separator.focus();
  await panel.keyboard.press("ArrowRight");
  await panel.keyboard.press("ArrowRight");
  await expect
    .poll(async () => Number(await separator.getAttribute("aria-valuenow")))
    .toBeGreaterThan(before);
  const moved = await separator.getAttribute("aria-valuenow");
  // La preferencia se escribe 250 ms después del último cambio (contracts/storage.md).
  await panel.waitForTimeout(400);

  // El historial vive en la memoria del panel (002 FR-007): tras recargar se vuelve a llamar.
  // Cerrar el panel suelta el debugger (002 FR-027b): al recargar se vuelve a adjuntar.
  await panel.reload();
  await attachOrReconnect(panel);
  await expect(sessionStatus(panel)).toContainText("Attached");
  await app.reload();
  await callApi(app, "items");
  await expect(trafficRow(panel, "/api/items")).toBeVisible();
  await trafficRow(panel, "/api/items").click();
  await expect(panel.getByRole("separator", { name: /divider/i })).toHaveAttribute(
    "aria-valuenow",
    moved ?? "",
  );
});

test("FR-008: a 599 px el detalle queda debajo de la lista", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const { panel } = await setup({ context, nahualWorker, extensionId, servers });
  await panel.setViewportSize({ width: 599, height: 900 });
  await trafficRow(panel, "/api/items").click();
  const grid = await trafficGrid(panel).boundingBox();
  const detail = await panel.locator(".detail").boundingBox();
  expect(grid && detail && detail.y >= grid.y + grid.height - 1).toBe(true);
  await noHorizontalScroll(panel);
});

test("FR-009, SC-002: filtros en 1 fila a 800 px y en ≤ 2 a 320 px, sin scroll horizontal", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const { panel } = await setup({ context, nahualWorker, extensionId, servers });
  const filters = panel.getByRole("toolbar", { name: "Filters" });
  await panel.setViewportSize({ width: 800, height: 800 });
  await expect.poll(() => visualRows(filters)).toBe(1);
  // Con una fuente del sistema ancha (DejaVu Sans, la de los runners de Ubuntu) también cabe.
  const wideFont = await panel.addStyleTag({
    content: `:root { --nh-font: "DejaVu Sans", sans-serif !important; }`,
  });
  await expect.poll(() => visualRows(filters)).toBe(1);
  await wideFont.evaluate((style) => (style as Element).remove());
  await panel.setViewportSize({ width: 320, height: 800 });
  await expect.poll(() => visualRows(filters)).toBeLessThanOrEqual(2);
  await noHorizontalScroll(panel);
  await trafficRow(panel, "/api/items").click();
  await noHorizontalScroll(panel);
});
