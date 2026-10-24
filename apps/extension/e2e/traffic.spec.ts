import type { BrowserContext, Page, Worker } from "@playwright/test";
import type { TestServers } from "./fixtures/servers.ts";
import {
  attachAndReload,
  callApi,
  filterTraffic,
  openApp,
  openPanel,
  tabIdOf,
  toggleTypeFilter,
  trafficGrid,
  trafficRow,
} from "./fixtures/panel.ts";
import { expect, test } from "./fixtures/extension.ts";

const count = (panel: Page) => panel.locator(".filters .count");

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
  await attachAndReload(panel, app);
  return { app, panel };
}

async function openDetail(panel: Page, text: string | RegExp) {
  await trafficRow(panel, text).first().click();
  await expect(panel.locator(".detail h2")).toContainText(text);
}

test("US1-1: la lista muestra método, URL, status, tipo, tamaño y tiempo", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const fixtures = { context, nahualWorker, extensionId, servers };
  const { app, panel } = await setup(fixtures);
  await callApi(app, "items");
  await callApi(app, "error");
  const items = trafficRow(panel, "/api/items");
  await expect(items).toContainText("GET");
  await expect(items).toContainText("200");
  await expect(items).toContainText("Fetch");
  await expect(items).toContainText(/\d+ (B|kB)/);
  await expect(items).toContainText(/\d+ ms/);
  await expect(trafficRow(panel, "/api/error")).toContainText("500");
  // El documento de la recarga también se capturó, en orden de inicio.
  const urls = await trafficGrid(panel).getByRole("row").allTextContents();
  expect(urls.findIndex((u) => u.includes("/api/items"))).toBeGreaterThan(0);
});

test("US1-2/3: filtros por texto, regex, status y tipo; regex inválida conserva el filtro", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const fixtures = { context, nahualWorker, extensionId, servers };
  const { app, panel } = await setup(fixtures);
  for (const id of ["items", "empty", "error"]) await callApi(app, id);
  await expect(trafficRow(panel, "/api/error")).toBeVisible();

  await filterTraffic(panel, "items");
  await expect(trafficGrid(panel).getByRole("row")).toHaveCount(2);
  await expect(count(panel)).toContainText(/^1 of \d+$/);

  await filterTraffic(panel, "");
  await filterTraffic(panel, "/api/(items|empty)", { regex: true });
  await expect(trafficGrid(panel).getByRole("row")).toHaveCount(3);

  await filterTraffic(panel, "([a-z", { regex: true });
  await expect(panel.getByText("Invalid regex")).toBeVisible();
  await expect(panel.getByLabel("URL regex")).toHaveAttribute("aria-invalid", "true");
  await expect(trafficGrid(panel).getByRole("row")).toHaveCount(3);

  await filterTraffic(panel, "", { regex: true });
  await panel.getByLabel("Status").fill("5xx");
  await expect(trafficGrid(panel).getByRole("row")).toHaveCount(2);
  await expect(trafficRow(panel, "/api/error")).toBeVisible();

  await panel.getByLabel("Status").fill("");
  await toggleTypeFilter(panel, "Document");
  await expect(trafficRow(panel, "/api/")).toHaveCount(0);
  await expect(trafficGrid(panel).getByRole("row")).toHaveCount(2);
});

test("US1-4: detalle con headers y JSON formateado; Cookie enmascarada con Mostrar", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const fixtures = { context, nahualWorker, extensionId, servers };
  const { app, panel } = await setup(fixtures);
  await callApi(app, "items");
  await openDetail(panel, "/api/items");
  const detail = panel.locator(".detail");
  await expect(detail.getByText("Request headers")).toBeVisible();
  const cookie = detail.locator(".header-item").filter({ hasText: /^cookie/i });
  await expect(cookie).toContainText("••••••");
  await expect(detail).not.toContainText("secret-session-value");
  await cookie.getByRole("button", { name: /Show the value of cookie/i }).click();
  await expect(cookie).toContainText("secret-session-value");

  await detail.getByRole("tab", { name: "Response" }).click();
  const body = detail.getByLabel("Response body");
  await expect(body).toHaveText('{\n  "items": [\n    1,\n    2\n  ]\n}');
  await expect(detail).toContainText("JSON");
});

test("US1-5: binario y > 5 MB solo con metadatos; gzip descomprimido; redirección sin body", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const fixtures = { context, nahualWorker, extensionId, servers };
  const { app, panel } = await setup(fixtures);
  for (const id of ["binary", "big", "gzip", "redirect"]) await callApi(app, id);
  const responseOf = async (text: string) => {
    await openDetail(panel, text);
    await panel.locator(".detail").getByRole("tab", { name: "Response" }).click();
    return panel.locator(".detail");
  };

  await expect(await responseOf("/binary")).toContainText(
    "Binary body: only its metadata is shown",
  );
  await expect(await responseOf("/big")).toContainText("Body larger than 5 MB");
  await expect((await responseOf("/gzip")).getByLabel("Response body")).toContainText(
    '"compressed": true',
  );
  await expect(await responseOf("/redirect")).toContainText("Redirects have no body");
});

test("FR-032: el contenido capturado se muestra como texto y nunca se ejecuta", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const fixtures = { context, nahualWorker, extensionId, servers };
  const { app, panel } = await setup(fixtures);
  const violations: string[] = [];
  panel.on("console", (m) => {
    if (/Content Security Policy/i.test(m.text())) violations.push(m.text());
  });
  await callApi(app, "html");
  await openDetail(panel, "/api/html");
  const detail = panel.locator(".detail");
  await expect(detail.locator(".header-item").filter({ hasText: /^x-evil/i })).toContainText(
    '<img src=x onerror="window.__xss=1">',
  );
  await detail.getByRole("tab", { name: "Response" }).click();
  await expect(detail.getByLabel("Response body")).toContainText("<script>window.__xss=1</script>");
  expect(await panel.evaluate(() => (window as { __xss?: number }).__xss)).toBeUndefined();
  expect(await panel.locator(".detail img, .detail script").count()).toBe(0);
  expect(violations).toEqual([]);
});

test("US1-6/7 y SC-004: tope de 2,000, filtro < 300 ms con 2,000 entradas, limpiar y deshacer", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const fixtures = { context, nahualWorker, extensionId, servers };
  test.setTimeout(120_000);
  const { app, panel } = await setup(fixtures);
  await app.evaluate(async (base) => {
    for (let i = 0; i < 2010; i++) await (await fetch(`${base}/data?i=${i}`)).text();
  }, servers.apiOrigin);

  await expect(panel.getByText("History is full")).toBeVisible({ timeout: 30_000 });
  await expect(count(panel)).toHaveText("2000 of 2000");

  // SC-004: cambiar un filtro con 2,000 entradas.
  const elapsed = await panel.evaluate(async () => {
    const input = document.getElementById("traffic-search") as HTMLInputElement;
    const counter = document.querySelector(".filters .count") as HTMLElement;
    const before = counter.textContent;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    const start = performance.now();
    setter?.call(input, "i=1999");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    while (counter.textContent === before) await new Promise((r) => requestAnimationFrame(r));
    return performance.now() - start;
  });
  console.log(`[SC-004] filtro con 2,000 entradas: ${elapsed.toFixed(1)} ms`);
  expect(elapsed).toBeLessThan(300);
  await expect(count(panel)).toHaveText("1 of 2000");

  // Desplazamiento: ninguna tarea larga (> 50 ms) mientras se recorre la lista.
  await filterTraffic(panel, "");
  const longTasks = await panel.evaluate(async () => {
    const durations: number[] = [];
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) durations.push(entry.duration);
    });
    observer.observe({ type: "longtask", buffered: false });
    const grid = document.querySelector(".grid-scroll") as HTMLElement;
    for (let i = 0; i < 40; i++) {
      grid.scrollTop += 1400;
      await new Promise((r) => requestAnimationFrame(r));
    }
    observer.disconnect();
    return durations;
  });
  console.log(`[SC-004] tareas largas al desplazar: ${JSON.stringify(longTasks)}`);
  expect(longTasks.filter((d) => d > 50)).toEqual([]);

  await panel.getByRole("button", { name: "Clear" }).click();
  await expect(panel.getByText("No traffic yet")).toBeVisible();
  await panel.getByRole("button", { name: "Undo" }).click();
  await expect(count(panel)).toHaveText("2000 of 2000");
});

test("navegación por teclado en la lista: flechas y Enter abren el detalle", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const fixtures = { context, nahualWorker, extensionId, servers };
  const { app, panel } = await setup(fixtures);
  await callApi(app, "items");
  await callApi(app, "empty");
  await filterTraffic(panel, "/api/");
  const rows = trafficGrid(panel).getByRole("row");
  await expect(rows).toHaveCount(3);
  await rows.nth(1).focus();
  await panel.keyboard.press("ArrowDown");
  await expect(rows.nth(2)).toBeFocused();
  await panel.keyboard.press("Enter");
  await expect(panel.locator(".detail h2")).toContainText("/api/empty");
  await panel.keyboard.press("Escape");
  await expect(panel.locator(".detail")).toHaveCount(0);
  await panel.keyboard.press("/");
  await expect(panel.getByLabel("Search URLs")).toBeFocused();
});
