import type { BrowserContext, Page, Worker } from "@playwright/test";
import {
  appFetch,
  attachAndReload,
  hookExecutions,
  installHook,
  openApp,
  openPanel,
  openSection,
  tabIdOf,
  trafficRow,
} from "./fixtures/panel.ts";
import type { TestServers } from "./fixtures/servers.ts";
import { expect, test } from "./fixtures/extension.ts";

// 006 US1: escribir un hook (FR-001 a FR-019, SC-004, SC-005, SC-010).

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

const items = (s: TestServers) => `${s.apiOrigin}/hooks/items`;

/** Abre el editor de una regla nueva con la acción "Modificar con hook". */
async function newHookRule(panel: Page) {
  await openSection(panel, "Rules");
  await panel
    .getByRole("button", { name: /Create your first rule|New rule/ })
    .first()
    .click();
  await panel.getByLabel("Action", { exact: true }).selectOption("hook");
  await expect(panel.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });
}

/** Escribe en el editor de código, reemplazando todo (una sola entrada de texto). */
async function typeCode(panel: Page, code: string) {
  await panel.locator(".cm-content").click();
  await panel.keyboard.press("Control+A");
  await panel.keyboard.press("Delete");
  await panel.keyboard.insertText(code);
}

test("US1-1/2/3: editor con ejemplo, autocompletado y un error de tipo que bloquea la activación; carga diferida", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const fx = { context, nahualWorker, extensionId, servers };
  const { panel } = await setup(fx);
  const requested: string[] = [];
  panel.on("request", (request) => requested.push(request.url()));
  const loaded = () => requested.some((url) => /HookEditor|hook-types\.worker/.test(url));
  await openSection(panel, "Rules");
  expect(loaded()).toBe(false); // FR-019: el panel no carga el editor de entrada.
  await newHookRule(panel);
  await expect.poll(loaded).toBe(true);
  await expect(panel.locator(".cm-content")).toContainText("export default (ctx: HookContext)");
  await expect(panel.getByRole("status").filter({ hasText: "No problems." })).toBeVisible();

  // Autocompletado de ctx. dentro del hook (SC-005: < 1 s tras escribir).
  await typeCode(panel, "export default (ctx: HookContext) => {\n  ctx.\n};");
  await panel.locator(".cm-line").nth(1).click();
  await panel.keyboard.press("End");
  await panel.keyboard.press("Control+Space");
  const options = panel.locator(".cm-tooltip-autocomplete li");
  await expect(options.filter({ hasText: "respond" })).toBeVisible({ timeout: 1_000 });
  await expect(options.filter({ hasText: "state" })).toBeVisible();
  await panel.keyboard.press("Escape");

  // Error de tipo: la línea y el aviso de que se guarda desactivada.
  await typeCode(
    panel,
    'export default (ctx: HookContext) => {\n  if (ctx.response) ctx.response.status = "x";\n};',
  );
  await expect(panel.getByText(/Line 2: Type 'string' is not assignable/)).toBeVisible();
  await expect(panel.getByText("With errors, the rule is saved disabled")).toBeVisible();
  await panel.getByLabel("Name").fill("Con error");
  await panel.getByLabel("URL prefilter").fill("*/hooks/items*");
  await panel.getByRole("button", { name: "Save rule" }).click();
  const item = panel.locator(".rule-item").filter({ hasText: "Con error" });
  await expect(item.getByRole("switch")).not.toBeChecked();
  await expect(item.getByRole("switch")).toBeDisabled();
  await expect(item.getByText(/Cannot enable it/)).toBeVisible();
});

test("US1-5, US1-9, US1-14: plantilla 'Cambiar un campo del JSON' con la UI; la pestaña Hooks lo muestra (SC-004)", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const fx = { context, nahualWorker, extensionId, servers };
  const { app, panel } = await setup(fx);
  await newHookRule(panel);
  await panel.getByRole("button", { name: "Templates" }).click();
  await panel.getByRole("menuitem", { name: "Change a JSON field" }).click();
  // La plantilla vacía el prefiltro: hay que completarlo (FR-017).
  await expect(panel.getByLabel("URL prefilter")).toHaveValue("");
  await expect(panel.getByLabel("Stage")).toHaveValue("response");
  await panel.getByLabel("Name").fill("Estado error");
  await panel.getByLabel("URL prefilter").fill("*/hooks/items*");
  await expect(panel.getByRole("status").filter({ hasText: "No problems." })).toBeVisible();
  await panel.getByRole("button", { name: "Save rule" }).click();
  await expect(
    panel.locator(".rule-item").filter({ hasText: "Estado error" }).getByRole("switch"),
  ).toBeChecked();

  const response = await appFetch(app, items(fx.servers));
  expect(JSON.parse(response.body)).toEqual({ status: "error", items: [1, 2, 3] });

  await openSection(panel, "Traffic");
  await trafficRow(panel, "/hooks/items").last().click();
  await panel.locator(".detail").getByRole("tab", { name: "Hooks" }).click();
  const tab = panel.locator(".hooks-tab");
  await expect(tab.getByRole("cell", { name: "Estado error" })).toBeVisible();
  await expect(tab.getByText("modified by hook")).toBeVisible();
  await expect(tab.getByRole("cell", { name: "body" })).toBeVisible();
  await expect(tab.getByText(/Chain: 1 hooks/)).toBeVisible();
});

test("US1-4: plantilla 'Agregar header' en etapa Request: el servidor recibe el header", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const fx = { context, nahualWorker, extensionId, servers };
  const { app, panel } = await setup(fx);
  await newHookRule(panel);
  await panel.getByRole("button", { name: "Templates" }).click();
  await panel.getByRole("menuitem", { name: "Add header" }).click();
  await expect(panel.getByLabel("Stage")).toHaveValue("request");
  await panel.getByLabel("Name").fill("Header");
  await panel.getByLabel("URL prefilter").fill("*/echo*");
  await expect(panel.getByRole("status").filter({ hasText: "No problems." })).toBeVisible();
  // Ctrl+S guarda desde el editor, como en Sources.
  await panel.locator(".cm-content").click();
  await panel.keyboard.press("Control+s");
  await expect(panel.locator(".rule-item").filter({ hasText: "Header" })).toBeVisible();
  const echo = JSON.parse((await appFetch(app, `${fx.servers.apiOrigin}/echo`)).body) as {
    headers: Record<string, string>;
  };
  expect(echo.headers["x-debug"]).toBe("nahual");
});

test("US1-6/7/8: sin retorno no cambia nada; asíncrono se aplica; state sigue tras recargar", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const fx = { context, nahualWorker, extensionId, servers };
  const { app, panel } = await setup(fx);
  await installHook(panel, {
    name: "Nada",
    stage: "response",
    prefilter: "*/hooks/items*",
    source: `export default (ctx) => { ctx.log("visto"); };`,
  });
  expect(JSON.parse((await appFetch(app, items(fx.servers))).body)).toEqual({
    status: "ok",
    items: [1, 2, 3],
  });
  await expect
    .poll(async () => (await hookExecutions(panel)).at(-1)?.result)
    .toBe("hook_unchanged");

  await installHook(panel, {
    name: "Async y contador",
    stage: "request",
    prefilter: "*/echo*",
    source: `export default async (ctx: HookContext) => {
  await new Promise((r) => setTimeout(r, 50));
  ctx.state.n = ((ctx.state.n as number) ?? 0) + 1;
  ctx.setHeader("x-count", String(ctx.state.n));
  return ctx;
};`,
  });
  const count = async () =>
    (
      JSON.parse((await appFetch(app, `${fx.servers.apiOrigin}/echo`)).body) as {
        headers: Record<string, string>;
      }
    ).headers["x-count"];
  expect(await count()).toBe("1");
  expect(await count()).toBe("2");
  await app.reload(); // FR-008: recargar no vacía state.
  expect(await count()).toBe("3");
});

test("US1-10: dos hooks en cadena, en orden de prioridad", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const fx = { context, nahualWorker, extensionId, servers };
  const { app, panel } = await setup(fx);
  await installHook(panel, {
    name: "Primero",
    stage: "response",
    prefilter: "*/hooks/items*",
    source: `export default (ctx) => { const d = ctx.json(); d.items = [9]; ctx.response.body = JSON.stringify(d); return ctx; };`,
  });
  await installHook(panel, {
    name: "Segundo",
    stage: "response",
    prefilter: "*/hooks/items*",
    source: `export default (ctx) => { const d = ctx.json(); d.seen = d.items.length; ctx.response.body = JSON.stringify(d); return ctx; };`,
  });
  expect(JSON.parse((await appFetch(app, items(fx.servers))).body)).toEqual({
    status: "ok",
    items: [9],
    seen: 1,
  });
  await expect
    .poll(async () => (await hookExecutions(panel)).map((e) => e.ruleName))
    .toEqual(["Primero", "Segundo"]);
});

test("US1-11, SC-010: cambiar el destino sin permiso falla; con permiso va al nuevo destino", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const fx = { context, nahualWorker, extensionId, servers };
  const { app, panel } = await setup(fx);
  const redirect = (allowed: boolean) =>
    installHook(panel, {
      name: allowed ? "Redirige con permiso" : "Redirige",
      stage: "request",
      prefilter: "*/hooks/items*",
      source: `export default (ctx) => { ctx.request.url = ${JSON.stringify(`${fx.servers.thirdOrigin}/leak?via=hook`)}; return ctx; };`,
      permissions: { changeDestination: allowed },
    });
  await redirect(false);
  expect((await appFetch(app, items(fx.servers))).status).toBe(200);
  await expect
    .poll(async () => (await hookExecutions(panel)).at(-1))
    .toMatchObject({
      result: "hook_failed",
      errorType: "invalid_result",
      message: "hook_error_destination",
    });
  expect(fx.servers.leaks).toEqual([]);

  // Otra regla con el permiso; se desactiva la primera.
  await openSection(panel, "Rules");
  await panel.locator(".rule-item").filter({ hasText: "Redirige" }).getByRole("switch").uncheck();
  await redirect(true);
  await appFetch(app, items(fx.servers)).catch(() => undefined);
  await expect.poll(() => fx.servers.leaks.length).toBeGreaterThan(0);
  expect(fx.servers.leaks[0]?.url).toBe("/leak?via=hook");
  await openSection(panel, "Traffic");
  await trafficRow(panel, "/hooks/items").last().click();
  await expect(
    panel.locator(".detail").getByText(/Destination: .*hooks\/items → .*leak\?via=hook/),
  ).toBeVisible();
});

test("US1-12: respond en etapa Request responde sin llegar al servidor", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const fx = { context, nahualWorker, extensionId, servers };
  const { app, panel } = await setup(fx);
  await installHook(panel, {
    name: "Backend falso",
    stage: "request",
    prefilter: "*/hooks/items*",
    source: `export default (ctx) => { ctx.respond({ status: 200, body: { fake: true, id: Number(new URL(ctx.request.url).searchParams.get("id")) } }); };`,
  });
  const before = fx.servers.received.length;
  const response = await appFetch(app, `${items(fx.servers)}?id=7`);
  expect(JSON.parse(response.body)).toEqual({ fake: true, id: 7 });
  expect(fx.servers.received.filter((r) => r.path === "/hooks/items").length).toBe(0);
  expect(fx.servers.received.length).toBe(before);
});

test("US1-13, SC-011: sin permiso el hook ve los valores sensibles enmascarados", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const fx = { context, nahualWorker, extensionId, servers };
  const { app, panel } = await setup(fx);
  await installHook(panel, {
    name: "Lee token",
    stage: "request",
    prefilter: "*/echo*",
    source: `export default (ctx) => { ctx.log("auth", ctx.request.headers.authorization); ctx.setHeader("x-seen", ctx.request.headers.authorization); return ctx; };`,
  });
  const echo = JSON.parse(
    (
      await appFetch(app, `${fx.servers.apiOrigin}/echo`, {
        headers: { authorization: "Bearer secreto-real" },
      })
    ).body,
  ) as { headers: Record<string, string> };
  // El valor real sale al servidor (la máscara intacta lo conserva) pero el hook nunca lo vio.
  expect(echo.headers.authorization).toBe("Bearer secreto-real");
  expect(echo.headers["x-seen"]).not.toContain("secreto");
  await expect
    .poll(async () => (await hookExecutions(panel)).at(-1)?.logs)
    .toEqual(["auth ••••••"]);
});
