import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import {
  addProductionOrigin,
  attach,
  blurPanel,
  callApi,
  closeSettings,
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
  relaxFrom,
  relaxIndicator,
  relaxItems,
  repeaterOutputTab,
  repeaterTabs,
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
  // 005: Repeater es la última sección.
  await expect(sectionTab(panel, "Repeater")).toHaveAttribute("aria-selected", "true");
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

/** Ningún elemento del contenedor desborda en horizontal (004 SC-002). */
async function expectNoInnerOverflow(container: ReturnType<Page["locator"]>) {
  const overflowing = await container.evaluate((root) =>
    [root, ...root.querySelectorAll("*")]
      .filter(
        (el) => el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX !== "auto",
      )
      .map((el) => el.className || el.tagName),
  );
  expect(overflowing).toEqual([]);
}

/** El foco no sale del diálogo con Tab (patrón de 002 y 003). */
async function expectFocusTrapped(panel: Page) {
  for (let i = 0; i < 8; i++) {
    await panel.keyboard.press("Tab");
    const outside = await panel.evaluate(() => {
      const el = document.activeElement;
      return el !== null && el !== document.body && !el.closest("dialog");
    });
    expect(outside).toBe(false);
  }
}

for (const colorScheme of ["light", "dark"] as const) {
  test(`004 US1: Tráfico con detalle, filtros y divisor, tema ${colorScheme}, a 320/800/1280 px`, async ({
    context,
    nahualWorker,
    extensionId,
    servers,
  }) => {
    const app = await openApp(context, servers.appOrigin);
    const tabId = await tabIdOf(nahualWorker, `${servers.appOrigin}/`);
    const panel = await openPanel(context, extensionId, tabId);
    await panel.emulateMedia({ colorScheme });
    await attach(panel);
    await app.reload();
    await callApi(app, "items");
    await callApi(app, "error");
    await trafficRow(panel, "/api/items").click();
    for (const width of [320, 800, 1280]) {
      await panel.setViewportSize({ width, height: 800 });
      await expect(panel.getByRole("separator", { name: /divider/i })).toBeVisible();
      await expectNoSeriousViolations(panel, `tráfico con detalle a ${width} px`);
      await expectNoHorizontalScroll(panel);
    }
    await filterTraffic(panel, "([a-z", { regex: true });
    await expectNoSeriousViolations(panel, "filtro regex inválido");
  });

  test(`004 US2: barra, menú de sesión, franja, Ajustes, Ayuda y pausados, tema ${colorScheme}, a 320 px`, async ({
    context,
    nahualWorker,
    extensionId,
    servers,
  }) => {
    const app = await openApp(context, servers.appOrigin);
    const tabId = await tabIdOf(nahualWorker, `${servers.appOrigin}/`);
    const panel = await openPanel(context, extensionId, tabId);
    await panel.emulateMedia({ colorScheme });
    await panel.setViewportSize({ width: 320, height: 900 });
    await attach(panel);
    await app.reload();

    await panel.getByRole("button", { name: /^Session/ }).click();
    await expect(panel.getByRole("menu")).toBeVisible();
    await expectNoSeriousViolations(panel, "menú de sesión");
    await panel.keyboard.press("Escape");

    // Franja: pausa, CORS relajado y "N avisos" desplegado.
    await corsCall(app, "cors-none");
    await relaxFrom(panel, "/cors/none");
    await panel.getByRole("switch", { name: "Pause Nahual" }).click();
    await panel.evaluate(() => {
      const slots = (window as { __nahualUiSlots?: { pushNotice(key: string): void } })
        .__nahualUiSlots;
      for (const key of ["notice_settings_reset", "notice_rules_version", "cors_ended_restart"])
        slots?.pushNotice(key);
    });
    await panel.getByRole("button", { name: /^3 notices/ }).click();
    await expectNoSeriousViolations(panel, "franja con pausa, CORS y avisos");
    await expectNoHorizontalScroll(panel);
    await panel.getByRole("button", { name: /^3 notices/ }).click();
    await panel.getByRole("switch", { name: "Pause Nahual" }).click();

    // Ajustes, cada sección; foco atrapado y devuelto al botón.
    for (const section of ["General", "Pauses", "Development CORS", "Shortcuts"] as const) {
      const settings = await openSettings(panel, section);
      await expectNoSeriousViolations(panel, `Ajustes: ${section}`);
      await expectNoInnerOverflow(settings);
    }
    await expectFocusTrapped(panel);
    await closeSettings(panel);
    await expect(panel.getByRole("button", { name: "Settings", exact: true })).toBeFocused();

    // Ayuda con atajos.
    await panel.getByRole("button", { name: "Help", exact: true }).click();
    const help = panel.getByRole("dialog");
    await expect(help).toBeVisible();
    await expectNoSeriousViolations(panel, "Ayuda");
    await expectNoInnerOverflow(help);
    await expectFocusTrapped(panel);
    await panel.keyboard.press("Escape");
    await expect(help).toBeHidden();
    await expect(panel.getByRole("button", { name: "Help", exact: true })).toBeFocused();

    // Pausados y detalle de un pausado en Tráfico.
    await createRule(panel, {
      name: "Errores",
      pattern: "*/api/*",
      stage: "response",
      conditions: [{ kind: "Status", op: "≥", fields: { Value: "500" } }],
    });
    const error = callApi(app, "error");
    await openQueue(panel);
    await expect(pausedOption(panel, "/api/error")).toBeVisible();
    await expectNoSeriousViolations(panel, "Pausados");
    await expectNoHorizontalScroll(panel);
    await openSection(panel, "Traffic");
    await trafficRow(panel, "/api/error").last().click();
    await expect(panel.locator(".detail").getByRole("tab", { name: "Edit" })).toBeVisible();
    await expectNoSeriousViolations(panel, "detalle de un pausado en Tráfico");
    await expectNoHorizontalScroll(panel);
    await pausedEditor(panel).getByRole("button", { name: "Continue unchanged" }).click();
    expect((await error).status).toBe(500);
  });
}

for (const colorScheme of ["light", "dark"] as const) {
  test(`004 US3: menú contextual y cabecera de acciones, tema ${colorScheme}, a 320 px`, async ({
    context,
    nahualWorker,
    extensionId,
    servers,
  }) => {
    const app = await openApp(context, servers.appOrigin);
    const tabId = await tabIdOf(nahualWorker, `${servers.appOrigin}/`);
    const panel = await openPanel(context, extensionId, tabId);
    await panel.emulateMedia({ colorScheme });
    await panel.setViewportSize({ width: 320, height: 900 });
    await attach(panel);
    await app.reload();
    await corsCall(app, "cors-none");
    const row = requestRow(panel, "/cors/none").last();
    await row.click();
    await expect(
      panel.locator(".detail").getByRole("toolbar", { name: "Request actions" }),
    ).toBeVisible();
    await expectNoSeriousViolations(panel, "cabecera de acciones");
    await expectNoHorizontalScroll(panel);
    await row.click({ button: "right" });
    await expect(panel.getByRole("menu")).toBeVisible();
    await expectNoSeriousViolations(panel, "menú contextual");
    await expectNoHorizontalScroll(panel);
    await panel.keyboard.press("Escape");
  });
}

/**
 * Pulsa Tab (y si no lo alcanza, Shift+Tab) hasta enfocar el elemento, como haría el dev;
 * `true` si lo alcanzó.
 */
async function tabTo(panel: Page, target: ReturnType<Page["locator"]>) {
  const focused = () => target.evaluate((el) => el === document.activeElement);
  for (const key of ["Tab", "Shift+Tab"]) {
    for (let i = 0; i < 150; i++) {
      if (await focused()) return true;
      await panel.keyboard.press(key);
    }
  }
  return focused();
}

for (const colorScheme of ["light", "dark"] as const) {
  test(`005 US1: repeater en tema ${colorScheme}, a 320 px`, async ({
    context,
    nahualWorker,
    extensionId,
    servers,
  }) => {
    const app = await openApp(context, servers.appOrigin);
    const tabId = await tabIdOf(nahualWorker, `${servers.appOrigin}/`);
    const panel = await openPanel(context, extensionId, tabId);
    await panel.emulateMedia({ colorScheme });
    await panel.setViewportSize({ width: 320, height: 900 });
    await attach(panel);
    await app.reload();
    await callApi(app, "items");

    await openSection(panel, "Repeater");
    await expectNoSeriousViolations(panel, "repeater vacío");
    await expectNoHorizontalScroll(panel);

    await openSection(panel, "Traffic");
    await trafficRow(panel, "/api/items").click({ button: "right" });
    await panel.getByRole("menuitem", { name: "Send to repeater" }).click();
    const r = panel.locator(".repeater");
    await expect(repeaterTabs(panel).getByRole("tab", { selected: true })).toBeVisible();
    await expectNoSeriousViolations(panel, "repeater con pestaña");
    await expectNoHorizontalScroll(panel);

    // Editor con errores.
    await r.getByLabel("URL", { exact: true }).fill("no es una url");
    await r.getByRole("button", { name: "Send", exact: true }).click();
    await expect(r.getByRole("alert")).toBeVisible();
    await expectNoSeriousViolations(panel, "editor con errores");

    // Envío en curso, resultado con error e historial.
    await r.getByLabel("URL", { exact: true }).fill(`${servers.apiOrigin}/slow?ms=20000`);
    await r.getByRole("button", { name: "Send", exact: true }).click();
    await expect(r.getByText("Sending…").first()).toBeVisible();
    await expectNoSeriousViolations(panel, "envío en curso");
    await r.getByRole("button", { name: "Cancel" }).click();
    await expect(r.locator(".send-result").getByRole("alert")).toBeVisible();
    await expectNoSeriousViolations(panel, "resultado con error");
    await r.getByLabel("URL", { exact: true }).fill(`${servers.apiOrigin}/api/items`);
    await r.getByRole("button", { name: "Send", exact: true }).click();
    await repeaterOutputTab(panel, "History");
    await expect(r.locator(".history-item")).toHaveCount(2);
    await expectNoSeriousViolations(panel, "historial");
    await expectNoHorizontalScroll(panel);
  });
}

test("005 FR-033: repeater solo con teclado", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const app = await openApp(context, servers.appOrigin);
  const tabId = await tabIdOf(nahualWorker, `${servers.appOrigin}/`);
  const panel = await openPanel(context, extensionId, tabId);
  await panel.setViewportSize({ width: 1000, height: 800 });
  await attach(panel);
  await app.reload();
  await callApi(app, "items");

  // Shift+F10 sobre la fila ⇒ "Send to repeater".
  const row = trafficRow(panel, "/api/items");
  await row.focus();
  await panel.keyboard.press("Shift+F10");
  await panel.keyboard.press("ArrowDown");
  await expect(panel.getByRole("menuitem", { name: "Send to repeater" })).toBeFocused();
  await panel.keyboard.press("Enter");
  const r = panel.locator(".repeater");
  await expect(repeaterTabs(panel).getByRole("tab", { selected: true })).toBeVisible();

  // Editar la URL, un header y enviar con Ctrl+Enter.
  const url = r.getByLabel("URL", { exact: true });
  expect(await tabTo(panel, url)).toBe(true);
  await panel.keyboard.press("Control+A");
  await panel.keyboard.type(`${servers.apiOrigin}/echo`);
  expect(await tabTo(panel, r.getByRole("button", { name: "Add header" }))).toBe(true);
  await panel.keyboard.press("Enter");
  await panel.keyboard.press("Shift+Tab");
  await panel.keyboard.press("Shift+Tab");
  await panel.keyboard.press("Shift+Tab");
  await panel.keyboard.type("x-custom");
  await panel.keyboard.press("Control+Enter");
  await expect(r.locator(".send-result").getByLabel("Response body")).toContainText(
    "nahual_session",
  );

  // Modo, pestañas, renombrar y cerrar con deshacer.
  expect(await tabTo(panel, r.getByRole("button", { name: "Clean context" }))).toBe(true);
  await panel.keyboard.press("Enter");
  await expect(r.getByRole("button", { name: "Clean context" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(await tabTo(panel, r.getByRole("button", { name: "New tab" }))).toBe(true);
  await panel.keyboard.press("Enter");
  expect(await tabTo(panel, repeaterTabs(panel).getByRole("tab", { selected: true }))).toBe(true);
  await panel.keyboard.press("ArrowLeft");
  await expect(repeaterTabs(panel).getByRole("tab", { name: "GET /api/items" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(await tabTo(panel, r.getByRole("button", { name: "Rename" }))).toBe(true);
  await panel.keyboard.press("Enter");
  await expect(r.getByLabel("Tab name")).toBeFocused();
  await panel.keyboard.press("Control+A");
  await panel.keyboard.type("Echo");
  await panel.keyboard.press("Enter");
  await expect(repeaterTabs(panel).getByRole("tab", { selected: true })).toHaveText("Echo");
  expect(await tabTo(panel, r.getByRole("button", { name: "Close tab" }))).toBe(true);
  await panel.keyboard.press("Enter");
  await expect(repeaterTabs(panel).getByRole("tab")).toHaveCount(1);
  expect(await tabTo(panel, panel.getByRole("button", { name: "Undo" }))).toBe(true);
  await panel.keyboard.press("Enter");
  await expect(repeaterTabs(panel).getByRole("tab")).toHaveCount(2);
});

/** La SPA pide una ruta de la API y el request se reenvía a otra desde el repeater. */
async function repeaterDiff(panel: Page, app: Page, base: string, path: string, to: string) {
  await app.evaluate(async (u) => {
    await (await fetch(u, { credentials: "include" })).text();
  }, `${base}${path}`);
  await openSection(panel, "Traffic");
  await trafficRow(panel, path).last().click({ button: "right" });
  await panel.getByRole("menuitem", { name: "Send to repeater" }).click();
  const r = panel.locator(".repeater");
  await r.getByLabel("URL", { exact: true }).fill(`${base}${to}`);
  await r.getByRole("button", { name: "Send", exact: true }).click();
  await r.getByRole("button", { name: "Compare with original" }).click();
  await expect(panel.locator(".diff-view").getByRole("status")).toBeVisible();
  return panel.locator(".diff-view");
}

for (const colorScheme of ["light", "dark"] as const) {
  test(`005 US2: diff en tema ${colorScheme}, a 320 px`, async ({
    context,
    nahualWorker,
    extensionId,
    servers,
  }) => {
    const app = await openApp(context, servers.appOrigin);
    const tabId = await tabIdOf(nahualWorker, `${servers.appOrigin}/`);
    const panel = await openPanel(context, extensionId, tabId);
    await panel.emulateMedia({ colorScheme });
    await panel.setViewportSize({ width: 320, height: 900 });
    await attach(panel);
    await app.reload();

    const diff = await repeaterDiff(panel, app, servers.apiOrigin, "/diff/a", "/diff/b");
    await expectNoSeriousViolations(panel, "diff JSON");
    await expectNoHorizontalScroll(panel);
    await diff
      .locator(".diff-change")
      .filter({ hasText: "$.meta.timestamp" })
      .getByRole("button", { name: "Ignore this path" })
      .click();
    await diff.getByRole("button", { name: "1 ignored" }).click();
    await expectNoSeriousViolations(panel, "diff con ignorados");
    await diff.getByRole("button", { name: "Show sensitive values" }).click();
    await expectNoSeriousViolations(panel, "diff con sensibles visibles");
    await expectNoHorizontalScroll(panel);

    await repeaterDiff(panel, app, servers.apiOrigin, "/diff/text?v=1", "/diff/text?v=2");
    await expectNoSeriousViolations(panel, "diff por líneas");
    // Sin diferencias, de forma determinista: la pegada solo compara el body (el header Date de
    // dos envíos puede cambiar de segundo).
    await repeaterDiff(panel, app, servers.apiOrigin, "/api/items", "/api/items");
    const r = panel.locator(".repeater");
    await panel.locator(".diff-view").getByRole("button", { name: "Close diff" }).click();
    await repeaterOutputTab(panel, "History");
    await r.getByRole("button", { name: "Paste expected response" }).click();
    await r.getByLabel("Pasted response (JSON or text)").fill('{"items":[1,2]}');
    await r.getByRole("button", { name: "Use this response" }).click();
    await r.getByRole("button", { name: "Compare pasted with last send" }).click();
    await expect(panel.locator(".diff-view").getByText("No differences")).toBeVisible();
    await expectNoSeriousViolations(panel, "sin diferencias");
    await expectNoHorizontalScroll(panel);
  });
}

test("005 FR-033: diff solo con teclado", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const app = await openApp(context, servers.appOrigin);
  const tabId = await tabIdOf(nahualWorker, `${servers.appOrigin}/`);
  const panel = await openPanel(context, extensionId, tabId);
  await panel.setViewportSize({ width: 1000, height: 800 });
  await attach(panel);
  await app.reload();
  const diff = await repeaterDiff(panel, app, servers.apiOrigin, "/diff/a", "/diff/b");

  // Elegir los lados con teclado.
  expect(await tabTo(panel, diff.getByRole("combobox", { name: "Before" }))).toBe(true);
  expect(await tabTo(panel, diff.getByRole("button", { name: "Swap" }))).toBe(true);
  await panel.keyboard.press("Enter");
  await panel.keyboard.press("Enter");
  // J/K entre cambios.
  expect(await tabTo(panel, diff.getByRole("button", { name: "Next change" }))).toBe(true);
  await panel.keyboard.press("Enter");
  await expect(diff.locator("[data-change]").first()).toBeFocused();
  await panel.keyboard.press("j");
  await expect(diff.locator("[data-change]").nth(1)).toBeFocused();
  await panel.keyboard.press("k");
  await expect(diff.locator("[data-change]").first()).toBeFocused();
  // Ignorar y mostrar sensibles.
  const timestamp = diff.locator(".diff-change").filter({ hasText: "$.meta.timestamp" });
  expect(await tabTo(panel, timestamp.getByRole("button", { name: "Ignore this path" }))).toBe(
    true,
  );
  await panel.keyboard.press("Enter");
  await expect(timestamp).toHaveCount(0);
  expect(await tabTo(panel, diff.getByRole("button", { name: "Show sensitive values" }))).toBe(
    true,
  );
  await panel.keyboard.press("Enter");
  await expect(diff.getByRole("button", { name: "Hide sensitive values" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  // Escape cierra el diff sin abrir la consola de DevTools y el foco no se pierde.
  await diff.locator("[data-change]").first().focus();
  await panel.keyboard.press("Escape");
  await expect(panel.locator(".diff-view")).toHaveCount(0);
  await expect(panel.locator(".repeater .send-result")).toBeVisible();
});
