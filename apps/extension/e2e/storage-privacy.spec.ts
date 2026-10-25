import {
  addProductionOrigin,
  attachAndReload,
  callApi,
  corsCall,
  createRule,
  openApp,
  openPanel,
  openQueue,
  pausedEditor,
  pausedOption,
  relaxFrom,
  tabIdOf,
  trafficRow,
} from "./fixtures/panel.ts";
import { expect, test } from "./fixtures/extension.ts";

// FR-033, contracts/storage.md: tras una sesión con tráfico, pausas y mocks, storage.local solo
// guarda reglas y ajustes, sin URLs capturadas, headers ni bodies.
test("storage.local no contiene datos de tráfico tras una sesión completa", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const app = await openApp(context, servers.appOrigin);
  const tabId = await tabIdOf(nahualWorker, `${servers.appOrigin}/`);
  const panel = await openPanel(context, extensionId, tabId);
  await attachAndReload(panel, app);
  for (const id of ["items", "empty", "echo", "gzip"]) await callApi(app, id);

  await createRule(panel, {
    name: "Errores",
    pattern: "*/api/*",
    stage: "response",
    conditions: [{ kind: "Status", op: "≥", fields: { Value: "500" } }],
  });
  const error = callApi(app, "error");
  await openQueue(panel);
  await expect(pausedOption(panel, "/api/error")).toBeVisible();
  await pausedEditor(panel).getByLabel("Response body").fill('{"secret-edit":true}');
  await pausedEditor(panel).getByRole("button", { name: "Continue with changes" }).click();
  await error;

  const stored = await nahualWorker.evaluate(() => chrome.storage.local.get(null));
  expect(Object.keys(stored).sort()).toEqual(["nahual.rules.v1", "nahual.settings.v1"]);
  const text = JSON.stringify(stored);
  for (const leaked of [
    servers.apiOrigin,
    "/api/items",
    "secret-session-value",
    "secret-edit",
    "compressed",
    "hello",
  ]) {
    expect(text).not.toContain(leaked);
  }
  // La regla sí está, con su prefiltro (lo escribió el dev, no es tráfico capturado).
  expect(text).toContain("*/api/*");
  expect(await nahualWorker.evaluate(() => chrome.storage.session.get(null))).not.toHaveProperty(
    "nahual.history",
  );
});

// FR-017, contracts/storage.md (003): ninguna relajación se guarda en storage.local ni en
// storage.session; los ajustes de CORS sí.
test("las relajaciones CORS nunca se guardan", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const app = await openApp(context, servers.appOrigin);
  const tabId = await tabIdOf(nahualWorker, `${servers.appOrigin}/`);
  const panel = await openPanel(context, extensionId, tabId);
  await attachAndReload(panel, app);
  await corsCall(app, "cors-none");
  await relaxFrom(panel, "/cors/none");
  expect((await corsCall(app, "cors-none")).status).toBe(200);
  await addProductionOrigin(panel, "https://*.empresa.com");

  const local = await nahualWorker.evaluate(() => chrome.storage.local.get(null));
  expect(
    Object.keys(local).every((k) => ["nahual.rules.v1", "nahual.settings.v1"].includes(k)),
  ).toBe(true);
  const localText = JSON.stringify(local);
  expect(localText).toContain("https://*.empresa.com");
  for (const leaked of [servers.apiOrigin, "/cors/none", "expiresAt", "relax"])
    expect(localText).not.toContain(leaked);

  const session = await nahualWorker.evaluate(() => chrome.storage.session.get(null));
  expect(Object.keys(session)).toEqual(["nahual.sessions"]);
  expect(JSON.stringify(session)).not.toContain(servers.apiOrigin);
});

// 004 contracts/storage.md: tras una sesión completa con el panel rediseñado, storage.local sigue
// igual y el localStorage del panel solo tiene `nahual.ui.v1` con los campos de UiPrefs.
test("las preferencias de interfaz no guardan datos de tráfico", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const app = await openApp(context, servers.appOrigin);
  const tabId = await tabIdOf(nahualWorker, `${servers.appOrigin}/`);
  const panel = await openPanel(context, extensionId, tabId);
  await attachAndReload(panel, app);
  for (const id of ["items", "empty"]) await callApi(app, id);
  await trafficRow(panel, "/api/items").click();
  const divider = panel.getByRole("separator", { name: /divider/i });
  await divider.focus();
  await panel.keyboard.press("ArrowLeft");
  await createRule(panel, { name: "Datos", pattern: "*/data*", stage: "request" });
  await panel.waitForTimeout(400);

  const local = await nahualWorker.evaluate(() => chrome.storage.local.get(null));
  expect(Object.keys(local).sort()).toEqual(["nahual.rules.v1", "nahual.settings.v1"]);
  const prefs = await panel.evaluate(() =>
    Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)])),
  );
  expect(Object.keys(prefs)).toEqual(["nahual.ui.v1"]);
  const parsed = JSON.parse(prefs["nahual.ui.v1"] ?? "{}") as Record<string, unknown>;
  expect(Object.keys(parsed).sort()).toEqual(["drawerHeight", "split", "version"]);
  expect(Object.keys(parsed.split as object).sort()).toEqual([
    "paused",
    "repeater",
    "rules",
    "traffic",
  ]);
  for (const leaked of [servers.apiOrigin, servers.appOrigin, "/api/items", "Datos"])
    expect(prefs["nahual.ui.v1"]).not.toContain(leaked);
});
