import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import {
  addProductionOrigin,
  attach,
  blurPanel,
  callApi,
  corsCall,
  createRule,
  filterTraffic,
  openApp,
  openCorsDetail,
  openPanel,
  openQueue,
  openRelaxedDetail,
  openSection,
  openSettings,
  pausedEditor,
  pausedOption,
  relaxExtraOrigins,
  relaxIndicator,
  relaxItems,
  requestRow,
  sectionTab,
  statusOf,
  tabIdOf,
  trafficRow,
} from "./fixtures/panel.ts";
import { expect, test } from "./fixtures/extension.ts";

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

export async function expectNoSeriousViolations(panel: Page, label: string) {
  const { violations } = await new AxeBuilder({ page: panel }).withTags(WCAG).analyze();
  const serious = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${label}: ${v.id} (${v.nodes.length})`)).toEqual([]);
}

export async function expectNoHorizontalScroll(panel: Page) {
  const overflow = await panel.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

for (const colorScheme of ["light", "dark"] as const) {
  test(`axe sin violaciones serias en tema ${colorScheme}, a 320 px`, async ({
    context,
    nahualWorker,
    extensionId,
    servers,
  }) => {
    const app = await openApp(context, servers.appOrigin);
    const tabId = await tabIdOf(nahualWorker, `${servers.appOrigin}/`);
    const panel = await openPanel(context, extensionId, tabId);
    await panel.emulateMedia({ colorScheme });
    await panel.reload();
    await panel.setViewportSize({ width: 320, height: 900 });
    await expect(panel.locator("html")).toHaveAttribute("data-theme", colorScheme);

    for (const tab of ["Traffic", "Rules", "Paused"] as const) {
      await openSection(panel, tab);
      await expectNoSeriousViolations(panel, `vacío: ${tab}`);
      await expectNoHorizontalScroll(panel);
    }

    await attach(panel);
    await expectNoSeriousViolations(panel, "adjunto");
    await expectNoHorizontalScroll(panel);

    // Historia 1: lista, filtros con error, detalle con headers y body.
    await openSection(panel, "Traffic");
    await app.reload();
    await callApi(app, "items");
    await expect(trafficRow(panel, "/api/items")).toBeVisible();
    await expectNoSeriousViolations(panel, "tráfico");
    await expectNoHorizontalScroll(panel);
    await filterTraffic(panel, "([a-z", { regex: true });
    await expectNoSeriousViolations(panel, "filtro inválido");
    await filterTraffic(panel, "", { regex: true });
    await trafficRow(panel, "/api/items").click();
    await expectNoSeriousViolations(panel, "detalle: headers");
    await expectNoHorizontalScroll(panel);
    await panel.locator(".detail").getByRole("tab", { name: "Response" }).click();
    await expect(panel.locator(".detail").getByLabel("Response body")).toBeVisible();
    await expectNoSeriousViolations(panel, "detalle: body");
    await expectNoHorizontalScroll(panel);
    await panel.getByRole("button", { name: "Clear" }).click();
    await expectNoSeriousViolations(panel, "limpiado con deshacer");

    // Historia 2: lista de reglas, editor con errores, cola y editor de pausados.
    await createRule(panel, {
      name: "Errores",
      pattern: "*/api/*",
      stage: "response",
      conditions: [{ kind: "Status", op: "≥", fields: { Value: "500" } }],
    });
    await expectNoSeriousViolations(panel, "reglas");
    await expectNoHorizontalScroll(panel);
    await panel.getByRole("button", { name: "New rule" }).click();
    await panel.locator(".editor").getByLabel("Prefilter type").selectOption("regex");
    await panel.locator(".editor").getByLabel("URL prefilter").fill("([a-z");
    await panel.locator(".editor").getByRole("button", { name: "Add condition" }).click();
    await panel.locator(".editor").getByRole("button", { name: "Save rule" }).click();
    await expect(panel.locator(".editor [aria-invalid=true]").first()).toBeVisible();
    await expectNoSeriousViolations(panel, "editor con errores");
    await expectNoHorizontalScroll(panel);
    await panel.locator(".editor").getByRole("button", { name: "Cancel" }).click();

    const error = callApi(app, "error");
    await openQueue(panel);
    await expect(pausedOption(panel, "/api/error")).toBeVisible();
    await expectNoSeriousViolations(panel, "cola y editor de pausados");
    await expectNoHorizontalScroll(panel);
    await pausedEditor(panel).getByRole("button", { name: "Respond with mock" }).click();
    await expectNoSeriousViolations(panel, "mock desde la cola");
    await pausedEditor(panel).getByRole("button", { name: "Continue unchanged" }).click();
    expect((await error).status).toBe(500);

    // Historia 4: editor de acciones (mock, fallar, retrasar) y lista reordenable.
    await openSection(panel, "Rules");
    await panel.getByRole("button", { name: "New rule" }).click();
    const editor = panel.locator(".editor");
    for (const action of ["mock", "fail", "delay"]) {
      await editor.getByLabel("Action").selectOption(action);
      await expectNoSeriousViolations(panel, `acción ${action}`);
      await expectNoHorizontalScroll(panel);
    }
    await editor.getByLabel("Name", { exact: true }).fill("Segunda");
    await editor.getByRole("button", { name: "Save rule" }).click();
    await expect(panel.locator(".rule-item")).toHaveCount(2);
    await expectNoSeriousViolations(panel, "lista reordenable");
    await expectNoHorizontalScroll(panel);
  });
}

test("pestañas y adjuntar solo con teclado", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  await openApp(context, servers.appOrigin);
  const tabId = await tabIdOf(nahualWorker, `${servers.appOrigin}/`);
  const panel = await openPanel(context, extensionId, tabId);
  await panel.bringToFront();

  await panel.keyboard.press("Alt+Shift+A");
  await expect(statusOf(panel)).toContainText("Attached");

  await sectionTab(panel, "Traffic").focus();
  await panel.keyboard.press("ArrowRight");
  await expect(sectionTab(panel, "Rules")).toHaveAttribute("aria-selected", "true");
  await expect(sectionTab(panel, "Rules")).toBeFocused();
  await panel.keyboard.press("End");
  await expect(sectionTab(panel, "Paused")).toHaveAttribute("aria-selected", "true");
  await panel.keyboard.press("Home");
  await expect(sectionTab(panel, "Traffic")).toHaveAttribute("aria-selected", "true");

  await panel.keyboard.press("Alt+Shift+A");
  await expect(statusOf(panel)).toContainText("Disconnected");
});

test.describe("primer uso", () => {
  test.use({ freshProfile: true });

  test("onboarding: axe en cada paso, foco atrapado y Escape", async ({
    context,
    nahualWorker,
    extensionId,
    servers,
  }) => {
    await openApp(context, servers.appOrigin);
    const tabId = await tabIdOf(nahualWorker, `${servers.appOrigin}/`);
    const panel = await context.newPage();
    await panel.setViewportSize({ width: 320, height: 800 });
    await panel.goto(
      `chrome-extension://${extensionId}/src/panel/panel.html?__nahualTestTabId=${tabId}`,
    );
    await panel.bringToFront();
    const dialog = panel.getByRole("dialog");
    await expect(dialog).toBeVisible();
    for (let step = 1; step <= 3; step++) {
      await expectNoSeriousViolations(panel, `onboarding paso ${step}`);
      await expectNoHorizontalScroll(panel);
      if (step < 3) await dialog.getByRole("button", { name: "Next" }).click();
    }
    // El resto de la página queda inerte: el foco nunca cae en un elemento fuera del diálogo
    // (puede salir a la interfaz del navegador, que no es parte de la página).
    for (let i = 0; i < 8; i++) {
      await panel.keyboard.press("Tab");
      const outside = await panel.evaluate(() => {
        const el = document.activeElement;
        return el !== null && el !== document.body && !el.closest("dialog");
      });
      expect(outside).toBe(false);
    }
    await panel.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expectNoSeriousViolations(panel, "tras el onboarding");
  });
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`axe en la sección CORS (003, SC-008), tema ${colorScheme}, a 320 px`, async ({
    context,
    nahualWorker,
    extensionId,
    servers,
  }) => {
    const app = await openApp(context, servers.appOrigin);
    const tabId = await tabIdOf(nahualWorker, `${servers.appOrigin}/`);
    const panel = await openPanel(context, extensionId, tabId);
    await panel.emulateMedia({ colorScheme });
    await panel.reload();
    await panel.setViewportSize({ width: 320, height: 900 });
    await attach(panel);
    await app.reload();

    // Historia 1: marca en la lista y detalle bloqueado, con y sin preflight observado.
    await corsCall(app, "cors-none");
    await expect(requestRow(panel, "/cors/none").last()).toContainText("Blocked by CORS");
    await expectNoSeriousViolations(panel, "lista con bloqueado por CORS");
    await openCorsDetail(panel, "/cors/none");
    await expectNoSeriousViolations(panel, "detalle CORS bloqueado");
    await expectNoHorizontalScroll(panel);
    await corsCall(app, "cors-preflight-401");
    await openCorsDetail(panel, "/cors/preflight-401");
    await expectNoSeriousViolations(panel, "detalle CORS con preflight");
    await expectNoHorizontalScroll(panel);
  });
}

for (const colorScheme of ["light", "dark"] as const) {
  test(`axe del indicador CORS y la confirmación (003, T060), tema ${colorScheme}, a 320 px`, async ({
    context,
    nahualWorker,
    extensionId,
    servers,
  }) => {
    const app = await openApp(context, servers.appOrigin);
    const tabId = await tabIdOf(nahualWorker, `${servers.appOrigin}/`);
    const panel = await openPanel(context, extensionId, tabId);
    await panel.emulateMedia({ colorScheme });
    await panel.reload();
    await panel.setViewportSize({ width: 320, height: 900 });
    await attach(panel);
    await app.reload();
    await corsCall(app, "cors-none");

    // Confirmación en línea.
    const section = await openCorsDetail(panel, "/cors/none");
    await section.getByRole("button", { name: "Allow CORS for development" }).click();
    await expectNoSeriousViolations(panel, "confirmación en línea");
    await expectNoHorizontalScroll(panel);
    await section.getByRole("button", { name: "Allow", exact: true }).click();

    // Indicador activo con 1 origen y detalle relajado.
    const indicator = relaxIndicator(panel);
    await expect(indicator).toContainText("active");
    await expectNoSeriousViolations(panel, "indicador activo");
    await expectNoHorizontalScroll(panel);
    await corsCall(app, "cors-none");
    await openRelaxedDetail(panel, "/cors/none");
    await expectNoSeriousViolations(panel, "detalle relajado");
    await expectNoHorizontalScroll(panel);

    // Suspendida y sin efecto.
    await blurPanel(panel);
    await panel.keyboard.press("Alt+Shift+P");
    await expect(indicator).toContainText("suspended");
    await expectNoSeriousViolations(panel, "indicador suspendido");
    await panel.keyboard.press("Alt+Shift+P");
    await app.getByTestId("nav-third").click();
    await expect(indicator).toContainText("no effect");
    await expectNoSeriousViolations(panel, "indicador sin efecto");
    await app.getByTestId("nav-back").click();
    await expect(indicator).not.toContainText("no effect");

    // Con 10 orígenes.
    expect(await relaxExtraOrigins(panel, tabId, servers.appOrigin, 9)).toEqual(
      Array.from({ length: 9 }, () => true),
    );
    await expect.poll(async () => (await relaxItems(panel)).count(), { timeout: 5_000 }).toBe(10);
    await expectNoSeriousViolations(panel, "indicador con 10 orígenes");
    await expectNoHorizontalScroll(panel);

    // Solo con teclado: "Turn off" de un origen y "Turn all off".
    await indicator
      .getByRole("button", { name: "Turn off the relaxation for https://extra0.test" })
      .focus();
    await panel.keyboard.press("Enter");
    await expect(await relaxItems(panel)).toHaveCount(9);
    await indicator.getByRole("button", { name: /^Turn all off/ }).focus();
    await panel.keyboard.press("Enter");
    await expect(indicator).toHaveCount(0);

    // Ajustes de producción.
    await addProductionOrigin(panel, "https://*.empresa.com");
    const settings = await openSettings(panel, "Development CORS");
    await expectNoSeriousViolations(panel, "ajustes de producción");
    await expectNoHorizontalScroll(panel);
    await settings.getByLabel(/^Add origin or pattern/).fill("no es un origen");
    await settings.getByRole("button", { name: "Add", exact: true }).click();
    await expect(settings).toContainText("Invalid entry");
    await expectNoSeriousViolations(panel, "ajustes de producción con error");
  });
}

for (const colorScheme of ["light", "dark"] as const) {
  test(`axe del reporte para backend (003, T069), tema ${colorScheme}, a 320 px`, async ({
    context,
    nahualWorker,
    extensionId,
    servers,
  }) => {
    const app = await openApp(context, servers.appOrigin);
    const tabId = await tabIdOf(nahualWorker, `${servers.appOrigin}/`);
    const panel = await openPanel(context, extensionId, tabId);
    await panel.emulateMedia({ colorScheme });
    await panel.reload();
    await panel.setViewportSize({ width: 320, height: 900 });
    await attach(panel);
    await app.reload();
    await corsCall(app, "cors-header-cred");

    const section = await openCorsDetail(panel, "/cors/header");
    const opener = section.getByRole("button", { name: "Generate report for backend" });
    await opener.click();
    const dialog = panel.getByRole("dialog", { name: /^Report for backend/ });
    await dialog.getByLabel("Configuration example").selectOption({ label: "NestJS" });
    await expectNoSeriousViolations(panel, "reporte con datos");
    await expectNoHorizontalScroll(panel);

    // El resto de la página queda inerte (como en 002: el foco puede salir a la interfaz del
    // navegador, pero nunca cae en un elemento fuera del diálogo) y vuelve al botón al cerrar.
    for (let i = 0; i < 6; i++) {
      await panel.keyboard.press("Tab");
      const outside = await panel.evaluate(() => {
        const el = document.activeElement;
        return el !== null && el !== document.body && !el.closest("dialog");
      });
      expect(outside).toBe(false);
    }
    await panel.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();

    // Vacío: desde el indicador, para un origen sin bloqueos.
    await relaxExtraOrigins(panel, tabId, servers.appOrigin, 1);
    await relaxIndicator(panel).getByRole("button", { name: "Report" }).click();
    await expect(dialog).toContainText("No blocked requests");
    await expectNoSeriousViolations(panel, "reporte vacío");
  });
}
