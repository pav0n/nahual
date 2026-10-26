import {
  addProductionOrigin,
  appFetch,
  attachAndReload,
  callApi,
  corsCall,
  createRule,
  hookExecutions,
  installHook,
  openApp,
  openPanel,
  openQueue,
  pausedEditor,
  pausedOption,
  relaxFrom,
  repeater,
  repeaterMode,
  repeaterOutputTab,
  repeaterResult,
  repeaterSend,
  sendToRepeater,
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

// 005 SC-005a (FR-020a, contracts/storage.md): el repeater no deja requests, respuestas, headers
// ni bodies en ningún almacenamiento; los ignorados solo guardan rutas bajo un hash.
test("el repeater no guarda requests, respuestas ni valores en ningún almacenamiento", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const app = await openApp(context, servers.appOrigin);
  const tabId = await tabIdOf(nahualWorker, `${servers.appOrigin}/`);
  const panel = await openPanel(context, extensionId, tabId);
  await panel.setViewportSize({ width: 1300, height: 900 });
  await attachAndReload(panel, app);
  await app.evaluate(async (u) => {
    await (await fetch(u, { credentials: "include" })).text();
  }, `${servers.apiOrigin}/diff/a`);
  await sendToRepeater(panel, trafficRow(panel, "/diff/a"));
  const r = repeater(panel);
  await r
    .getByLabel("URL", { exact: true })
    .fill(`${servers.apiOrigin}/diff/b?token=secret-query-xyz`);
  await r.getByRole("button", { name: "Add header" }).click();
  await r
    .getByLabel(/^Header name \d+$/)
    .last()
    .fill("Authorization");
  await r.getByLabel("Value of Authorization").last().fill("Bearer secret-auth-xyz");
  await repeaterSend(panel);
  await repeaterMode(panel, "Clean context").click();
  await repeaterSend(panel);
  await repeaterOutputTab(panel, "History");
  await r.getByRole("button", { name: "Paste expected response" }).click();
  await r.getByLabel("Pasted response (JSON or text)").fill('{"access_token":"secret-pasted-xyz"}');
  await r.getByRole("button", { name: "Use this response" }).click();
  await r.getByRole("button", { name: "Compare with original" }).click();
  await panel
    .locator(".diff-view .diff-change")
    .filter({ hasText: "$.meta.timestamp" })
    .getByRole("button", { name: "Ignore this path" })
    .click();
  await panel.waitForTimeout(400);

  const secrets = [
    "secret-query-xyz",
    "secret-auth-xyz",
    "secret-pasted-xyz",
    "secret-token-a",
    "secret-token-b",
    "secret-cookie-a",
    "secret-session-value",
    servers.apiOrigin,
    "/diff/",
  ];
  const local = await nahualWorker.evaluate(() => chrome.storage.local.get(null));
  const session = await nahualWorker.evaluate(() => chrome.storage.session.get(null));
  expect(Object.keys(local).sort()).toEqual(["nahual.repeater.ignores.v1", "nahual.settings.v1"]);
  const ignores = local["nahual.repeater.ignores.v1"] as { endpoints: Record<string, unknown> };
  for (const key of Object.keys(ignores.endpoints)) expect(key).toMatch(/^[0-9a-f]{64}$/);
  expect(JSON.stringify(ignores)).toContain("timestamp");
  const page = await panel.evaluate(async () => ({
    local: Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)])),
    session: Object.fromEntries(
      Object.keys(sessionStorage).map((k) => [k, sessionStorage.getItem(k)]),
    ),
    databases: (await indexedDB.databases()).map((d) => d.name),
  }));
  // Solo las preferencias de interfaz, si el dev movió algún divisor.
  for (const key of Object.keys(page.local)) expect(key).toBe("nahual.ui.v1");
  expect(page.databases).toEqual([]);
  for (const stored of [local, session, page.local, page.session]) {
    const text = JSON.stringify(stored);
    for (const secret of secrets) expect(text, secret).not.toContain(secret);
  }
});

// 005 SC-005b (FR-011a): el acceso a un origen solo se pide al pulsar Enviar en contexto limpio, y
// siempre para un solo origen exacto.
test("el acceso a un origen solo se pide al enviar en contexto limpio, para ese origen", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const app = await openApp(context, servers.appOrigin);
  const tabId = await tabIdOf(nahualWorker, `${servers.appOrigin}/`);
  const panel = await openPanel(context, extensionId, tabId);
  await panel.setViewportSize({ width: 1300, height: 900 });
  await attachAndReload(panel, app);
  await panel.evaluate(() =>
    (
      window as unknown as { __nahualPermissionsSpy: { install(a: boolean): void } }
    ).__nahualPermissionsSpy.install(false),
  );
  const calls = () =>
    panel.evaluate(
      () =>
        (window as unknown as { __nahualPermissionsSpy: { calls: string[] } })
          .__nahualPermissionsSpy.calls,
    );
  await callApi(app, "items");
  await sendToRepeater(panel, trafficRow(panel, "/api/items"));
  const r = repeater(panel);
  // Contexto de página: no pide nada.
  await repeaterSend(panel);
  // Cambiar de modo y escribir la URL tampoco.
  const localhost = servers.apiOrigin.replace("127.0.0.1", "localhost");
  await repeaterMode(panel, "Clean context").click();
  await r.getByLabel("URL", { exact: true }).fill(`${localhost}/no-cors?x=1`);
  expect(await calls()).toEqual([]);
  const before = servers.received.length;
  await repeaterSend(panel);
  expect(await calls()).toEqual([localhost]);
  await expect(repeaterResult(panel)).toContainText(`Access to ${localhost} was not granted`);
  expect(servers.received.slice(before).filter((x) => x.path === "/no-cors")).toEqual([]);
});

// 006 contracts/storage.md: los hooks no dejan en ningún almacenamiento lo que registran, lo que
// guardan en `state` ni los headers sensibles que leen; `nahual.rules.v1` solo suma la acción.
test("los hooks no guardan registros, state ni valores sensibles en ningún almacenamiento", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const app = await openApp(context, servers.appOrigin);
  const tabId = await tabIdOf(nahualWorker, `${servers.appOrigin}/`);
  const panel = await openPanel(context, extensionId, tabId);
  await attachAndReload(panel, app);
  await installHook(panel, {
    name: "Guarda token",
    stage: "request",
    prefilter: "*/echo*",
    permissions: { readSensitive: true },
    source: `export default (ctx) => {
  ctx.state.auth = ctx.request.headers["authorization"];
  ctx.state.url = ctx.request.url;
  ctx.log(ctx.request.headers, ctx.request.url);
};`,
  });
  await appFetch(app, `${servers.apiOrigin}/echo?token=secret-hook-query`, {
    headers: { authorization: "Bearer secret-hook-auth" },
  });
  await expect.poll(async () => (await hookExecutions(panel)).length).toBe(1);
  const drawer = panel.getByRole("region", { name: "Hooks console" });
  await drawer.getByRole("button", { name: /^Expand/ }).click();
  await drawer.getByRole("button", { name: "Show sensitive values" }).click();
  await expect(drawer.locator(".console-row").first()).toContainText("secret-hook-auth");
  await panel.waitForTimeout(400);

  const local = await nahualWorker.evaluate(() => chrome.storage.local.get(null));
  const session = await nahualWorker.evaluate(() => chrome.storage.session.get(null));
  expect(Object.keys(local).sort()).toEqual(["nahual.rules.v1", "nahual.settings.v1"]);
  const rules = (local["nahual.rules.v1"] as { rules: { action: Record<string, unknown> }[] })
    .rules;
  expect(rules.map((r) => r.action.kind)).toEqual(["hook"]);
  expect(Object.keys(rules[0]?.action ?? {}).sort()).toEqual([
    "check",
    "imported",
    "kind",
    "permissions",
    "source",
  ]);
  const page = await panel.evaluate(async () => ({
    local: Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)])),
    session: Object.fromEntries(
      Object.keys(sessionStorage).map((k) => [k, sessionStorage.getItem(k)]),
    ),
    databases: (await indexedDB.databases()).map((d) => d.name),
  }));
  for (const key of Object.keys(page.local)) expect(key).toBe("nahual.ui.v1");
  expect(page.databases).toEqual([]);
  for (const stored of [local, session, page.local, page.session]) {
    const text = JSON.stringify(stored);
    for (const secret of [
      "secret-hook-auth",
      "secret-hook-query",
      "secret-session-value",
      servers.apiOrigin,
    ])
      expect(text, secret).not.toContain(secret);
  }
});
