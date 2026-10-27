import type { Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { expectNoHorizontalScroll, expectNoSeriousViolations } from "./fixtures/axe.ts";
import {
  attachAndReload,
  closeSettings,
  createRule,
  openApp,
  openPanel,
  openSection,
  openSettings,
  tabIdOf,
} from "./fixtures/panel.ts";
import { expect, test } from "./fixtures/extension.ts";

// 007 (SC-012, T067): axe y sin scroll horizontal en el menú de perfil, Ajustes ⇒ Perfiles e
// Importar y exportar, la vista previa de importación (con no soportadas) y la lista de reglas con
// un perfil activo, en claro y oscuro, a 320, 800 y 1280 px; elegir perfil con teclado.

const profileButton = (panel: Page) =>
  panel.getByRole("button", { name: /^This tab's rule profile:/ });
const profileMenu = (panel: Page) => panel.getByRole("menu", { name: "Rule profile" });

async function createProfile(panel: Page, name: string) {
  const dialog = await openSettings(panel, "Profiles");
  await dialog.getByLabel("New profile").fill(name);
  await dialog.getByRole("button", { name: "Create profile" }).click();
  await expect(panel.getByRole("button", { name: `Delete profile: ${name}` })).toBeVisible();
  return dialog;
}

for (const colorScheme of ["light", "dark"] as const) {
  for (const width of [320, 800, 1280]) {
    test(`perfiles e importar: tema ${colorScheme}, ${width} px`, async ({
      context,
      nahualWorker,
      extensionId,
      servers,
    }) => {
      const app = await openApp(context, servers.appOrigin);
      const tabId = await tabIdOf(nahualWorker, `${servers.appOrigin}/`);
      const panel = await openPanel(context, extensionId, tabId);
      await panel.emulateMedia({ colorScheme });
      await panel.setViewportSize({ width, height: 800 });
      await attachAndReload(panel, app);
      await createRule(panel, { name: "Pausar items", pattern: "*/api/items", stage: "response" });

      const profiles = await createProfile(panel, "QA staging");
      await expectNoSeriousViolations(panel, "Ajustes ⇒ Perfiles");
      await expectNoHorizontalScroll(panel);
      const data = await openSettings(panel, "Import and export");
      await expect(data.getByRole("button", { name: "Download" })).toBeVisible();
      await expectNoSeriousViolations(panel, "Ajustes ⇒ Importar y exportar");
      await expectNoHorizontalScroll(panel);
      void profiles;

      // Vista previa con reglas no soportadas.
      const raw = await readFile(
        path.join(import.meta.dirname, "fixtures/requestly-export.json"),
        "utf8",
      );
      await data.locator('input[type="file"][aria-label="Import from Requestly"]').setInputFiles({
        name: "requestly.json",
        mimeType: "application/json",
        buffer: Buffer.from(
          raw.replaceAll("__API__", servers.apiOrigin).replaceAll("__THIRD__", servers.thirdOrigin),
        ),
      });
      const preview = panel.getByRole("dialog", { name: "Import from Requestly" });
      await expect(preview.locator(".import-unsupported")).toBeVisible();
      await expect(preview.getByRole("button", { name: "Import (turned off)" })).toBeEnabled({
        timeout: 15_000,
      });
      await expectNoSeriousViolations(panel, "vista previa de importación");
      await expectNoHorizontalScroll(panel);
      await preview.getByRole("button", { name: "Cancel" }).click();
      await closeSettings(panel);

      // Menú de perfil y lista de reglas con un perfil activo.
      await profileButton(panel).click();
      await expect(profileMenu(panel)).toBeVisible();
      await expectNoSeriousViolations(panel, "menú de perfil");
      await expectNoHorizontalScroll(panel);
      await profileMenu(panel)
        .getByRole("menuitemcheckbox", { name: /^QA staging/ })
        .click();
      await openSection(panel, "Rules");
      await expect(panel.locator(".rule-item")).toContainText("Not active with QA staging");
      await expectNoSeriousViolations(panel, "reglas con perfil activo");
      await expectNoHorizontalScroll(panel);
    });
  }
}

test("elegir perfil solo con teclado: Alt+Shift+O, flechas, Enter y Esc devuelve el foco", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const app = await openApp(context, servers.appOrigin);
  const tabId = await tabIdOf(nahualWorker, `${servers.appOrigin}/`);
  const panel = await openPanel(context, extensionId, tabId);
  await panel.setViewportSize({ width: 1100, height: 800 });
  await attachAndReload(panel, app);
  await createProfile(panel, "QA staging");
  await closeSettings(panel);

  await panel.locator("body").focus();
  await panel.keyboard.press("Alt+Shift+O");
  await expect(profileMenu(panel)).toBeVisible();
  const item = profileMenu(panel).getByRole("menuitemcheckbox", { name: /^QA staging/ });
  for (let i = 0; i < 5 && !(await item.evaluate((el) => el === document.activeElement)); i++)
    await panel.keyboard.press("ArrowDown");
  await expect(item).toBeFocused();
  await panel.keyboard.press("Enter");
  await expect(profileButton(panel)).toHaveAccessibleName("This tab's rule profile: QA staging");

  await panel.keyboard.press("Alt+Shift+O");
  await expect(profileMenu(panel)).toBeVisible();
  await panel.keyboard.press("Escape");
  await expect(profileMenu(panel)).toBeHidden();
  await expect(profileButton(panel)).toBeFocused();
});
