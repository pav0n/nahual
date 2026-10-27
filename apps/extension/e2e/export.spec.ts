import type { BrowserContext, Page, Worker } from "@playwright/test";
import { readFile } from "node:fs/promises";
import {
  attachAndReload,
  callApi,
  openApp,
  openPanel,
  openSection,
  tabIdOf,
  trafficRow,
} from "./fixtures/panel.ts";
import type { TestServers } from "./fixtures/servers.ts";
import { expect, test } from "./fixtures/extension.ts";

// 007 US1: "Exportar como…" desde Tráfico y el repeater (FR-008 a FR-013, SC-004, SC-005).

interface Fx {
  context: BrowserContext;
  nahualWorker: Worker;
  extensionId: string;
  servers: TestServers;
}

const SECRETS = [
  "secret-export-token",
  "secret-export-cookie",
  "secret-query-token",
  "secret-body-password",
];

async function setup({ context, nahualWorker, extensionId, servers }: Fx) {
  const app = await openApp(context, servers.appOrigin);
  const tabId = await tabIdOf(nahualWorker, `${servers.appOrigin}/`);
  const panel = await openPanel(context, extensionId, tabId);
  await panel.setViewportSize({ width: 1100, height: 800 });
  await attachAndReload(panel, app);
  return { app, panel };
}

const dialog = (panel: Page) => panel.getByRole("dialog", { name: /^Export/ });
const code = (panel: Page) => dialog(panel).locator(".cm-content");
const formatTab = (panel: Page, name: string) =>
  dialog(panel).getByRole("tab", { name, exact: true });

/** Texto del visor: con documentos cortos CodeMirror pinta todas las líneas. */
const codeText = (panel: Page) =>
  code(panel)
    .locator(".cm-line")
    .allTextContents()
    .then((lines) => `${lines.join("\n")}`);

/** Fila del request (no su preflight, que comparte la ruta y no tiene "Export as…"). */
const requestRow = (panel: Page, text: string, method: string) =>
  trafficRow(panel, text)
    .filter({ has: panel.getByRole("gridcell", { name: method, exact: true }) })
    .first();

async function openExport(panel: Page, text: string, method = "GET") {
  await requestRow(panel, text, method).click({ button: "right" });
  await panel.getByRole("menuitem", { name: "Export as…" }).click();
  await expect(dialog(panel)).toBeVisible();
  await expect(code(panel)).toBeVisible();
}

test("US1-1/3/4, SC-004/005: vista previa redactada, inclusión confirmada y copiar en 3 acciones", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const { app, panel } = await setup({ context, nahualWorker, extensionId, servers });
  await callApi(app, "export-post");

  await openExport(panel, "/export/items", "POST");
  await expect(dialog(panel)).toHaveAccessibleName("Export POST /export/items");
  await expect(dialog(panel).getByRole("tab")).toHaveText([
    "cURL",
    "fetch",
    "Vitest test",
    "MSW handler",
    "Zod schema",
    "Postman",
  ]);

  // Las seis salidas, sin ningún fragmento de los valores sensibles (SC-004).
  for (const name of ["cURL", "fetch", "Vitest test", "MSW handler", "Postman"]) {
    await formatTab(panel, name).click();
    const text = await codeText(panel);
    expect(text.length, name).toBeGreaterThan(20);
    for (const secret of SECRETS) expect(text, `${name}: ${secret}`).not.toContain(secret);
  }
  await expect(dialog(panel).getByRole("status")).toContainText("sensitive values redacted");

  // Incluir valores sensibles pide confirmación y vale solo para esta exportación (FR-011).
  await formatTab(panel, "cURL").click();
  // El interruptor no cambia hasta confirmar.
  await dialog(panel).getByRole("switch", { name: "Include sensitive values" }).click();
  const confirm = panel.getByRole("dialog", { name: "Include sensitive values?" });
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "Include" }).click();
  await expect.poll(() => codeText(panel)).toContain("secret-export-token");

  // Copiar copia lo que se ve.
  await dialog(panel).getByRole("button", { name: "Copy" }).click();
  await expect(panel.getByText("Code copied")).toBeVisible();
  expect((await panel.evaluate(() => navigator.clipboard.readText())).trimEnd()).toBe(
    (await codeText(panel)).trimEnd(),
  );

  // Al cerrar y reabrir, vuelve a redactar.
  await panel.keyboard.press("Escape");
  await expect(dialog(panel)).toBeHidden();
  await openExport(panel, "/export/items", "POST");
  await expect(
    dialog(panel).getByRole("switch", { name: "Include sensitive values" }),
  ).not.toBeChecked();
  expect(await codeText(panel)).not.toContain("secret-export-token");
});

test("US1-2/5: el formato se recuerda y Descargar baja el mismo código con nombre propio", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const { app, panel } = await setup({ context, nahualWorker, extensionId, servers });
  await callApi(app, "export-items");

  await openExport(panel, "/export/items");
  await formatTab(panel, "MSW handler").click();
  const shown = await codeText(panel);
  const download = panel.waitForEvent("download");
  await dialog(panel).getByRole("button", { name: "Download" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("handlers.ts");
  expect((await readFile(await file.path(), "utf8")).trimEnd()).toBe(shown.trimEnd());
  await expect(panel.getByText("Downloaded handlers.ts")).toBeVisible();

  await panel.keyboard.press("Escape");
  await openExport(panel, "/export/items");
  await expect(formatTab(panel, "MSW handler")).toHaveAttribute("aria-selected", "true");

  // Un request sin body de respuesta JSON no ofrece schema Zod: se explica en la pestaña.
  await formatTab(panel, "cURL").click();
  expect(await codeText(panel)).toMatch(/^# Generated by Nahual/);
});

test("FR-008: Alt+Shift+E exporta el request seleccionado; un preflight no tiene la acción", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const { app, panel } = await setup({ context, nahualWorker, extensionId, servers });
  await callApi(app, "export-items");
  await requestRow(panel, "/export/items", "GET").click();
  await panel.locator("body").focus();
  await panel.keyboard.press("Alt+Shift+E");
  await expect(dialog(panel)).toHaveAccessibleName("Export GET /export/items");
  await panel.keyboard.press("Escape");

  await callApi(app, "export-post");
  await requestRow(panel, "/export/items", "OPTIONS").click({ button: "right" });
  await expect(panel.getByRole("menu")).toBeVisible();
  await expect(panel.getByRole("menuitem", { name: "Export as…" })).toHaveCount(0);
});

test("US1-6: el repeater exporta el request en edición con la respuesta mostrada", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const { app, panel } = await setup({ context, nahualWorker, extensionId, servers });
  await callApi(app, "export-item");
  await requestRow(panel, "/export/items/4", "GET").click({ button: "right" });
  await panel.getByRole("menuitem", { name: "Send to repeater" }).click();
  await openSection(panel, "Repeater");
  await panel.getByRole("button", { name: "Send", exact: true }).click();
  await expect(panel.locator(".send-result")).toContainText("200");
  await panel
    .getByRole("toolbar", { name: "Send options" })
    .getByRole("button", { name: "Export as…" })
    .click();
  await expect(dialog(panel)).toHaveAccessibleName("Export GET /export/items/4");
  await formatTab(panel, "Zod schema").click();
  await expect.poll(() => codeText(panel)).toContain("deletedAt: z.null()");
});
