import type { BrowserContext, Page, Worker } from "@playwright/test";
import {
  attachAndReload,
  openApp,
  openPanel,
  openSection,
  repeater,
  repeaterOutputTab,
  repeaterSend,
  sendToRepeater,
  tabIdOf,
  trafficRow,
} from "./fixtures/panel.ts";
import type { TestServers } from "./fixtures/servers.ts";
import { expect, test } from "./fixtures/extension.ts";

// 005 US2: comparar respuestas (FR-022 a FR-032, SC-002, SC-006).

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
  await panel.setViewportSize({ width: 1300, height: 900 });
  await attachAndReload(panel, app);
  return { app, panel };
}

/** La SPA pide una ruta de la API (con credenciales, como la app). */
const fetchFrom = (app: Page, url: string) =>
  app.evaluate(async (u) => {
    await (await fetch(u, { credentials: "include" })).text();
  }, url);

const diff = (panel: Page) => panel.locator(".diff-view");
const change = (panel: Page, path: string) =>
  diff(panel)
    .locator(".diff-change")
    .filter({ has: panel.locator(".diff-path", { hasText: path }) });

/** Abre en el repeater el request de `path`, lo reenvía a `to` y abre el diff con el original. */
async function compareWithOriginal(panel: Page, app: Page, base: string, path: string, to: string) {
  await fetchFrom(app, `${base}${path}`);
  await openSection(panel, "Traffic");
  await sendToRepeater(panel, trafficRow(panel, path).last());
  await repeater(panel).getByLabel("URL", { exact: true }).fill(`${base}${to}`);
  await repeaterSend(panel);
  await repeater(panel).getByRole("button", { name: "Compare with original" }).click();
  await expect(diff(panel).getByRole("status")).toBeVisible();
}

test("SC-002: /diff/a frente a /diff/b lista exactamente sus cambios; J/K; intercambiar", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const { app, panel } = await setup({ context, nahualWorker, extensionId, servers });
  await compareWithOriginal(panel, app, servers.apiOrigin, "/diff/a", "/diff/b");
  await expect(diff(panel).locator(".diff-side").first()).toContainText("Before");
  await expect(diff(panel).getByRole("combobox", { name: "Before" })).toHaveValue("original");

  const body = diff(panel)
    .locator(".diff-change")
    .filter({ has: panel.locator(".diff-path", { hasText: /^\$/ }) });
  await expect(body.locator(".diff-path")).toHaveText([
    "$.removed",
    "$.type",
    "$.list[1]",
    "$.meta.timestamp",
    "$.access_token",
    "$.added",
  ]);
  await expect(change(panel, "$.removed")).toContainText("−");
  await expect(change(panel, "$.removed")).toContainText("Removed");
  await expect(change(panel, "$.type")).toContainText('1 → "1"');
  await expect(change(panel, "$.added")).toContainText("Added");
  await expect(diff(panel).getByText("Header set-cookie")).toBeVisible();
  await expect(diff(panel).getByText("Header location")).toBeVisible();

  // J y K recorren los cambios.
  await diff(panel).getByRole("status").click();
  await panel.keyboard.press("j");
  await expect(diff(panel).locator("[data-change]").first()).toBeFocused();
  await panel.keyboard.press("j");
  await expect(diff(panel).locator("[data-change]").nth(1)).toBeFocused();
  await panel.keyboard.press("k");
  await expect(diff(panel).locator("[data-change]").first()).toBeFocused();

  // Intercambiar invierte añadidos y eliminados.
  await diff(panel).getByRole("button", { name: "Swap" }).click();
  await expect(change(panel, "$.added")).toContainText("Removed");
  await expect(change(panel, "$.removed")).toContainText("Added");
});

test("FR-028/029: ignorar el timestamp se recuerda para el endpoint", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const { app, panel } = await setup({ context, nahualWorker, extensionId, servers });
  await compareWithOriginal(panel, app, servers.apiOrigin, "/diff/a", "/diff/a");
  // Mismo endpoint: solo cambian valores volátiles del servidor (ninguno en /diff/a) ⇒ sin body.
  await diff(panel).getByRole("button", { name: "Close diff" }).click();
  await repeater(panel).getByLabel("URL", { exact: true }).fill(`${servers.apiOrigin}/diff/b`);
  await repeaterSend(panel);
  await repeater(panel).getByRole("button", { name: "Compare with original" }).click();
  await change(panel, "$.meta.timestamp").getByRole("button", { name: "Ignore this path" }).click();
  await expect(change(panel, "$.meta.timestamp")).toHaveCount(0);
  await expect(diff(panel).getByRole("button", { name: "1 ignored" })).toBeVisible();
  await diff(panel).getByRole("button", { name: "Close diff" }).click();

  await repeaterSend(panel);
  await repeater(panel).getByRole("button", { name: "Compare with original" }).click();
  await expect(diff(panel).getByRole("button", { name: "1 ignored" })).toBeVisible();
  await expect(change(panel, "$.meta.timestamp")).toHaveCount(0);
  await expect(change(panel, "$.type")).toBeVisible();
});

test("FR-025a, FR-026, FR-027: arrays por id, texto por líneas, binario y respuesta pegada", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const { app, panel } = await setup({ context, nahualWorker, extensionId, servers });
  await compareWithOriginal(panel, app, servers.apiOrigin, "/diff/ids?v=1", "/diff/ids?v=2");
  await expect(diff(panel).locator(".diff-path", { hasText: /^\$/ })).toHaveText(["$.items[id=3]"]);
  await expect(diff(panel).getByText("Arrays: $.items by id")).toBeVisible();

  await compareWithOriginal(panel, app, servers.apiOrigin, "/diff/text?v=1", "/diff/text?v=2");
  await expect(diff(panel).locator(".diff-line.diff-removed")).toHaveText(["− Removed: dos"]);
  await expect(diff(panel).locator(".diff-line.diff-added")).toHaveText([
    "+ Added: DOS",
    "+ Added: cuatro",
  ]);

  await compareWithOriginal(panel, app, servers.apiOrigin, "/binary", "/binary");
  await expect(diff(panel).getByText(/The body is not compared/)).toBeVisible();

  // Respuesta pegada inválida frente a un JSON: por líneas con aviso.
  await compareWithOriginal(panel, app, servers.apiOrigin, "/diff/a", "/diff/a");
  await diff(panel).getByRole("button", { name: "Close diff" }).click();
  await repeaterOutputTab(panel, "History");
  await repeater(panel).getByRole("button", { name: "Paste expected response" }).click();
  await repeater(panel).getByLabel("Pasted response (JSON or text)").fill("{nope");
  await repeater(panel).getByRole("button", { name: "Use this response" }).click();
  await repeater(panel).getByRole("button", { name: "Compare pasted with last send" }).click();
  await expect(diff(panel).getByRole("combobox", { name: "Before" })).toHaveValue("pasted");
  await expect(diff(panel).getByText(/The content-type said JSON/)).toBeVisible();
});

test("FR-035: HTML y scripts en un diff se muestran como texto", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const { app, panel } = await setup({ context, nahualWorker, extensionId, servers });
  await compareWithOriginal(panel, app, servers.apiOrigin, "/diff/html?v=1", "/diff/html?v=2");
  await expect(diff(panel).locator(".diff-line.diff-added")).toContainText(["<p>v2</p>"]);
  expect(await panel.evaluate(() => (window as { __xss?: number }).__xss ?? null)).toBeNull();
});

test("SC-006: valores sensibles redactados hasta pedirlos, y otra vez al reabrir", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const { app, panel } = await setup({ context, nahualWorker, extensionId, servers });
  await compareWithOriginal(panel, app, servers.apiOrigin, "/diff/a", "/diff/b");
  const secrets = [
    "secret-token-a",
    "secret-token-b",
    "secret-cookie-a",
    "secret-cookie-b",
    "secret-loc-a",
    "secret-loc-b",
  ];
  const text = () => diff(panel).innerText();
  for (const secret of secrets) expect(await text()).not.toContain(secret);
  await expect(change(panel, "$.access_token")).toContainText("redacted");
  await expect(diff(panel).getByText("Header set-cookie")).toBeVisible();

  await diff(panel).getByRole("button", { name: "Show sensitive values" }).click();
  await expect(change(panel, "$.access_token")).toContainText("secret-token-b");
  await diff(panel).getByRole("button", { name: "Close diff" }).click();
  await repeater(panel).getByRole("button", { name: "Compare with original" }).click();
  await expect(diff(panel).getByRole("status")).toBeVisible();
  for (const secret of secrets) expect(await text()).not.toContain(secret);
});
