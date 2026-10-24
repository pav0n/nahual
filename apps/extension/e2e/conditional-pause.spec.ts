import type { BrowserContext, Page, Worker } from "@playwright/test";
import {
  attachAndReload,
  attachOrReconnect,
  callApi,
  createRule,
  openApp,
  openPanel,
  openQueue,
  openSection,
  pausedEditor,
  pausedOption,
  setPauseTimeout,
  tabIdOf,
} from "./fixtures/panel.ts";
import type { ReceivedRequest, TestServers } from "./fixtures/servers.ts";
import { expect, test } from "./fixtures/extension.ts";

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
  return { app, panel, tabId };
}

const status500 = { kind: "Status", op: "≥", fields: { Value: "500" } };

/** Llama a la API sin esperar: la llamada queda pausada. */
const start = (app: Page, id: string) => callApi(app, id);

async function expectNotPaused(panel: Page, app: Page, id: string, path: string) {
  const result = await start(app, id);
  expect(result.status).toBeDefined();
  await openQueue(panel);
  await expect(pausedOption(panel, path)).toHaveCount(0);
  return result;
}

const lastReceived = (servers: TestServers, path: string): ReceivedRequest | undefined =>
  servers.received.filter((r) => r.path === path).at(-1);

test("US2-1/2: la regla persiste al reabrir el panel y no aplica en otro sitio", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const { app, panel, tabId } = await setup({ context, nahualWorker, extensionId, servers });
  await createRule(panel, {
    name: "Errores",
    pattern: "*/api/*",
    stage: "response",
    conditions: [status500],
  });
  await panel.close();

  const reopened = await openPanel(context, extensionId, tabId);
  // El panel anterior se cerró con la sesión: el indicador ofrece reconectar.
  await attachOrReconnect(reopened);
  await openSection(reopened, "Rules");
  await expect(reopened.locator(".rule-item").filter({ hasText: "Errores" })).toBeVisible();

  // Otro sitio: la página inspeccionada pasa al origen de la API.
  await app.goto(`${servers.apiOrigin}/data`);
  await expect(reopened.getByText(`Site: ${servers.apiOrigin}`)).toBeVisible();
  await expect(reopened.getByText("Rules for other sites (1)")).toBeVisible();
  const status = await app.evaluate(async () => (await fetch("/api/error")).status);
  expect(status).toBe(500);
  await openQueue(reopened);
  await expect(reopened.locator(".queue").getByRole("option")).toHaveCount(0);
});

test("US2-3: status ≥ 500 pausa el 500 y deja pasar el 200 sin pausa", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const fx = { context, nahualWorker, extensionId, servers };
  const { app, panel } = await setup(fx);
  await createRule(panel, {
    name: "Errores",
    pattern: "*/api/*",
    stage: "response",
    conditions: [status500],
  });
  await expectNotPaused(panel, app, "items", "/api/items");
  const error = start(app, "error");
  await openQueue(panel);
  await expect(pausedOption(panel, "/api/error")).toContainText("Status 500");
  await pausedEditor(panel).getByRole("button", { name: "Continue unchanged" }).click();
  expect((await error).status).toBe(500);
});

test("US2-4: JSONPath $.items está vacío", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const fx = { context, nahualWorker, extensionId, servers };
  const { app, panel } = await setup(fx);
  await createRule(panel, {
    name: "Vacíos",
    pattern: "*/api/*",
    stage: "response",
    conditions: [{ kind: "Body JSONPath", op: "is empty", fields: { JSONPath: "$.items" } }],
  });
  await expectNotPaused(panel, app, "items", "/api/items");
  const empty = start(app, "empty");
  await expect(pausedOption(panel, "/api/empty")).toBeVisible();
  await pausedEditor(panel).getByRole("button", { name: "Continue unchanged" }).click();
  expect((await empty).status).toBe(200);
});

test("US2-5: GraphQL operationName = GetUser con errors", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const fx = { context, nahualWorker, extensionId, servers };
  const { app, panel } = await setup(fx);
  await createRule(panel, {
    name: "GetUser con errores",
    pattern: "*/graphql*",
    stage: "response",
    conditions: [
      { kind: "GraphQL operationName", op: "equals", fields: { Value: "GetUser" } },
      { kind: "GraphQL errors", selects: { "GraphQL response": "Has errors" } },
    ],
  });
  await expectNotPaused(panel, app, "graphql-user", "/graphql");
  await expectNotPaused(panel, app, "graphql-list", "/graphql");
  const errors = start(app, "graphql-user-errors");
  await expect(pausedOption(panel, "/graphql?errors=1")).toBeVisible();
  await pausedEditor(panel).getByRole("button", { name: "Continue unchanged" }).click();
  expect((await errors).status).toBe(200);
});

test("US2-6/7: Request pausado antes de salir; se edita método, URL, headers y body", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const fx = { context, nahualWorker, extensionId, servers };
  const { app, panel } = await setup(fx);
  await createRule(panel, {
    name: "POST JSON",
    pattern: "*/echo*",
    stage: "request",
    conditions: [
      { kind: "Method", checks: ["POST"] },
      { kind: "Header", op: "contains", fields: { "Header name": "content-type", Value: "json" } },
    ],
  });
  const posts = () =>
    servers.received.filter((r) => r.path === "/echo" && r.method === "POST").length;
  const before = posts();
  const response = start(app, "echo");
  await openQueue(panel);
  await expect(pausedOption(panel, "/echo")).toBeVisible();
  // Antes de salir a la red: el servidor todavía no lo vio.
  expect(posts()).toBe(before);

  const editor = pausedEditor(panel);
  await editor.getByLabel("Method").fill("PUT");
  await editor.getByLabel("URL").fill(`${servers.apiOrigin}/echo?edited=1`);
  await editor.getByRole("button", { name: "Add header" }).click();
  await editor
    .getByLabel(/^Header name \d+$/)
    .last()
    .fill("x-nahual");
  await editor.getByLabel("Value of x-nahual").fill("edited");
  await editor.getByLabel("Request body").fill('{"edited":true}');
  await editor.getByRole("button", { name: "Continue with changes" }).click();
  expect((await response).status).toBe(200);

  const received = lastReceived(servers, "/echo");
  expect(received).toMatchObject({ method: "PUT", url: "/echo?edited=1", body: '{"edited":true}' });
  expect(received?.headers["x-nahual"]).toBe("edited");
  // La Cookie enmascarada que no se tocó viaja con su valor real (FR-004b).
  expect(received?.headers.cookie).toContain("nahual_session=secret-session-value");
});

test("US2-8: Response editada (status y body) sobre un body comprimido", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const fx = { context, nahualWorker, extensionId, servers };
  const { app, panel } = await setup(fx);
  await createRule(panel, { name: "Gzip", pattern: "*/gzip", stage: "response" });
  const response = start(app, "gzip");
  await openQueue(panel);
  await expect(pausedOption(panel, "/gzip")).toBeVisible();
  const editor = pausedEditor(panel);
  await expect(editor.getByLabel("Response body")).toHaveValue(/"compressed":true/);
  await editor.getByLabel("Status").fill("201");
  await editor.getByLabel("Response body").fill('{"ok":true}');
  await editor.getByRole("button", { name: "Continue with changes" }).click();
  const result = await response;
  expect(result.status).toBe(201);
  expect(result.body).toBe('{"ok":true}');
});

test("US2-9/10: cuenta regresiva, timeout y tres pausas resueltas en otro orden", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const fx = { context, nahualWorker, extensionId, servers };
  const { app, panel } = await setup(fx);
  await createRule(panel, { name: "Todo /api", pattern: "*/api/*", stage: "response" });
  const calls = {
    items: start(app, "items"),
    empty: start(app, "empty"),
    error: start(app, "error"),
  };
  await openQueue(panel);
  const options = panel.locator(".queue").getByRole("option");
  await expect(options).toHaveCount(3);
  await expect(options.first()).toContainText("Continues automatically in");

  await pausedOption(panel, "/api/empty").click();
  await pausedEditor(panel).getByRole("button", { name: "Continue unchanged" }).click();
  expect((await calls.empty).status).toBe(200);
  await expect(options).toHaveCount(2);
  await pausedOption(panel, "/api/error").click();
  await pausedEditor(panel).getByRole("button", { name: "Continue unchanged" }).click();
  expect((await calls.error).status).toBe(500);
  await pausedEditor(panel).getByRole("button", { name: "Continue unchanged" }).click();
  expect((await calls.items).status).toBe(200);

  await setPauseTimeout(panel, 5);
  const timed = start(app, "items");
  await expect(pausedOption(panel, "/api/items")).toContainText("Continues automatically in 5 s");
  expect((await timed).status).toBe(200);
  await expect(options).toHaveCount(0);
  await openSection(panel, "Traffic");
  await panel.locator(".grid-row").filter({ hasText: "/api/items" }).last().click();
  await expect(panel.locator(".detail")).toContainText("continued after timeout");
});

test("US2-12: una regex inválida se rechaza al guardar con el campo señalado", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const fx = { context, nahualWorker, extensionId, servers };
  const { panel } = await setup(fx);
  await panel.bringToFront();
  await openSection(panel, "Rules");
  await panel.getByRole("button", { name: "Create your first rule" }).click();
  const editor = panel.locator(".editor");
  await editor.getByLabel("Name", { exact: true }).fill("Mala");
  await editor.getByLabel("Prefilter type").selectOption("regex");
  await editor.getByLabel("URL prefilter").fill("([a-z");
  await editor.getByRole("button", { name: "Save rule" }).click();
  await expect(editor.getByLabel("URL prefilter")).toHaveAttribute("aria-invalid", "true");
  await expect(editor).toContainText("The regex is not valid");
  await expect(editor.getByLabel("URL prefilter")).toBeFocused();
  await editor.getByRole("button", { name: "Cancel" }).click();
  await expect(panel.getByText("No rules yet")).toBeVisible();
});

test("FR-024: Continuar todos con una edición pendiente pide confirmación", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const fx = { context, nahualWorker, extensionId, servers };
  const { app, panel } = await setup(fx);
  await createRule(panel, { name: "Todo /api", pattern: "*/api/*", stage: "response" });
  const first = start(app, "items");
  const second = start(app, "empty");
  await openQueue(panel);
  await expect(panel.locator(".queue").getByRole("option")).toHaveCount(2);
  await pausedEditor(panel).getByLabel("Status").fill("299");

  await panel.getByRole("button", { name: /^Continue all/ }).click();
  const dialog = panel.getByRole("dialog", { name: "Continue all unchanged?" });
  await expect(dialog).toContainText("There are 1 unapplied edits");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(panel.locator(".queue").getByRole("option")).toHaveCount(2);

  await panel.keyboard.press("Alt+Shift+K");
  await dialog.getByRole("button", { name: "Continue all" }).click();
  expect((await first).status).toBe(200);
  expect((await second).status).toBe(200);
  await expect(panel.getByText("Nothing is paused")).toBeVisible();
});

test("research R7: cambiar la URL a otro origen en etapa Request", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const fx = { context, nahualWorker, extensionId, servers };
  const { app, panel } = await setup(fx);
  await createRule(panel, { name: "Echo", pattern: "*/echo*", stage: "request" });
  const response = start(app, "echo");
  await openQueue(panel);
  await expect(pausedOption(panel, "/echo")).toBeVisible();
  // Mismo servidor HTTP, otro origen: el puerto de la SPA no sirve /echo (404).
  await pausedEditor(panel).getByLabel("URL").fill(`${servers.appOrigin}/echo`);
  await pausedEditor(panel).getByRole("button", { name: "Continue with changes" }).click();
  const result = await response;
  console.log(
    `[R7] URL a otro origen: ${JSON.stringify({ status: result.status, error: result.error })}`,
  );
  test.info().annotations.push({ type: "R7", description: JSON.stringify(result) });
  // Lo que importa para la spec: la página no queda colgada y recibe una respuesta o un error.
  expect(result.status !== undefined || result.error !== undefined).toBe(true);
});
