import {
  attachAndReload,
  openApp,
  openPanel,
  repeater,
  repeaterResponse,
  repeaterSend,
  sendToRepeater,
  tabIdOf,
  trafficRow,
} from "./fixtures/panel.ts";
import { expect, test } from "./fixtures/extension.ts";

// 005 SC-003 (research R12, R18): diff de dos JSON de ~1 MB en menos de 1 s, sin tareas largas
// (> 50 ms) en el panel mientras se calcula.

test(
  "SC-003: diff de dos JSON de 1 MB en menos de 1 s sin congelar el panel",
  { tag: "@perf" },
  async ({ context, nahualWorker, extensionId, servers }) => {
    test.setTimeout(120_000);
    const app = await openApp(context, servers.appOrigin);
    const tabId = await tabIdOf(nahualWorker, `${servers.appOrigin}/`);
    const panel = await openPanel(context, extensionId, tabId);
    await panel.setViewportSize({ width: 1300, height: 900 });
    await attachAndReload(panel, app);
    await app.evaluate(async (u) => {
      await (await fetch(u)).text();
    }, `${servers.apiOrigin}/diff/big?seed=0`);
    await sendToRepeater(panel, trafficRow(panel, "/diff/big"));
    await repeater(panel)
      .getByLabel("URL", { exact: true })
      .fill(`${servers.apiOrigin}/diff/big?seed=7`);
    await repeaterSend(panel);
    // La respuesta de 1 MB ya formateada y pintada: se mide solo el diff.
    await expect(repeaterResponse(panel)).toBeVisible();
    await panel.waitForTimeout(500);

    await panel.evaluate(() => {
      const w = window as unknown as { __longTasks: number[] };
      w.__longTasks = [];
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) w.__longTasks.push(entry.duration);
      }).observe({ type: "longtask" });
    });
    const start = Date.now();
    // Clic nativo: las comprobaciones de Playwright antes de hacer clic también corren en el hilo
    // del panel y se medirían como tareas largas suyas.
    await repeater(panel).getByRole("button", { name: "Compare with original" }).waitFor();
    await panel.evaluate(() =>
      [...document.querySelectorAll("button")]
        .find((b) => b.textContent === "Compare with original")
        ?.click(),
    );
    // Espera mínima: las aserciones de Playwright recorren todo el DOM (con la respuesta de 1 MB)
    // en el hilo del panel y se contarían como tareas largas suyas.
    await panel.waitForFunction(
      () => document.querySelector(".diff-view [role=status]")?.textContent?.includes("changes"),
      undefined,
      { polling: 50 },
    );
    const elapsed = Date.now() - start;
    const longTasks = await panel.evaluate(
      () => (window as unknown as { __longTasks: number[] }).__longTasks,
    );
    console.log(
      `[SC-003] diff de JSON de 1 MB: ${elapsed} ms; tareas largas: ${JSON.stringify(longTasks)}`,
    );
    // Los 9 valores que cambia `seed` (más algún header como Date o Content-Length).
    await expect(
      panel.locator(".diff-view .diff-path", { hasText: /^\$\.rows\[id=\d+\]\.value$/ }),
    ).toHaveCount(9);
    expect(elapsed).toBeLessThan(1000);
    expect(longTasks.filter((d) => d > 50)).toEqual([]);
  },
);
