import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import {
  attach,
  callApi,
  createRule,
  openApp,
  openPanel,
  openQueue,
  pausedEditor,
  pausedOption,
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

    for (const tab of ["Traffic", "Rules", "Queue"]) {
      await panel.getByRole("tab", { name: new RegExp(`^${tab}`) }).click();
      await expectNoSeriousViolations(panel, `vacío: ${tab}`);
      await expectNoHorizontalScroll(panel);
    }

    await attach(panel);
    await expectNoSeriousViolations(panel, "adjunto");
    await expectNoHorizontalScroll(panel);

    // Historia 1: lista, filtros con error, detalle con headers y body.
    await panel.getByRole("tab", { name: "Traffic" }).click();
    await app.reload();
    await callApi(app, "items");
    await expect(trafficRow(panel, "/api/items")).toBeVisible();
    await expectNoSeriousViolations(panel, "tráfico");
    await expectNoHorizontalScroll(panel);
    await panel.getByLabel("URL regex").fill("([a-z");
    await expectNoSeriousViolations(panel, "filtro inválido");
    await panel.getByLabel("URL regex").fill("");
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

  await panel.getByRole("tab", { name: "Traffic" }).focus();
  await panel.keyboard.press("ArrowRight");
  await expect(panel.getByRole("tab", { name: "Rules" })).toHaveAttribute("aria-selected", "true");
  await expect(panel.getByRole("tab", { name: "Rules" })).toBeFocused();
  await panel.keyboard.press("End");
  await expect(panel.getByRole("tab", { name: /^Queue/ })).toHaveAttribute("aria-selected", "true");
  await panel.keyboard.press("Home");
  await expect(panel.getByRole("tab", { name: "Traffic" })).toHaveAttribute(
    "aria-selected",
    "true",
  );

  await panel.keyboard.press("Alt+Shift+A");
  await expect(statusOf(panel)).toContainText("Disconnected");
});
