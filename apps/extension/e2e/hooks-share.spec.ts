import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { BrowserContext, Page, Worker } from "@playwright/test";
import ts from "typescript";
import {
  appFetch,
  attachAndReload,
  hookExecutions,
  installHook,
  openApp,
  openPanel,
  openSection,
  tabIdOf,
} from "./fixtures/panel.ts";
import type { TestServers } from "./fixtures/servers.ts";
import { expect, test } from "./fixtures/extension.ts";

// 006 US3: compartir hooks (FR-035 a FR-039, SC-006).

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
  await panel.setViewportSize({ width: 1280, height: 900 });
  await attachAndReload(panel, app);
  return { app, panel };
}

const ITEMS = { status: "ok", items: [1, 2, 3] };
const dir = () => mkdtempSync(path.join(tmpdir(), "nahual-share-"));

async function openEditor(panel: Page, name: string) {
  await openSection(panel, "Rules");
  await panel.getByRole("button", { name: `Edit rule “${name}”` }).click();
  await expect(panel.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });
}

async function importFile(panel: Page, file: string) {
  await openSection(panel, "Rules");
  await panel.getByLabel("Import hook…").setInputFiles(file);
}

test("US3-1/2/3, SC-006: exportar, borrar e importar; vista previa, desactivada y sin permisos; activada funciona igual", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const fx = { context, nahualWorker, extensionId, servers };
  const { app, panel } = await setup(fx);
  await installHook(panel, {
    name: "Lista vacía",
    stage: "response",
    prefilter: "*/hooks/items*",
    permissions: { changeDestination: true, readSensitive: true },
    source: `export default (ctx: HookContext) => {\n  const d = ctx.json<{ items: unknown[] }>();\n  d.items = [];\n  ctx.response!.body = JSON.stringify(d);\n  return ctx;\n};\n`,
  });
  await openEditor(panel, "Lista vacía");
  const download = panel.waitForEvent("download");
  await panel.getByRole("button", { name: "Export hook" }).click();
  const file = path.join(dir(), (await download).suggestedFilename());
  await (await download).saveAs(file);
  const text = readFileSync(file, "utf8");
  expect(path.basename(file)).toBe("Lista-vac-a.ts");
  expect(text.startsWith("/* @nahual-hook 1\n")).toBe(true);
  expect(text).toContain(String.raw`"*\/hooks/items*"`);
  expect(text).toContain("d.items = [];");
  for (const field of ["permissions", "readSensitive", "site", "check", "enabled"])
    expect(text).not.toContain(field);

  // Borrar la regla e importar el archivo.
  await panel.getByRole("button", { name: "Cancel" }).click();
  await panel.getByRole("button", { name: "Delete rule “Lista vacía”" }).click();
  await expect(panel.locator(".rule-item")).toHaveCount(0);
  await importFile(panel, file);
  const dialog = panel.getByRole("dialog", { name: "Import hook" });
  await expect(dialog.getByText("It will be saved as a new, disabled rule.")).toBeVisible();
  await expect(dialog.locator(".import-config")).toContainText("*/hooks/items*");
  await expect(dialog.getByLabel("Imported hook code")).toContainText("d.items = [];");
  await dialog.getByRole("button", { name: "Import" }).click();
  const item = panel.locator(".rule-item").filter({ hasText: "Lista vacía" });
  await expect(item.getByText("imported")).toBeVisible();
  await expect(item.getByRole("switch")).not.toBeChecked();

  // SC-006: 0 ejecuciones antes de activarla.
  expect(JSON.parse((await appFetch(app, `${servers.apiOrigin}/hooks/items`)).body)).toEqual(ITEMS);
  expect(await hookExecutions(panel)).toEqual([]);

  // Sin permisos tras importar; al abrirla, el editor la comprueba y se puede activar.
  await openEditor(panel, "Lista vacía");
  await expect(
    panel.getByRole("checkbox", { name: /can change the request's destination/ }),
  ).not.toBeChecked();
  await expect(
    panel.getByRole("checkbox", { name: /can read sensitive values/ }),
  ).not.toBeChecked();
  await expect(panel.getByRole("status").filter({ hasText: "No problems." })).toBeVisible();
  await panel.getByRole("button", { name: "Save rule" }).click();
  await item.getByRole("switch").check();
  expect(JSON.parse((await appFetch(app, `${servers.apiOrigin}/hooks/items`)).body)).toEqual({
    status: "ok",
    items: [],
  });
});

test("US3-4/5: sin configuración se importa solo el código; > 100 KB y binario se rechazan; con errores no se activa", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const fx = { context, nahualWorker, extensionId, servers };
  const { panel } = await setup(fx);
  const folder = dir();
  const plain = path.join(folder, "solo-codigo.ts");
  writeFileSync(
    plain,
    `export default (ctx: HookContext) => {\n  ctx.response.status = "x";\n};\n`,
  );
  const big = path.join(folder, "grande.ts");
  writeFileSync(big, `// ${"x".repeat(110_000)}`);
  const binary = path.join(folder, "binario.ts");
  writeFileSync(binary, Buffer.from([0xff, 0xfe, 0x00, 0xc3, 0x28]));

  await importFile(panel, big);
  await expect(panel.getByText(/The file is over 100\.0 kB/)).toBeVisible();
  await importFile(panel, binary);
  await expect(panel.getByText(/The file is not UTF-8 text/)).toBeVisible();
  await expect(panel.getByRole("dialog")).toHaveCount(0);

  await importFile(panel, plain);
  const dialog = panel.getByRole("dialog", { name: "Import hook" });
  await expect(dialog.getByText(/The file has no configuration/)).toBeVisible();
  await dialog.getByRole("button", { name: "Import" }).click();
  const item = panel.locator(".rule-item").filter({ hasText: "Imported hook" });
  await expect(item).toBeVisible();
  // Abrirla la comprueba: con errores sigue sin poder activarse.
  await openEditor(panel, "Imported hook");
  await expect(panel.getByText(/Line 2: /).first()).toBeVisible();
  await panel.getByRole("button", { name: "Save rule" }).click();
  await expect(item.getByRole("switch")).toBeDisabled();
});

test("US3-7: los tipos descargados dan autocompletado y tipos a un hook en el editor del dev", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const fx = { context, nahualWorker, extensionId, servers };
  const { panel } = await setup(fx);
  await openSection(panel, "Rules");
  await panel
    .getByRole("button", { name: /Create your first rule|New rule/ })
    .first()
    .click();
  await panel.getByLabel("Action", { exact: true }).selectOption("hook");
  await expect(panel.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });
  const download = panel.waitForEvent("download");
  await panel.getByRole("button", { name: "Download types" }).click();
  const folder = dir();
  const dts = path.join(folder, (await download).suggestedFilename());
  await (await download).saveAs(dts);
  expect(path.basename(dts)).toBe("nahual-hooks.d.ts");
  const hook = path.join(folder, "hook.ts");
  writeFileSync(
    hook,
    `import type { HookContext } from "./nahual-hooks";\nexport default (ctx: HookContext) => { ctx.setHeader("a", "b"); return ctx; };\n`,
  );
  const bad = path.join(folder, "bad.ts");
  writeFileSync(
    bad,
    `import type { HookContext } from "./nahual-hooks";\nexport default (ctx: HookContext) => { ctx.nope(); };\n`,
  );
  const compile = (file: string) =>
    ts.getPreEmitDiagnostics(
      ts.createProgram([file, dts], {
        lib: ["lib.es2022.d.ts"],
        types: [],
        strict: true,
        noEmit: true,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        module: ts.ModuleKind.ESNext,
      }),
    ).length;
  expect(compile(hook)).toBe(0);
  expect(compile(bad)).toBeGreaterThan(0);
});
