import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import {
  addPattern,
  attach,
  openApp,
  openPanel,
  pausedOption,
  startFetch,
  statusOf,
  tabIdOf,
} from "./fixtures/panel.ts";
import { expect, test } from "./fixtures/extension.ts";

const paused = (panel: Page) => panel.getByRole("listbox").getByRole("option");

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function expectNoSeriousViolations(panel: Page, label: string) {
  const { violations } = await new AxeBuilder({ page: panel }).withTags(WCAG).analyze();
  const serious = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${label}: ${v.id} (${v.nodes.length})`)).toEqual([]);
}

async function expectNoHorizontalScroll(panel: Page) {
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

    await expectNoSeriousViolations(panel, "vacío");
    await expectNoHorizontalScroll(panel);

    await attach(panel);
    await addPattern(panel, "*echo-headers*", "request");
    void startFetch(app, `${servers.apiOrigin}/echo-headers`).catch(() => {});
    await expect(pausedOption(panel, "/echo-headers")).toBeVisible();
    await expectNoSeriousViolations(panel, "con pausas");
    await expectNoHorizontalScroll(panel);

    await panel.getByLabel(/Pause timeout/).fill("200");
    await panel.getByRole("button", { name: "Apply" }).click();
    await expect(panel.getByRole("alert")).toContainText("between 5 and 120");
    await expectNoSeriousViolations(panel, "error");
    await expectNoHorizontalScroll(panel);
  });
}

test("ciclo completo solo con teclado", async ({ context, nahualWorker, extensionId, servers }) => {
  const app = await openApp(context, servers.appOrigin);
  const tabId = await tabIdOf(nahualWorker, `${servers.appOrigin}/`);
  const panel = await openPanel(context, extensionId, tabId);
  await panel.bringToFront();

  const tabUntil = async (predicate: () => boolean) => {
    for (let i = 0; i < 30; i++) {
      await panel.keyboard.press("Tab");
      if (await panel.evaluate(predicate)) return;
    }
    throw new Error("No se llegó al elemento con Tab");
  };

  await panel.keyboard.press("Alt+Shift+A");
  await expect(statusOf(panel)).toContainText("Attached");

  await tabUntil(
    () => document.activeElement?.closest("label")?.textContent?.includes("URL pattern") ?? false,
  );
  await panel.keyboard.type("*echo-headers*");
  await panel.keyboard.press("Enter");
  await expect(panel.getByText("*echo-headers*", { exact: true })).toBeVisible();

  const response = startFetch(app, `${servers.apiOrigin}/echo-headers`);
  await expect(pausedOption(panel, "/echo-headers")).toBeVisible();
  void startFetch(app, `${servers.apiOrigin}/echo-headers?2`).catch(() => {});
  await expect(paused(panel)).toHaveCount(2);

  await tabUntil(() => document.activeElement?.getAttribute("role") === "listbox");
  await panel.keyboard.press("ArrowDown");
  await expect(paused(panel).nth(1)).toHaveAttribute("aria-selected", "true");
  await panel.keyboard.press("ArrowUp");
  await panel.keyboard.press("Alt+Shift+C");
  expect((await response).status).toBe(200);
  await expect(paused(panel)).toHaveCount(1);
  await panel.keyboard.press("Alt+Shift+C");
  await expect(paused(panel)).toHaveCount(0);

  await panel.keyboard.press("Alt+Shift+A");
  await expect(statusOf(panel)).toContainText("Disconnected");
});
