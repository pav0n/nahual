import type { BrowserContext, Page, Worker } from "@playwright/test";
import {
  attachAndReload,
  callApi,
  closeSettings,
  corsCall,
  createRule,
  detach,
  notices,
  openApp,
  openPanel,
  openSettings,
  relaxFrom,
  relaxIndicator,
  sectionTab,
  sessionStatus,
  tabIdOf,
  trafficGrid,
  trafficRow,
} from "./fixtures/panel.ts";
import type { TestServers } from "./fixtures/servers.ts";
import { expect, test } from "./fixtures/extension.ts";

// 004 US2: estructura clara y estable (FR-010 a FR-019, SC-001).

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
  return { app, panel, tabId };
}

/** Avisos del catálogo empujados desde el gancho del build de pruebas (research R13). */
function pushNotices(panel: Page, keys: string[]) {
  return panel.evaluate((list) => {
    const slots = (window as { __nahualUiSlots?: { pushNotice(key: string): void } })
      .__nahualUiSlots;
    if (!slots) throw new Error("build sin __nahualUiSlots");
    for (const key of list) slots.pushNotice(key);
  }, keys);
}

const box = async (panel: Page, selector: string) =>
  JSON.stringify(await panel.locator(selector).first().boundingBox());

test("FR-010/011: una barra con secciones y contadores, sin título repetido", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const { app, panel } = await setup({ context, nahualWorker, extensionId, servers });
  await expect(panel.locator("h1")).toHaveCount(0);
  const banner = panel.getByRole("banner");
  for (const name of ["Traffic", "Rules", "Paused"] as const) {
    await expect(banner.getByRole("tab", { name: new RegExp(`^${name}`) })).toBeVisible();
  }
  // Sin reglas ni pausados no hay contadores.
  await expect(sectionTab(panel, "Rules")).toHaveText("Rules");
  await expect(sectionTab(panel, "Paused")).toHaveText("Paused");

  await createRule(panel, {
    name: "Errores",
    pattern: "*/api/*",
    stage: "response",
    conditions: [{ kind: "Status", op: "≥", fields: { Value: "500" } }],
  });
  await expect(sectionTab(panel, "Rules")).toHaveText(/^Rules\s*1$/);
  const error = callApi(app, "error");
  await expect(sectionTab(panel, "Paused")).toHaveText(/^Paused\s*1$/);
  await expect(sectionTab(panel, "Paused").locator(".count-badge")).toHaveAttribute(
    "data-tone",
    "attention",
  );
  await panel.keyboard.press("Alt+Shift+K");
  expect((await error).status).toBe(500);
});

test("FR-012: el estado de sesión abre un menú y no suelta con un clic; Alt+Shift+A sí", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const { panel } = await setup({ context, nahualWorker, extensionId, servers });
  const trigger = panel.getByRole("button", { name: /^Session/ });
  await expect(trigger).toContainText("Attached");
  await expect(trigger.locator("svg")).toHaveCount(1);
  await trigger.click();
  const menu = panel.getByRole("menu");
  await expect(menu.getByRole("menuitem", { name: /^Detach/ })).toContainText("Alt+Shift+A");
  await expect(sessionStatus(panel)).toContainText("Attached");
  await panel.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused();

  await panel.keyboard.press("Alt+Shift+A");
  await expect(sessionStatus(panel)).toContainText("Disconnected");
});

test("SC-001, FR-014/015: Ajustes encima sin mover nada; guardado por campo", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const { app, panel } = await setup({ context, nahualWorker, extensionId, servers });
  await callApi(app, "items");
  await trafficRow(panel, "/api/items").click();
  const grid = await box(panel, "[role=grid]");
  const detail = await box(panel, ".detail");

  const settingsButton = panel.getByRole("button", { name: "Settings", exact: true });
  const settings = await openSettings(panel, "Pauses");
  expect(await box(panel, "[role=grid]")).toBe(grid);
  expect(await box(panel, ".detail")).toBe(detail);
  for (const name of ["General", "Pauses", "Development CORS", "Shortcuts"]) {
    await expect(settings.getByRole("tab", { name })).toBeVisible();
  }

  // Detrás del diálogo la barra sigue al día.
  await callApi(app, "empty");
  await expect(trafficRow(panel, "/api/empty")).toBeAttached();

  const timeout = settings.getByLabel(/Pause timeout/);
  await timeout.fill("200");
  await timeout.blur();
  await expect(settings.getByText("Saved")).toBeVisible();
  await expect(settings.getByRole("button", { name: /^(Apply|Save)$/ })).toHaveCount(0);
  await timeout.fill("3");
  await timeout.press("Enter");
  await expect(settings).toContainText("between 5 and 300");
  await closeSettings(panel);
  await expect(settingsButton).toBeFocused();
  await openSettings(panel, "Pauses");
  await expect(settings.getByLabel(/Pause timeout/)).toHaveValue("200");
  await closeSettings(panel);

  // Limpiar con un request seleccionado cierra el detalle y deja el foco en la lista.
  await panel.getByRole("button", { name: "Clear" }).click();
  await expect(panel.locator(".detail")).toHaveCount(0);
  await panel.getByRole("button", { name: "Undo" }).click();
  await expect(trafficRow(panel, "/api/items")).toBeVisible();
  await expect(panel.locator(".detail")).toHaveCount(0);
});

test("FR-013: Nahual en pausa y CORS relajado ocupan una línea cada uno", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const { app, panel } = await setup({ context, nahualWorker, extensionId, servers });
  await corsCall(app, "cors-none");
  await relaxFrom(panel, "/cors/none");
  await panel.getByRole("switch", { name: "Pause Nahual" }).click();
  const paused = panel.locator(".strip-pause");
  await expect(paused).toContainText("Nahual is paused");
  await expect(paused.getByRole("button", { name: /^Resume/ })).toBeVisible();
  for (const line of [paused, relaxIndicator(panel)]) {
    const height = (await line.boundingBox())?.height ?? 0;
    expect(height).toBeLessThan(40);
  }
  await paused.getByRole("button", { name: /^Resume/ }).click();
  await expect(paused).toHaveCount(0);
});

test("FR-013a: con 3 avisos aparece «3 notices»; desplegarlo no mueve la lista", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const { app, panel } = await setup({ context, nahualWorker, extensionId, servers });
  await callApi(app, "items");
  await pushNotices(panel, ["notice_settings_reset", "notice_rules_version"]);
  await expect(notices(panel).getByRole("button", { name: /^Dismiss/ })).toHaveCount(2);
  await pushNotices(panel, ["cors_ended_restart"]);
  const group = panel.getByRole("button", { name: /^3 notices/ });
  await expect(group).toBeVisible();
  const grid = JSON.stringify(await trafficGrid(panel).boundingBox());
  await group.click();
  await expect(group).toHaveAttribute("aria-expanded", "true");
  expect(JSON.stringify(await trafficGrid(panel).boundingBox())).toBe(grid);
  await notices(panel)
    .getByRole("button", { name: /^Dismiss/ })
    .first()
    .click();
  await expect(notices(panel).getByRole("button", { name: /^Dismiss/ })).toHaveCount(2);
  await expect(notices(panel)).toContainText("restarted");
});

test("FR-019: Ayuda abre la introducción y lista los atajos", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const { panel } = await setup({ context, nahualWorker, extensionId, servers });
  await detach(panel);
  await panel.getByRole("button", { name: "Help", exact: true }).click();
  const help = panel.getByRole("dialog");
  await expect(help).toContainText("Alt+Shift+A");
  await expect(help).toContainText("Alt+Shift+K");
  await panel.keyboard.press("Escape");
  await expect(help).toBeHidden();
});
