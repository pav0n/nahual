import type { Page } from "@playwright/test";
import {
  attachAndReload,
  filterTraffic,
  openApp,
  openPanel,
  tabIdOf,
  trafficRow,
} from "./fixtures/panel.ts";
import { expect, test } from "./fixtures/extension.ts";

// 004 FR-033, SC-007 (research R17): filtrar 2,000 entradas sigue por debajo de 300 ms con el
// detalle abierto y con selección múltiple (lugares reservados llenos). Misma medición que 002.

const count = (panel: Page) => panel.locator(".filters .count");

/** Tiempo desde que cambia el texto de búsqueda hasta que el contador se actualiza. */
const measureFilter = (panel: Page, text: string) =>
  panel.evaluate(async (value) => {
    const input = document.getElementById("traffic-search") as HTMLInputElement;
    const counter = document.querySelector(".filters .count") as HTMLElement;
    const before = counter.textContent;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    const start = performance.now();
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    while (counter.textContent === before) await new Promise((r) => requestAnimationFrame(r));
    return performance.now() - start;
  }, text);

test("SC-007: filtrar 2,000 entradas < 300 ms con detalle abierto y con selección múltiple", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  test.setTimeout(120_000);
  const app = await openApp(context, servers.appOrigin);
  const tabId = await tabIdOf(nahualWorker, `${servers.appOrigin}/`);
  const panel = await openPanel(context, extensionId, tabId);
  await panel.setViewportSize({ width: 1280, height: 800 });
  await attachAndReload(panel, app);
  await app.evaluate(async (base) => {
    for (let i = 0; i < 2010; i++) await (await fetch(`${base}/data?i=${i}`)).text();
  }, servers.apiOrigin);
  await expect(count(panel)).toHaveText("2000 of 2000", { timeout: 30_000 });

  // Con el detalle abierto.
  // Filas del principio de la lista virtualizada (las primeras 10 se descartaron por el tope).
  await trafficRow(panel, /\?i=10(?!\d)/).click();
  await expect(panel.locator(".detail")).toBeVisible();
  const withDetail = await measureFilter(panel, "i=1999");
  console.log(`[SC-007] filtro con 2,000 entradas y detalle abierto: ${withDetail.toFixed(1)} ms`);
  expect(withDetail).toBeLessThan(300);

  // Con selección múltiple (gancho del build de pruebas) y 2 filas marcadas.
  await filterTraffic(panel, "");
  await panel.evaluate(() =>
    (window as { __nahualUiSlots?: { enable(): void } }).__nahualUiSlots?.enable(),
  );
  for (const row of [/\?i=11(?!\d)/, /\?i=12(?!\d)/])
    await trafficRow(panel, row)
      .getByRole("checkbox", { name: /^Select/ })
      .check();
  await expect(panel.getByText("2 selected")).toBeVisible();
  const withSelection = await measureFilter(panel, "i=1998");
  console.log(
    `[SC-007] filtro con 2,000 entradas y 2 seleccionadas: ${withSelection.toFixed(1)} ms`,
  );
  expect(withSelection).toBeLessThan(300);
  test
    .info()
    .annotations.push(
      { type: "SC-007 detalle", description: `${withDetail.toFixed(1)} ms` },
      { type: "SC-007 selección", description: `${withSelection.toFixed(1)} ms` },
    );
});
