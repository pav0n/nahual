import type { BrowserContext, Page, Worker } from "@playwright/test";
import {
  attachAndReload,
  callApi,
  closeSettings,
  createRule,
  openApp,
  openPanel,
  openSection,
  openSettings,
  pausedEditor,
  repeater,
  repeaterMode,
  repeaterResponse,
  repeaterResult,
  repeaterSend,
  sendToRepeater,
  tabIdOf,
  trafficRow,
} from "./fixtures/panel.ts";
import type { TestServers } from "./fixtures/servers.ts";
import { expect, test } from "./fixtures/extension.ts";

// 005 US1: reenviar un request (FR-001 a FR-021, SC-001, SC-005).

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
  await panel.setViewportSize({ width: 1200, height: 800 });
  await attachAndReload(panel, app);
  return { app, panel };
}

const url = (panel: Page) => repeater(panel).getByLabel("URL", { exact: true });

test("US1-1/2/3/4: enviar al repeater y reenviar en contexto de página con cookies y origen", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const fx = { context, nahualWorker, extensionId, servers };
  const { app, panel } = await setup(fx);
  await callApi(app, "items");
  await sendToRepeater(panel, trafficRow(panel, "/api/items"));
  await expect(repeater(panel).getByRole("tab", { selected: true })).toHaveText("GET /api/items");
  await expect(url(panel)).toHaveValue(`${fx.servers.apiOrigin}/api/items`);
  await expect(repeaterMode(panel, "Page context")).toHaveAttribute("aria-pressed", "true");

  // Sin editar, con Ctrl+Enter.
  await url(panel).focus();
  await panel.keyboard.press("Control+Enter");
  await expect(repeaterResponse(panel)).toContainText('"items"');
  await expect(repeaterResult(panel)).toContainText("200");

  // A /echo: la cookie y el origen de la app.
  await url(panel).fill(`${fx.servers.apiOrigin}/echo`);
  await repeaterSend(panel);
  await expect(repeaterResponse(panel)).toContainText("nahual_session=secret-session-value");
  await expect(repeaterResponse(panel)).toContainText(fx.servers.appOrigin);
  await expect(repeater(panel).locator(".history-item")).toHaveCount(2);

  // En Tráfico, la fila marcada.
  await openSection(panel, "Traffic");
  await expect(trafficRow(panel, "/echo").filter({ hasText: "repeater" })).toBeVisible();
});

test("SC-005: contexto limpio sin cookies ni credenciales del navegador; headers del dev sí", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const fx = { context, nahualWorker, extensionId, servers };
  const { app, panel } = await setup(fx);
  await callApi(app, "items");
  await sendToRepeater(panel, trafficRow(panel, "/api/items"));
  await url(panel).fill(`${fx.servers.apiOrigin}/echo`);
  await repeater(panel).getByRole("button", { name: "Add header" }).click();
  await repeater(panel)
    .getByLabel(/^Header name \d+$/)
    .last()
    .fill("x-custom");
  await repeater(panel).getByLabel("Value of x-custom").fill("written-by-dev");
  await repeaterMode(panel, "Clean context").click();
  await repeaterSend(panel);
  await expect(repeaterResponse(panel)).toContainText("written-by-dev");
  await expect(repeaterResponse(panel)).not.toContainText("nahual_session");
  await expect(repeaterResult(panel)).toContainText("Clean context");

  // Lee una respuesta sin CORS.
  await url(panel).fill(`${fx.servers.apiOrigin}/no-cors`);
  await repeaterSend(panel);
  await expect(repeaterResponse(panel)).toContainText('"ok": true');
});

test("FR-008, FR-010a: headers prohibidos informados y regla de pausa sobre el envío", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const fx = { context, nahualWorker, extensionId, servers };
  const { app, panel } = await setup(fx);
  await callApi(app, "items");
  await createRule(panel, { name: "Pausar items", pattern: "*/api/items*", stage: "response" });
  await openSection(panel, "Traffic");
  await sendToRepeater(panel, trafficRow(panel, "/api/items").first());
  await repeater(panel).getByRole("button", { name: "Add header" }).click();
  await repeater(panel)
    .getByLabel(/^Header name \d+$/)
    .last()
    .fill("Cookie");
  // Solo el que añadió el dev: los del navegador se copian desactivados.
  await expect(repeater(panel).getByText(/browser does not let you set this header/)).toHaveCount(
    1,
  );
  await repeater(panel).getByRole("button", { name: "Send", exact: true }).click();
  await openSection(panel, "Paused");
  await pausedEditor(panel)
    .getByRole("button", { name: /^Continue/ })
    .first()
    .click();
  await openSection(panel, "Repeater");
  await expect(repeaterResult(panel)).toContainText("Pausar items");
  await expect(repeaterResult(panel)).toContainText("Not sent as written");
  await expect(repeaterResult(panel)).toContainText("cookie");
});

test("FR-020: renombrar, duplicar, cerrar y deshacer", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const fx = { context, nahualWorker, extensionId, servers };
  const { app, panel } = await setup(fx);
  await callApi(app, "items");
  await sendToRepeater(panel, trafficRow(panel, "/api/items"));
  await repeaterSend(panel);
  const r = repeater(panel);
  await r.getByRole("button", { name: "Rename" }).click();
  await r.getByLabel("Tab name").fill("Items");
  await r.getByRole("button", { name: "Save name" }).click();
  await expect(r.getByRole("tab", { selected: true })).toHaveText("Items");
  await r.getByRole("button", { name: "Duplicate" }).click();
  await expect(r.getByRole("tab", { selected: true })).toHaveText("Items (copy)");
  await expect(r.locator(".history-item")).toHaveCount(0);
  await r.getByRole("tab", { name: "Items", exact: true }).click();
  await r.getByRole("button", { name: "Close tab" }).click();
  await expect(r.getByRole("tab")).toHaveCount(1);
  await panel.getByRole("button", { name: "Undo" }).click();
  await expect(r.getByRole("tab")).toHaveCount(2);
  await expect(r.getByRole("tab", { selected: true })).toHaveText("Items");
  await expect(r.locator(".history-item")).toHaveCount(1);
});

test("FR-012, FR-014: cancelar un envío lento; sin sesión el contexto de página se deshabilita", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const fx = { context, nahualWorker, extensionId, servers };
  const { app, panel } = await setup(fx);
  await callApi(app, "items");
  await sendToRepeater(panel, trafficRow(panel, "/api/items"));
  await url(panel).fill(`${fx.servers.apiOrigin}/slow?ms=8000`);
  await repeater(panel).getByRole("button", { name: "Send", exact: true }).click();
  await repeater(panel).getByRole("button", { name: "Cancel" }).click();
  await expect(repeaterResult(panel)).toContainText("Send cancelled");

  // Navegar a otro sitio suelta la sesión de este: contexto de página deshabilitado con motivo.
  await app.goto(`${fx.servers.thirdOrigin}/page`);
  await expect(repeaterMode(panel, "Page context")).toBeDisabled();
  await expect(
    repeater(panel).getByText(/Page context unavailable: the tab is no longer on/),
  ).toBeVisible();
});

test("FR-002a, FR-035: body binario reenviado intacto y respuesta HTML como texto", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const fx = { context, nahualWorker, extensionId, servers };
  const { app, panel } = await setup(fx);
  await app.evaluate(async (api) => {
    await fetch(`${api}/echo`, {
      method: "POST",
      headers: { "content-type": "image/png" },
      body: new Uint8Array([137, 80, 78, 71, 0, 1, 2]),
    });
  }, fx.servers.apiOrigin);
  await sendToRepeater(panel, trafficRow(panel, "/echo").filter({ hasText: "POST" }).last());
  await expect(repeater(panel).getByText(/Original body, not editable/)).toBeVisible();
  const before = fx.servers.received.length;
  await repeaterSend(panel);
  const echoed = fx.servers.received.slice(before).find((r) => r.method === "POST");
  expect(echoed?.headers["content-type"]).toBe("image/png");
  expect(Buffer.from(echoed?.body ?? "", "latin1").length).toBeGreaterThan(0);

  await callApi(app, "html");
  await openSection(panel, "Traffic");
  await sendToRepeater(panel, trafficRow(panel, "/api/html"));
  await repeaterSend(panel);
  await expect(repeaterResponse(panel)).toContainText("<script>window.__xss=1</script>");
  expect(await panel.evaluate(() => (window as { __xss?: number }).__xss ?? null)).toBeNull();
});

test(
  "SC-001: de «Send to repeater» a la respuesta mostrada en menos de 2 s (fixture local)",
  { tag: "@perf" },
  async ({ context, nahualWorker, extensionId, servers }) => {
    const { app, panel } = await setup({ context, nahualWorker, extensionId, servers });
    await callApi(app, "items");
    await trafficRow(panel, "/api/items").click({ button: "right" });
    const start = Date.now();
    await panel.getByRole("menu").getByRole("menuitem", { name: "Send to repeater" }).click();
    await repeater(panel).getByRole("button", { name: "Send", exact: true }).click();
    await expect(repeaterResponse(panel)).toContainText('"items"');
    const elapsed = Date.now() - start;
    console.log(`[SC-001] de enviar al repeater a respuesta: ${elapsed} ms`);
    expect(elapsed).toBeLessThan(2000);
  },
);

test("FR-034: Ajustes ⇒ Atajos lista los atajos del repeater y del diff", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const { panel } = await setup({ context, nahualWorker, extensionId, servers });
  const settings = await openSettings(panel, "Shortcuts");
  for (const [keys, text] of [
    ["Ctrl/Cmd+Enter", "Send the repeater request"],
    ["J", "Go to the next diff change"],
    ["K", "Go to the previous diff change"],
  ] as const) {
    await expect(settings.getByText(keys, { exact: true })).toBeVisible();
    await expect(settings.getByText(text)).toBeVisible();
  }
  await closeSettings(panel);
});
