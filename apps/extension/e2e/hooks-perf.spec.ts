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
