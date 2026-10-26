import type { BrowserContext, Page, Worker } from "@playwright/test";
import {
  attachAndReload,
  attachOrReconnect,
  callApi,
  openApp,
  openPanel,
  openSection,
  openSettings,
  closeSettings,
  tabIdOf,
  trafficRow,
} from "./fixtures/panel.ts";
import type { TestServers } from "./fixtures/servers.ts";
import { expect, test } from "./fixtures/extension.ts";

// 004 US4: lugares para 005–007 (FR-025 a FR-029, SC-009), llenos con el gancho del build de
// pruebas `__nahualUiSlots` (research R13).

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
  await attachAndReload(panel, app);
  await callApi(app, "items");
  await callApi(app, "empty");
  await callApi(app, "error");
  await expect(trafficRow(panel, "/api/error")).toBeVisible();
  return { app, panel };
}

const enableSlots = (panel: Page) =>
  panel.evaluate(() => {
    const slots = (window as { __nahualUiSlots?: { enable(): void } }).__nahualUiSlots;
    if (!slots) throw new Error("build sin __nahualUiSlots");
    slots.enable();
  });

/** Elementos que desbordan en horizontal: ni texto recortado con elipsis ni zonas con scroll. */
const overflowing = (panel: Page) =>
  panel.evaluate(() => {
    const roots = [...document.querySelectorAll(".topbar, .strip, main, .drawer")];
    const bad: string[] = [];
    for (const root of roots) {
      for (const el of [root, ...root.querySelectorAll("*")]) {
        if (el.scrollWidth <= el.clientWidth + 1) continue;
        // Texto solo para lectores de pantalla: recortado a propósito.
        if (el.classList.contains("visually-hidden")) continue;
        const style = getComputedStyle(el);
        if (["auto", "scroll"].includes(style.overflowX)) continue;
        if (style.overflowX === "hidden" && style.textOverflow === "ellipsis") continue;
        if (style.overflowX === "hidden" && el.closest(".cell, .site")) continue;
        bad.push(`${el.tagName}.${el.className}`);
      }
    }
    if (document.documentElement.scrollWidth > window.innerWidth) bad.push("documento");
    return bad;
  });

/** Controles visibles tapados por otro elemento (comprobación en su centro). */
const covered = (panel: Page) =>
  panel.evaluate(() => {
    const controls = document.querySelectorAll(
      ".topbar button, .strip button, main button, main input, main select, [role=separator], .drawer button",
    );
    const bad: string[] = [];
    for (const el of controls) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      if (x < 0 || y < 0 || x >= window.innerWidth || y >= window.innerHeight) continue;
      // Fuera de la parte visible de sus zonas con scroll (recortado, no tapado) no cuenta.
      let clipped = false;
      for (let p = el.parentElement; p && !clipped; p = p.parentElement) {
        const style = getComputedStyle(p);
        if (style.overflowX === "visible" && style.overflowY === "visible") continue;
        const s = p.getBoundingClientRect();
        clipped = y < s.top || y > s.bottom || x < s.left || x > s.right;
      }
      if (clipped) continue;
      const hit = document.elementFromPoint(x, y);
      if (hit && hit !== el && !el.contains(hit)) {
        bad.push(
          `${el.tagName}.${el.className} "${el.getAttribute("aria-label") ?? el.textContent?.trim()}" bajo ${hit.tagName}.${hit.className}`,
        );
      }
    }
    return bad;
  });

/**
 * Pulsa Tab hasta enfocar el elemento (máximo 120 veces). Una pestaña se alcanza como en el patrón
 * APG: Tab hasta la pestaña activa y flechas dentro de la lista.
 */
async function reachableByTab(panel: Page, name: RegExp, role: "tab" | "button" = "button") {
  await panel.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  const target = panel.getByRole(role, { name }).first();
  const focused = () => target.evaluate((el) => el === document.activeElement);
  for (let i = 0; i < 120; i++) {
    await panel.keyboard.press("Tab");
    if (await focused()) return true;
    const inTablist = await target.evaluate(
      (el) => el.closest("[role=tablist]")?.contains(document.activeElement) ?? false,
    );
    if (role === "tab" && inTablist) {
      await panel.keyboard.press("End");
      return focused();
    }
  }
  return false;
}

for (const width of [320, 800, 1280]) {
  test(`SC-009: lugares reservados llenos a ${width} px sin desbordes ni elementos tapados`, async ({
    context,
    nahualWorker,
    extensionId,
    servers,
  }) => {
    const { panel } = await setup({ context, nahualWorker, extensionId, servers });
    await panel.setViewportSize({ width, height: 800 });
    await enableSlots(panel);
    const banner = panel.getByRole("banner");
    await expect(banner.getByRole("tab", { name: /^Slot/ })).toBeVisible();
    await expect(banner.getByRole("button", { name: /^Slot status/ })).toHaveCount(2);
    await expect(panel.getByRole("region", { name: "Slot drawer" })).toBeVisible();

    await trafficRow(panel, "/api/items").click();
    expect(await overflowing(panel)).toEqual([]);
    expect(await covered(panel)).toEqual([]);
    expect(await reachableByTab(panel, /^Slot/, "tab")).toBe(true);
    expect(await reachableByTab(panel, /^Slot status 2/)).toBe(true);

    await openSection(panel, "Rules");
    await panel.getByRole("button", { name: /^(Create your first rule|New rule)$/ }).click();
    await expect(panel.locator(".slot-wide-editor")).toBeVisible();
    expect(await overflowing(panel)).toEqual([]);
    expect(await covered(panel)).toEqual([]);

    const settings = await openSettings(panel);
    await expect(settings.getByRole("tab", { name: "Slot settings" })).toBeVisible();
    await closeSettings(panel);
  });
}

test("FR-026/027/028: cajón plegable con alto recordado, lista de reglas con divisor, selección múltiple", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const { panel } = await setup({ context, nahualWorker, extensionId, servers });
  await panel.setViewportSize({ width: 1000, height: 800 });
  await enableSlots(panel);

  // Cajón: se pliega, se despliega y recuerda su alto.
  const drawer = panel.getByRole("region", { name: "Slot drawer" });
  const toggle = drawer.getByRole("button", { name: /^(Collapse|Expand)/ });
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  const handle = drawer.getByRole("separator");
  const before = (await drawer.boundingBox())?.height ?? 0;
  await handle.focus();
  await panel.keyboard.press("ArrowUp");
  await panel.keyboard.press("ArrowUp");
  const after = (await drawer.boundingBox())?.height ?? 0;
  expect(after).toBeGreaterThan(before);
  await panel.waitForTimeout(400);
  await panel.reload();
  await enableSlots(panel);
  // Cerrar el panel suelta el debugger (002 FR-027b): se vuelve a adjuntar para editar reglas.
  await attachOrReconnect(panel);
  await expect
    .poll(async () => Math.round((await drawer.boundingBox())?.height ?? 0))
    .toBe(Math.round(after));

  // Reglas: la lista se angosta con el divisor.
  await openSection(panel, "Rules");
  await panel.getByRole("button", { name: /^(Create your first rule|New rule)$/ }).click();
  const divider = panel.getByRole("separator", { name: /^Rules list/ });
  await expect(divider).toBeVisible();
  const list = panel.locator(".split-start").filter({ has: panel.locator(".rules") });
  const wide = (await list.boundingBox())?.width ?? 0;
  await divider.focus();
  await panel.keyboard.press("ArrowLeft");
  await panel.keyboard.press("ArrowLeft");
  expect((await list.boundingBox())?.width ?? 0).toBeLessThan(wide);
});

test("FR-028: selección múltiple con la acción por lote; sin el gancho no existe nada de 005–007", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const { app, panel } = await setup({ context, nahualWorker, extensionId, servers });
  await panel.setViewportSize({ width: 1000, height: 800 });
  // Sin el gancho: ni cajón ni secciones de más. Las casillas sí existen desde 007, que registra
  // las primeras acciones por lote (exportar).
  await expect(panel.getByRole("region", { name: "Slot drawer" })).toHaveCount(0);
  await expect(panel.getByRole("tab", { name: /^Slot/ })).toHaveCount(0);

  await enableSlots(panel);
  await callApi(app, "items");
  const select = (text: string) =>
    trafficRow(panel, text)
      .first()
      .getByRole("checkbox", { name: /^Select/ });
  await select("/api/items").check();
  await expect(panel.getByText(/selected$/)).toHaveCount(0);
  await expect(panel.getByRole("button", { name: "Slot batch action" })).toHaveCount(0);
  await select("/api/error").check();
  await expect(panel.getByText("2 selected")).toBeVisible();
  await expect(panel.getByRole("button", { name: "Slot batch action" })).toBeVisible();
  // Ctrl+clic quita una; Shift+clic marca el rango.
  await trafficRow(panel, "/api/error")
    .first()
    .click({ modifiers: ["ControlOrMeta"] });
  await expect(panel.getByRole("button", { name: "Slot batch action" })).toHaveCount(0);
  await trafficRow(panel, "/api/error")
    .first()
    .click({ modifiers: ["Shift"] });
  await expect(panel.getByText(/^[2-9] selected$/)).toBeVisible();
});
