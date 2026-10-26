import type { BrowserContext, Page, Worker } from "@playwright/test";
import {
  attachAndReload,
  callApi,
  closeSettings,
  createRule,
  openApp,
  openPanel,
  openSection,
  openSettings,
  sectionTab,
  tabIdOf,
} from "./fixtures/panel.ts";
import type { TestServers } from "./fixtures/servers.ts";
import { expect, test } from "./fixtures/extension.ts";

// 007 US3: perfiles de reglas (FR-019 a FR-025, SC-006; quickstart 10–13).

interface Fx {
  context: BrowserContext;
  nahualWorker: Worker;
  extensionId: string;
  servers: TestServers;
}

const profileButton = (panel: Page) =>
  panel.getByRole("button", { name: /^This tab's rule profile:/ });
const profileMenu = (panel: Page) => panel.getByRole("menu", { name: "Rule profile" });
const ruleItem = (panel: Page, name: string) =>
  panel.locator(".rule-item").filter({ hasText: name });

async function attachedPanel({ context, nahualWorker, extensionId, servers }: Fx, path = "/") {
  const app = path === "/" ? await openApp(context, servers.appOrigin) : await context.newPage();
  if (path !== "/") await app.goto(`${servers.appOrigin}${path}`);
  const tabId = await tabIdOf(nahualWorker, `${servers.appOrigin}${path}`);
  const panel = await openPanel(context, extensionId, tabId);
  await panel.setViewportSize({ width: 1100, height: 800 });
  await attachAndReload(panel, app);
  return { app, panel, tabId };
}

async function createProfile(panel: Page, name: string) {
  const dialog = await openSettings(panel, "Profiles");
  await dialog.getByLabel("New profile").fill(name);
  await dialog.getByRole("button", { name: "Create profile" }).click();
  await expect(dialog.getByLabel("New profile")).toHaveValue("");
  await expect(
    dialog.getByRole("textbox", { name: "Profile name" }).filter({ hasText: "" }),
  ).not.toHaveCount(0);
  await expect(panel.getByRole("button", { name: `Delete profile: ${name}` })).toBeVisible();
}

async function assignProfile(panel: Page, rule: string, profile: string) {
  await openSection(panel, "Rules");
  await ruleItem(panel, rule)
    .getByRole("button", { name: `Assign profiles: ${rule}` })
    .click();
  await panel.getByRole("menuitemcheckbox", { name: profile }).click();
  await expect(ruleItem(panel, rule).locator(".profile-tag")).toHaveText([profile]);
}

async function chooseProfile(panel: Page, name: string) {
  await profileButton(panel).click();
  await profileMenu(panel)
    .getByRole("menuitemcheckbox", { name: new RegExp(`^${name}`) })
    .click();
}

/** Las reglas pausan respuestas: la API responde solo si ninguna regla del perfil la pausa. */
async function setupRules(panel: Page) {
  await createRule(panel, { name: "Pausar items", pattern: "*/api/items", stage: "response" });
  await createRule(panel, { name: "Pausar empty", pattern: "*/api/empty", stage: "response" });
}

test("US3-1/2/3/5, SC-006: crear perfiles, asignar reglas y activar uno con el menú o Alt+Shift+O", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const fx = { context, nahualWorker, extensionId, servers };
  const { app, panel } = await attachedPanel(fx);
  await setupRules(panel);
  await createProfile(panel, "QA staging");
  await createProfile(panel, "Bug 1234");
  await closeSettings(panel);
  await assignProfile(panel, "Pausar empty", "QA staging");

  await expect(profileButton(panel)).toHaveAccessibleName("This tab's rule profile: All rules");
  await expect(sectionTab(panel, "Rules")).toContainText("2");

  // Un clic tras abrir el selector (SC-006).
  await chooseProfile(panel, "QA staging");
  await expect(profileButton(panel)).toHaveAccessibleName("This tab's rule profile: QA staging");
  await expect(profileButton(panel)).toContainText("Profile: QA staging");
  await expect(sectionTab(panel, "Rules")).toContainText("1");
  await expect(ruleItem(panel, "Pausar items")).toContainText("Not active with QA staging");
  await expect(ruleItem(panel, "Pausar empty")).not.toContainText("Not active with");

  // La regla de fuera del perfil ya no pausa: la API responde.
  expect((await callApi(app, "items")).status).toBe(200);

  // Con el atajo: "Bug 1234" no tiene reglas y lo dice.
  await panel.locator("body").focus();
  await panel.keyboard.press("Alt+Shift+O");
  await expect(profileMenu(panel)).toBeVisible();
  await expect(
    profileMenu(panel).getByRole("menuitemcheckbox", { name: "Bug 1234 (no rules)" }),
  ).toBeVisible();
  await profileMenu(panel).getByRole("menuitemcheckbox", { name: "All rules" }).click();
  await expect(profileButton(panel)).toHaveAccessibleName("This tab's rule profile: All rules");
  await expect(sectionTab(panel, "Rules")).toContainText("2");
});

test("US3-4, FR-022: dos pestañas del mismo sitio son independientes y la pestaña nueva recuerda el último", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const fx = { context, nahualWorker, extensionId, servers };
  const first = await attachedPanel(fx);
  await createProfile(first.panel, "QA staging");
  await closeSettings(first.panel);
  await chooseProfile(first.panel, "QA staging");
  await expect(profileButton(first.panel)).toContainText("Profile: QA staging");

  // Otra pestaña del sitio abre con el último perfil elegido; cambiarlo no toca la primera.
  const second = await attachedPanel(fx, "/next");
  await expect(profileButton(second.panel)).toContainText("Profile: QA staging");
  await chooseProfile(second.panel, "All rules");
  await expect(profileButton(second.panel)).toContainText("All rules");
  await expect(profileButton(first.panel)).toContainText("Profile: QA staging");
});

test("Edge cases: eliminar el perfil activo avisa y vuelve a todas las reglas; deshacer recupera el perfil", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const fx = { context, nahualWorker, extensionId, servers };
  const { panel } = await attachedPanel(fx);
  await createProfile(panel, "QA staging");
  await closeSettings(panel);
  await chooseProfile(panel, "QA staging");

  const dialog = await openSettings(panel, "Profiles");
  await dialog.getByRole("button", { name: "Delete profile: QA staging" }).click();
  await expect(dialog.getByText("No profiles")).toBeVisible();
  await expect(panel.getByText(/^The active profile was deleted/)).toBeVisible();
  await expect(profileButton(panel)).toContainText("All rules");
  await panel.getByRole("button", { name: "Undo" }).click();
  await expect(dialog.getByRole("textbox", { name: "Profile name" })).toHaveValue("QA staging");
  // Deshacer recupera el perfil, no la selección.
  await expect(profileButton(panel)).toContainText("All rules");
});

test("FR-021: a 320 px el selector queda como icono con nombre accesible", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const fx = { context, nahualWorker, extensionId, servers };
  const { panel } = await attachedPanel(fx);
  await panel.setViewportSize({ width: 320, height: 700 });
  await expect(profileButton(panel)).toBeVisible();
  await expect(profileButton(panel)).toHaveAccessibleName("This tab's rule profile: All rules");
});
