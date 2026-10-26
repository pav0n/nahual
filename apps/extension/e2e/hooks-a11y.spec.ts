import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
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

for (const colorScheme of ["light", "dark"] as const) {
  test(`006 US2: consola de hooks y contador en tema ${colorScheme}, a 320 px`, async ({
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
    await installHook(panel, {
      name: "Consola",
      stage: "response",
      prefilter: "*/hooks/items*",
      source: `export default (ctx) => { ctx.log("items", 3); };`,
    });
    const drawer = panel.getByRole("region", { name: "Hooks console" });
    await drawer.getByRole("button", { name: /^Expand/ }).click();
    await expect(drawer.getByText(/Your hooks' logs and errors will appear here/)).toBeVisible();
    await expectNoSeriousViolations(panel, "consola vacía");
    await expectNoHorizontalScroll(panel);

    await appFetch(app, `${servers.apiOrigin}/hooks/items`);
    await installHook(panel, {
      name: "Falla",
      stage: "response",
      prefilter: "*/hooks/items*",
      source: `export default () => { throw new Error("boom"); };`,
    });
    await drawer.getByRole("button", { name: /^Collapse/ }).click();
    // Solo errores seguidos del mismo hook se agrupan (como Console): fuera el que registra.
    await openSection(panel, "Rules");
    await panel.locator(".rule-item").filter({ hasText: "Consola" }).getByRole("switch").uncheck();
    await appFetch(app, `${servers.apiOrigin}/hooks/items`);
    await appFetch(app, `${servers.apiOrigin}/hooks/items`);
    const counter = panel.getByRole("button", { name: /unread hook errors/ });
    await expect(counter).toBeVisible();
    await expectNoSeriousViolations(panel, "contador de errores");
    await counter.click();
    await expect(drawer.locator(".console-count")).toHaveText("2");
    await expectNoSeriousViolations(panel, "consola con errores agrupados");
    await drawer.getByRole("button", { name: "Logs" }).click();
    await expect(drawer.locator(".console-row[data-level=log]").first()).toBeVisible();
    await expectNoSeriousViolations(panel, "consola con registros");
    await expectNoHorizontalScroll(panel);
  });
}

test("006 FR-026: consola solo con teclado hasta abrir un request", async ({
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
  await installHook(panel, {
    name: "Teclado",
    stage: "response",
    prefilter: "*/hooks/items*",
    source: `export default (ctx) => { ctx.log("uno"); ctx.log("dos"); };`,
  });
  await appFetch(app, `${servers.apiOrigin}/hooks/items`);
  const drawer = panel.getByRole("region", { name: "Hooks console" });
  const expand = drawer.getByRole("button", { name: /^Expand/ });
  expect(await tabTo(panel, expand)).toBe(true);
  await panel.keyboard.press("Enter");
  const links = drawer.locator(".console-link");
  await expect(links).toHaveCount(2);
  expect(await tabTo(panel, links.first())).toBe(true);
  await panel.keyboard.press("ArrowDown");
  await expect(links.nth(1)).toBeFocused();
  await panel.keyboard.press("Enter");
  await expect(
    panel.locator(".detail").getByRole("tab", { name: "Hooks", selected: true }),
  ).toBeVisible();
});

const importFixture = () => {
  const folder = mkdtempSync(path.join(tmpdir(), "nahual-a11y-"));
  const file = path.join(folder, "hook.ts");
  writeFileSync(
    file,
    `/* @nahual-hook 1\n{"name":"Importado","stage":"response","prefilter":{"kind":"glob","pattern":"*\\/hooks/items*"},"resourceTypes":["Fetch"],"conditions":[]}\n*/\nexport default (ctx: HookContext) => {\n  return ctx;\n};\n`,
  );
  return file;
};

for (const colorScheme of ["light", "dark"] as const) {
  test(`006 US3: diálogo de importación en tema ${colorScheme}, a 320 px`, async ({
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
    await panel.getByLabel("Import hook…").setInputFiles(importFixture());
    await expect(panel.getByRole("dialog", { name: "Import hook" })).toBeVisible();
    await expectNoSeriousViolations(panel, "diálogo de importación");
    await expectNoHorizontalScroll(panel);
  });
}

test("006 FR-036: importar solo con teclado (revisar, cancelar, importar)", async ({
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
  const file = importFixture();
  const open = async () => {
    const chooser = panel.waitForEvent("filechooser");
    expect(await tabTo(panel, panel.getByRole("button", { name: "Import hook…" }))).toBe(true);
    await panel.keyboard.press("Enter");
    await (await chooser).setFiles(file);
  };
  await open();
  const dialog = panel.getByRole("dialog", { name: "Import hook" });
  // La vista previa del código es enfocable para leerla con teclado.
  expect(await tabTo(panel, dialog.getByLabel("Imported hook code"))).toBe(true);
  expect(await tabTo(panel, dialog.getByRole("button", { name: "Cancel" }))).toBe(true);
  await panel.keyboard.press("Enter");
  await expect(dialog).toHaveCount(0);
  await expect(panel.locator(".rule-item")).toHaveCount(0);
  await open();
  expect(await tabTo(panel, dialog.getByRole("button", { name: "Import" }))).toBe(true);
  await panel.keyboard.press("Enter");
  await expect(panel.locator(".rule-item").filter({ hasText: "Importado" })).toBeVisible();
});
