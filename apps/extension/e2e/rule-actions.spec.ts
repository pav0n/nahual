import type { BrowserContext, Page, Worker } from "@playwright/test";
import {
  attachAndReload,
  callApi,
  openApp,
  openPanel,
  openTab,
  statusOf,
  tabIdOf,
  trafficRow,
} from "./fixtures/panel.ts";
import type { TestServers } from "./fixtures/servers.ts";
import { expect, test } from "./fixtures/extension.ts";

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

/** Abre el editor desde una plantilla o una regla nueva y fija la acción. */
async function ruleWithAction(
  panel: Page,
  name: string,
  pattern: string,
  stage: "request" | "response",
  configure: (editor: ReturnType<Page["locator"]>) => Promise<void>,
) {
  await openTab(panel, "Rules");
  await panel.getByRole("button", { name: /^(Create your first rule|New rule)$/ }).click();
  const editor = panel.locator(".editor");
  await editor.getByLabel("Name", { exact: true }).fill(name);
  await editor.getByLabel("URL prefilter").fill(pattern);
  await editor.getByLabel("Stage").selectOption(stage);
  await configure(editor);
  await editor.getByRole("button", { name: "Save rule" }).click();
  await expect(panel.locator(".rule-item").filter({ hasText: name })).toBeVisible();
}

test("US4-1/7: plantilla «Simular API caída» exige prefiltro y responde 503 sin tocar la red", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const { app, panel } = await setup({ context, nahualWorker, extensionId, servers });
  await openTab(panel, "Rules");
  await panel
    .getByRole("group", { name: "Templates" })
    .getByRole("button", { name: /Simulate API down/ })
    .click();
  const editor = panel.locator(".editor");
  await expect(editor.getByLabel("URL prefilter")).toBeFocused();
  await expect(editor.getByLabel("Action")).toHaveValue("mock");
  await editor.getByRole("button", { name: "Save rule" }).click();
  await expect(editor.getByLabel("URL prefilter")).toHaveAttribute("aria-invalid", "true");
  await editor.getByLabel("URL prefilter").fill("*api/items*");
  await editor.getByRole("button", { name: "Save rule" }).click();
  await expect(panel.locator(".rule-item").filter({ hasText: "Simulate API down" })).toBeVisible();

  const before = servers.received.filter((r) => r.path === "/api/items").length;
  const result = await callApi(app, "items");
  expect(result.status).toBe(503);
  expect(JSON.parse(result.body ?? "{}")).toMatchObject({ error: "Service Unavailable" });
  expect(servers.received.filter((r) => r.path === "/api/items").length).toBe(before);
});

test("US4-2: Fallar con cada error de red elegido", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const fx = { context, nahualWorker, extensionId, servers };
  const { app, panel } = await setup(fx);
  await ruleWithAction(panel, "Sin conexión", "*api/items*", "request", async (editor) => {
    await editor.getByLabel("Action").selectOption("fail");
    await editor.getByLabel("Network error").selectOption({ label: "Internet disconnected" });
  });
  const result = await callApi(app, "items");
  expect(result.error).toContain("Failed to fetch");
  await openTab(panel, "Traffic");
  await expect(trafficRow(panel, "/api/items").last()).toContainText("Failed");
});

test("US4-3/7: plantilla «Simular red lenta» retrasa ≥ 3 s sin retrasar otras llamadas", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const fx = { context, nahualWorker, extensionId, servers };
  const { app, panel } = await setup(fx);
  await openTab(panel, "Rules");
  await panel
    .getByRole("group", { name: "Templates" })
    .getByRole("button", { name: /Simulate slow network/ })
    .click();
  await panel.locator(".editor").getByLabel("URL prefilter").fill("*api/items*");
  await panel.locator(".editor").getByRole("button", { name: "Save rule" }).click();
  await expect(
    panel.locator(".rule-item").filter({ hasText: "Simulate slow network" }),
  ).toBeVisible();

  const t0 = Date.now();
  const slow = callApi(app, "items").then((r) => ({ ...r, ms: Date.now() - t0 }));
  const fast = await callApi(app, "empty");
  const fastMs = Date.now() - t0;
  const slowResult = await slow;
  expect(fast.status).toBe(200);
  expect(fastMs).toBeLessThan(1500);
  expect(slowResult.status).toBe(200);
  expect(slowResult.ms).toBeGreaterThanOrEqual(3000);
});

test("US4-4: Solo registrar continúa sin cambios y marca la entrada con la regla", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const fx = { context, nahualWorker, extensionId, servers };
  const { app, panel } = await setup(fx);
  await ruleWithAction(panel, "Registrar items", "*api/items*", "response", async (editor) => {
    await editor.getByLabel("Action").selectOption("log");
  });
  expect((await callApi(app, "items")).status).toBe(200);
  await openTab(panel, "Traffic");
  const row = trafficRow(panel, "/api/items").last();
  await expect(row).toContainText("Rule “Registrar items”: logged");
});

test("US4-5/6: gana la de arriba, reordenar con teclado y desactivar una regla", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const fx = { context, nahualWorker, extensionId, servers };
  const { app, panel } = await setup(fx);
  await ruleWithAction(panel, "Mock 201", "*api/items*", "request", async (editor) => {
    await editor.getByLabel("Action").selectOption("mock");
    await editor.getByLabel("Mock status").fill("201");
  });
  await ruleWithAction(panel, "Mock 202", "*api/items*", "request", async (editor) => {
    await editor.getByLabel("Action").selectOption("mock");
    await editor.getByLabel("Mock status").fill("202");
  });
  expect((await callApi(app, "items")).status).toBe(201);

  await panel.bringToFront();
  await panel.getByRole("button", { name: "Move rule “Mock 202” up" }).focus();
  await panel.keyboard.press("Alt+ArrowUp");
  await expect(panel.locator(".rule-item").first()).toContainText("Mock 202");
  await expect(panel.getByText("Rule “Mock 202” is now at position 1 of 2.")).toBeVisible();
  expect((await callApi(app, "items")).status).toBe(202);

  await panel.getByRole("switch", { name: "Rule “Mock 202” enabled" }).uncheck();
  expect((await callApi(app, "items")).status).toBe(201);
});

test("US4-8: «Pausar Nahual» detiene todas las reglas, mantiene la captura y se ve en el indicador", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const fx = { context, nahualWorker, extensionId, servers };
  const { app, panel } = await setup(fx);
  await ruleWithAction(panel, "Mock 201", "*api/items*", "request", async (editor) => {
    await editor.getByLabel("Action").selectOption("mock");
    await editor.getByLabel("Mock status").fill("201");
  });
  await panel.bringToFront();
  await panel.keyboard.press("Alt+Shift+P");
  await expect(statusOf(panel)).toContainText("Nahual is paused");
  await expect(panel.getByRole("switch", { name: "Pause Nahual" })).toBeChecked();
  expect((await callApi(app, "items")).status).toBe(200);
  await openTab(panel, "Traffic");
  await expect(trafficRow(panel, "/api/items").last()).toContainText("200");
  await panel.getByRole("switch", { name: "Pause Nahual" }).uncheck();
  expect((await callApi(app, "items")).status).toBe(201);
});
