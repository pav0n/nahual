import type { BrowserContext, Page, Worker } from "@playwright/test";
import {
  appFetch,
  sessionAction,
  statusOf,
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

// 006 US2: fallar de forma segura (FR-020 a FR-030; SC-003, SC-008, SC-012, SC-013, SC-014).

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
  return { app, panel, tabId };
}

const ITEMS = { status: "ok", items: [1, 2, 3] };
const items = (s: TestServers) => `${s.apiOrigin}/hooks/items`;

/** Pide /hooks/items y mide cuánto tarda la página en recibirlo. */
async function timedItems(app: Page, servers: TestServers) {
  const started = Date.now();
  const response = await appFetch(app, items(servers));
  return { body: JSON.parse(response.body) as unknown, ms: Date.now() - started };
}

const hook = (
  panel: Page,
  name: string,
  source: string,
  stage: "request" | "response" = "response",
) => installHook(panel, { name, stage, prefilter: "*/hooks/items*", source });

const consoleRegion = (panel: Page) => panel.getByRole("region", { name: "Hooks console" });

test("US2-1/2, SC-008: excepción con su línea y resultado inválido con su campo; la página recibe lo original", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const fx = { context, nahualWorker, extensionId, servers };
  const { app, panel } = await setup(fx);
  await hook(
    panel,
    "Lanza",
    `export default (ctx) => {\n  const x = 1;\n  throw new Error("roto " + x);\n};`,
  );
  const started = Date.now();
  expect((await timedItems(app, servers)).body).toEqual(ITEMS);
  await expect
    .poll(async () => (await hookExecutions(panel)).at(-1))
    .toMatchObject({ result: "hook_failed", errorType: "exception", message: "roto 1", line: 3 });
  expect(Date.now() - started).toBeLessThan(5_000);

  // El error está en la consola en menos de 1 s, con tipo, mensaje, línea, regla y request.
  await panel.getByRole("button", { name: /unread hook errors/ }).click();
  const row = consoleRegion(panel).locator(".console-row[data-level=error]").first();
  await expect(row).toContainText("Exception: roto 1 · line 3", { timeout: 1_000 });
  await expect(row.getByRole("button", { name: "Lanza · GET /hooks/items" })).toBeVisible();
  // El contador desaparece al ver la consola.
  await expect(panel.getByRole("button", { name: /unread hook errors/ })).toHaveCount(0);

  await openSection(panel, "Rules");
  await panel.locator(".rule-item").filter({ hasText: "Lanza" }).getByRole("switch").uncheck();
  await hook(
    panel,
    "Status 999",
    `export default (ctx) => { ctx.response.status = 999; return ctx; };`,
  );
  expect((await timedItems(app, servers)).body).toEqual(ITEMS);
  await expect
    .poll(async () => (await hookExecutions(panel)).at(-1))
    .toMatchObject({ result: "hook_failed", errorType: "invalid_result" });

  // Enlace de la consola ⇒ el request en Tráfico, en su pestaña Hooks.
  await row.getByRole("button", { name: "Lanza · GET /hooks/items" }).click();
  await expect(
    panel.locator(".detail").getByRole("tab", { name: "Hooks", selected: true }),
  ).toBeVisible();
});

test("US2-3, SC-003: un hook de 5 s y un bucle infinito se cortan; la página recibe lo original en ≤ 2,5 s", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const fx = { context, nahualWorker, extensionId, servers };
  const { app, panel } = await setup(fx);
  await hook(
    panel,
    "Lento",
    `export default async (ctx) => { await new Promise((r) => setTimeout(r, 5000)); return ctx; };`,
  );
  const slow = await timedItems(app, servers);
  expect(slow.body).toEqual(ITEMS);
  expect(slow.ms).toBeLessThan(2_500);
  await expect.poll(async () => (await hookExecutions(panel)).at(-1)?.errorType).toBe("timeout");

  await openSection(panel, "Rules");
  await panel.locator(".rule-item").filter({ hasText: "Lento" }).getByRole("switch").uncheck();
  await hook(panel, "Bucle", `export default () => { while (true) {} };`);
  const loop = await timedItems(app, servers);
  expect(loop.body).toEqual(ITEMS);
  expect(loop.ms).toBeLessThan(2_500);
  // El siguiente request también se procesa con normalidad.
  const next = await timedItems(app, servers);
  expect(next.body).toEqual(ITEMS);
  expect(next.ms).toBeLessThan(2_500);
});

test("SC-013: tras 5 errores seguidos el hook se suspende y la página deja de esperar; Reanudar lo vuelve a ejecutar", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  test.setTimeout(90_000);
  const fx = { context, nahualWorker, extensionId, servers };
  const { app, panel } = await setup(fx);
  await hook(panel, "Siempre falla", `export default () => { while (true) {} };`);
  for (let i = 0; i < 5; i++) await timedItems(app, servers);
  await expect(
    panel.getByText("Hook “Siempre falla” was suspended after 5 errors in a row."),
  ).toBeVisible();
  const after = await timedItems(app, servers);
  expect(after.body).toEqual(ITEMS);
  expect(after.ms).toBeLessThan(1_000);
  await expect
    .poll(async () => (await hookExecutions(panel)).at(-1)?.result)
    .toBe("hook_skipped_suspended");
  await openSection(panel, "Rules");
  const item = panel.locator(".rule-item").filter({ hasText: "Siempre falla" });
  await expect(item.getByText("suspended", { exact: true })).toBeVisible();
  await item.getByRole("button", { name: "Resume" }).click();
  await expect(item.getByText("suspended", { exact: true })).toHaveCount(0);
  await timedItems(app, servers);
  await expect.poll(async () => (await hookExecutions(panel)).at(-1)?.errorType).toBe("timeout");
});

test("US2-4, FR-023, SC-012: state se descarta tras un error y 20 requests simultáneos dejan el contador en 20", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const fx = { context, nahualWorker, extensionId, servers };
  const { app, panel } = await setup(fx);
  await installHook(panel, {
    name: "Contador",
    stage: "request",
    prefilter: "*/echo*",
    source: `export default (ctx) => {
  ctx.state.n = (ctx.state.n ?? 0) + 1;
  if (ctx.request.headers["x-custom"]) throw new Error("falla");
  ctx.setHeader("x-n", String(ctx.state.n));
  return ctx;
};`,
  });
  const echo = (headers: Record<string, string> = {}) =>
    appFetch(app, `${servers.apiOrigin}/echo`, { headers }).then(
      (r) => (JSON.parse(r.body) as { headers: Record<string, string> }).headers["x-n"],
    );
  expect(await echo()).toBe("1");
  await echo({ "x-custom": "1" }); // incrementa y falla: no se guarda
  expect(await echo()).toBe("2");

  await app.evaluate(async (url) => {
    await Promise.all(Array.from({ length: 20 }, () => fetch(url, { credentials: "include" })));
  }, `${servers.apiOrigin}/echo`);
  expect(await echo()).toBe("23");
});

test("US2-5/6, SC-014, FR-008/FR-026: consola con registros redactados, contador, limpiar y vaciar estado con deshacer", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const fx = { context, nahualWorker, extensionId, servers };
  const { app, panel } = await setup(fx);
  await installHook(panel, {
    name: "Registra",
    stage: "request",
    prefilter: "*/echo*",
    permissions: { readSensitive: true },
    source: `export default (ctx) => {
  ctx.state.visto = true;
  ctx.log({ access_token: "tok-123" }, ctx.request.headers, "https://a.test/x?token=sec-9");
};`,
  });
  await appFetch(app, `${servers.apiOrigin}/echo`, {
    headers: { authorization: "Bearer auth-77" },
  });
  // La consola aparece (hay hooks) plegada, como en DevTools; se despliega.
  const drawer = consoleRegion(panel);
  await drawer.getByRole("button", { name: /^Expand/ }).click();
  const row = drawer.locator(".console-row[data-level=log]").first();
  await expect(row).toBeVisible();
  for (const secret of ["tok-123", "auth-77", "sec-9"]) await expect(row).not.toContainText(secret);
  await expect(row).toContainText('"access_token":"••••••"');
  await drawer.getByRole("button", { name: "Show sensitive values" }).click();
  for (const secret of ["tok-123", "auth-77", "sec-9"]) await expect(row).toContainText(secret);
  // El registro también está en la pestaña Hooks, redactado.
  await expect.poll(async () => (await hookExecutions(panel)).at(-1)?.logs[0]).toContain("••••••");

  // Limpiar consola y deshacer.
  await drawer.getByRole("button", { name: "Clear console" }).click();
  await expect(drawer.locator(".console-row")).toHaveCount(0);
  await panel.getByRole("button", { name: "Undo" }).click();
  await expect(drawer.locator(".console-row")).toHaveCount(1);

  // Vaciar estado y deshacer.
  await drawer.getByRole("button", { name: "Clear state" }).click();
  await expect(panel.getByText("Hooks' shared state cleared.")).toBeVisible();
  await panel.getByRole("button", { name: "Undo" }).click();
});

test("US2-7: con 'pausar Nahual' los hooks no se ejecutan", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const fx = { context, nahualWorker, extensionId, servers };
  const { app, panel } = await setup(fx);
  await hook(panel, "Cambia", `export default (ctx) => { ctx.response.body = "{}"; return ctx; };`);
  await panel.getByRole("switch", { name: "Pause Nahual" }).click();
  expect((await timedItems(app, servers)).body).toEqual(ITEMS);
  expect(await hookExecutions(panel)).toEqual([]);
});

test("R2: con un hook activo al abrir el panel, la primera ejecución no agota su tiempo (precalentado)", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const fx = { context, nahualWorker, extensionId, servers };
  const { app, panel, tabId } = await setup(fx);
  await hook(panel, "Rápido", `export default (ctx) => ctx;`);
  await panel.close();
  const reopened = await openPanel(context, extensionId, tabId);
  // Tras cerrar el panel, la sesión ofrece "Reconectar".
  await sessionAction(reopened, /^(Reconnect|Attach(?! and))/);
  await expect(statusOf(reopened)).toContainText("Attached");
  expect((await timedItems(app, servers)).body).toEqual(ITEMS);
  await expect
    .poll(async () => (await hookExecutions(reopened)).at(-1)?.result)
    .toBe("hook_unchanged");
});
