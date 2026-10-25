import type { Page } from "@playwright/test";
import { expectNoHorizontalScroll, expectNoSeriousViolations } from "./fixtures/axe.ts";
import {
  appFetch,
  attach,
  installHook,
  openApp,
  openPanel,
  openSection,
  tabIdOf,
  trafficRow,
} from "./fixtures/panel.ts";
import { expect, test } from "./fixtures/extension.ts";

// 006 (FR-018, FR-040): axe del editor del hook y de la pestaña Hooks en claro y oscuro a 320 px,
// y recorrido solo con teclado del editor.

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
  test(`006 US1: editor del hook y pestaña Hooks en tema ${colorScheme}, a 320 px`, async ({
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

    await openSection(panel, "Rules");
    await panel
      .getByRole("button", { name: /Create your first rule|New rule/ })
      .first()
      .click();
    await panel.getByLabel("Action", { exact: true }).selectOption("hook");
    await expect(panel.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });
    await expect(panel.getByRole("status").filter({ hasText: "No problems." })).toBeVisible();
    await expectNoSeriousViolations(panel, "editor del hook");
    await expectNoHorizontalScroll(panel);

    // Con errores y con las sugerencias abiertas.
    await panel.locator(".cm-content").click();
    await panel.keyboard.press("Control+A");
    await panel.keyboard.insertText(
      'export default (ctx: HookContext) => {\n  ctx.response!.status = "x";\n  ctx.\n};',
    );
    await expect(panel.getByText(/problems prevent enabling the rule/)).toBeVisible();
    await panel.locator(".cm-line").nth(2).click();
    await panel.keyboard.press("End");
    await panel.keyboard.press("Control+Space");
    await expect(panel.locator(".cm-tooltip-autocomplete")).toBeVisible();
    await expectNoSeriousViolations(panel, "editor con errores y sugerencias");
    await expectNoHorizontalScroll(panel);
    await panel.keyboard.press("Escape");
    await panel.getByRole("button", { name: "Cancel" }).click();

    // Pestaña Hooks con un error y registros.
    await installHook(panel, {
      name: "Con registro",
      stage: "response",
      prefilter: "*/hooks/items*",
      source: `export default (ctx) => { ctx.log("items", { access_token: "s" }); throw new Error("boom"); };`,
    });
    await appFetch(app, `${servers.apiOrigin}/hooks/items`);
    await openSection(panel, "Traffic");
    await trafficRow(panel, "/hooks/items").last().click();
    await panel.locator(".detail").getByRole("tab", { name: "Hooks" }).click();
    await expect(panel.locator(".hooks-tab").getByText(/boom/)).toBeVisible();
    await expect(
      panel.locator(".hooks-tab").getByText('items {"access_token":"••••••"}'),
    ).toBeVisible();
    await expectNoSeriousViolations(panel, "pestaña Hooks");
    await expectNoHorizontalScroll(panel);
  });
}

test("006 FR-018: editor del hook solo con teclado", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const app = await openApp(context, servers.appOrigin);
  const tabId = await tabIdOf(nahualWorker, `${servers.appOrigin}/`);
  const panel = await openPanel(context, extensionId, tabId);
  await panel.setViewportSize({ width: 1000, height: 900 });
  await attach(panel);
  await app.reload();
  await openSection(panel, "Rules");
  const create = panel.getByRole("button", { name: /Create your first rule|New rule/ }).first();
  expect(await tabTo(panel, create)).toBe(true);
  await panel.keyboard.press("Enter");
  await panel.keyboard.type("Hook por teclado");
  const prefilter = panel.getByLabel("URL prefilter");
  expect(await tabTo(panel, prefilter)).toBe(true);
  await panel.keyboard.press("Control+A");
  await panel.keyboard.type("*/echo*");
  const stage = panel.getByLabel("Stage");
  expect(await tabTo(panel, stage)).toBe(true);
  await stage.selectOption("request");
  const action = panel.getByLabel("Action", { exact: true });
  expect(await tabTo(panel, action)).toBe(true);
  await action.selectOption("hook");
  await expect(panel.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });

  // Entra al editor con Tab, escribe y acepta una sugerencia con Enter.
  const code = panel.locator(".cm-content");
  expect(await tabTo(panel, code)).toBe(true);
  await panel.keyboard.press("Control+A");
  await panel.keyboard.insertText("export default (ctx: HookContext) => {\n  ctx.setHe");
  await panel.keyboard.press("Control+Space");
  await expect(
    panel.locator(".cm-tooltip-autocomplete li").filter({ hasText: "setHeader" }),
  ).toBeVisible();
  await panel.keyboard.press("Enter");
  await panel.keyboard.insertText('("x-kb", "1");\n  return ctx;\n};');
  // Tab inserta tabulación; Esc y luego Tab sale del editor sin cerrar la regla. Si las
  // sugerencias están abiertas, la primera Esc las cierra (como en Sources).
  await panel.waitForTimeout(400); // el completado es asíncrono
  if ((await panel.locator(".cm-tooltip-autocomplete").count()) > 0) {
    await panel.keyboard.press("Escape");
    await expect(panel.locator(".cm-tooltip-autocomplete")).toHaveCount(0);
  }
  await panel.keyboard.press("Escape");
  await panel.keyboard.press("Tab");
  await expect(code).not.toBeFocused();
  await expect(panel.getByRole("heading", { name: "New rule" })).toBeVisible();
  await expect(panel.getByRole("status").filter({ hasText: "No problems." })).toBeVisible();

  // Marca un permiso y guarda con Ctrl+S.
  const permission = panel.getByRole("checkbox", { name: /can change the request's destination/ });
  expect(await tabTo(panel, permission)).toBe(true);
  await panel.keyboard.press("Space");
  await expect(permission).toBeChecked();
  await panel.keyboard.press("Control+s");
  const item = panel.locator(".rule-item").filter({ hasText: "Hook por teclado" });
  await expect(item.getByRole("switch")).toBeChecked();
  const echo = JSON.parse((await appFetch(app, `${servers.apiOrigin}/echo`)).body) as {
    headers: Record<string, string>;
  };
  expect(echo.headers["x-kb"]).toBe("1");
});
