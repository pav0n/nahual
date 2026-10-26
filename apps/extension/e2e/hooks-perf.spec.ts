import type { Page } from "@playwright/test";
import { attachAndReload, installHook, openPanel, openSection, tabIdOf } from "./fixtures/panel.ts";
import { expect, test } from "./fixtures/extension.ts";

// 006 SC-002 (research R16): un hook trivial añade < 10 ms en p95 frente a la misma regla con
// "Solo registrar", medido como E4 de 001 (fetch secuenciales y Resource Timing en la página).

const N = 300;
const WARMUP = 20;

const percentile = (values: number[], p: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] ?? 0;
};

async function load(app: Page, url: string) {
  const times = await app.evaluate(
    ([u, n]) =>
      (window as unknown as { runLoad(u: string, n: number): Promise<number[]> }).runLoad(u, n),
    [url, N + WARMUP] as const,
  );
  const measured = times.slice(WARMUP);
  return { p50: percentile(measured, 50), p95: percentile(measured, 95) };
}

test(
  "SC-002: overhead de un hook trivial < 10 ms p95",
  { tag: "@perf" },
  async ({ context, nahualWorker, extensionId, servers }) => {
    test.setTimeout(180_000);
    const app = await context.newPage();
    await app.goto(`${servers.appOrigin}/load`);
    const tabId = await tabIdOf(nahualWorker, `${servers.appOrigin}/load`);
    const panel = await openPanel(context, extensionId, tabId);
    await attachAndReload(panel, app);
    const url = `${servers.apiOrigin}/data`;

    const baseline = await load(app, url);
    await openSection(panel, "Rules");
    await panel.getByRole("button", { name: /^(Create your first rule|New rule)$/ }).click();
    const editor = panel.locator(".editor");
    await editor.getByLabel("Name", { exact: true }).fill("Registrar");
    await editor.getByLabel("URL prefilter").fill("*/data*");
    await editor.getByLabel("Stage").selectOption("request");
    await editor.getByLabel("Action", { exact: true }).selectOption("log");
    await editor.getByRole("button", { name: "Save rule" }).click();
    await expect(panel.locator(".rule-item").filter({ hasText: "Registrar" })).toBeVisible();
    const logged = await load(app, url);
    await openSection(panel, "Rules");
    await panel
      .locator(".rule-item")
      .filter({ hasText: "Registrar" })
      .getByRole("switch")
      .uncheck();
    await installHook(panel, {
      name: "Trivial",
      stage: "request",
      prefilter: "*/data*",
      source: "export default (ctx) => ctx;",
    });
    const hooked = await load(app, url);
    const overhead = { p50: hooked.p50 - logged.p50, p95: hooked.p95 - logged.p95 };
    console.log(`[006-sc002] ${JSON.stringify({ baseline, logged, hooked, overhead })}`);
    expect(overhead.p95).toBeLessThan(10);
  },
);

test(
  "007 T069: con un perfil activo, el p95 del tráfico no supera el de todas las reglas (006)",
  { tag: "@perf" },
  async ({ context, nahualWorker, extensionId, servers }) => {
    test.setTimeout(180_000);
    const app = await context.newPage();
    await app.goto(`${servers.appOrigin}/load`);
    const tabId = await tabIdOf(nahualWorker, `${servers.appOrigin}/load`);
    const panel = await openPanel(context, extensionId, tabId);
    await attachAndReload(panel, app);
    const url = `${servers.apiOrigin}/data`;

    await openSection(panel, "Rules");
    await panel.getByRole("button", { name: /^(Create your first rule|New rule)$/ }).click();
    const editor = panel.locator(".editor");
    await editor.getByLabel("Name", { exact: true }).fill("Registrar");
    await editor.getByLabel("URL prefilter").fill("*/data*");
    await editor.getByLabel("Stage").selectOption("request");
    await editor.getByLabel("Action", { exact: true }).selectOption("log");
    await editor.getByRole("button", { name: "Save rule" }).click();
    const rule = panel.locator(".rule-item").filter({ hasText: "Registrar" });
    await expect(rule).toBeVisible();
    // Comportamiento de 006: sin perfiles, todas las reglas.
    const all = await load(app, url);

    await panel.getByRole("button", { name: "Settings", exact: true }).click();
    const settings = panel.getByRole("dialog", { name: "Settings" });
    await settings.getByRole("tab", { name: "Profiles" }).click();
    await settings.getByLabel("New profile").fill("QA staging");
    await settings.getByRole("button", { name: "Create profile" }).click();
    await expect(
      settings.getByRole("button", { name: "Delete profile: QA staging" }),
    ).toBeVisible();
    await settings.getByRole("button", { name: "Close" }).click();
    await rule.getByRole("button", { name: "Assign profiles: Registrar" }).click();
    await panel.getByRole("menuitemcheckbox", { name: "QA staging" }).click();
    await panel.keyboard.press("Escape");
    await panel.getByRole("button", { name: /^This tab's rule profile:/ }).click();
    await panel
      .getByRole("menu", { name: "Rule profile" })
      .getByRole("menuitemcheckbox", { name: /^QA staging/ })
      .click();
    await expect(panel.getByRole("button", { name: /^This tab's rule profile:/ })).toContainText(
      "QA staging",
    );
    const profiled = await load(app, url);
    const delta = { p50: profiled.p50 - all.p50, p95: profiled.p95 - all.p95 };
    console.log(`[007-t069] ${JSON.stringify({ all, profiled, delta })}`);
    // Mismo trabajo por request; el margen es el ruido de la medición (como SC-002 de 006).
    expect(delta.p95).toBeLessThan(5);
  },
);
