import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { attach, openApp, openPanel, statusOf, tabIdOf } from "./fixtures/panel.ts";
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
    await openApp(context, servers.appOrigin);
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
