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
