import type { BrowserContext, Worker } from "@playwright/test";
import type { TestServers } from "./fixtures/servers.ts";
import {
  addProductionOrigin,
  attachAndReload,
  blurPanel,
  corsCall,
  notices,
  openApp,
  openCorsDetail,
  openPanel,
  openRelaxedDetail,
  relaxFrom,
  relaxIndicator,
  requestRow,
  tabIdOf,
} from "./fixtures/panel.ts";
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
  return { app, panel };
}

const methodsFor = (servers: TestServers, path: string) =>
  servers.received.filter((r) => r.path === path).map((r) => r.method);

test("SC-001: de bloqueado a funcionando con 2 clics desde el detalle; indicador", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const { app, panel } = await setup({ context, nahualWorker, extensionId, servers });
  expect((await corsCall(app, "cors-none")).error).toContain("Failed to fetch");
  await relaxFrom(panel, "/cors/none");
  expect((await corsCall(app, "cors-none")).status).toBe(200);
  const indicator = relaxIndicator(panel);
  await expect(indicator).toContainText("CORS relaxed");
  await expect(indicator).toContainText(`${servers.appOrigin} → ${servers.apiOrigin}`);
  await expect(indicator).toContainText(/expires in 7:5\d:\d\d/);
  await expect(indicator).toContainText("active");
  const section = await openRelaxedDetail(panel, "/cors/none");
  await expect(section).toContainText("CORS relaxed by Nahual");
  await expect(section.locator(".cors-relaxed")).toContainText(servers.appOrigin);
  await expect(requestRow(panel, "/cors/none").last()).toContainText("CORS relaxed");
});

test("FR-012: preflight 401 llega al servidor y se reemplaza; el detalle lo explica", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const { app, panel } = await setup({ context, nahualWorker, extensionId, servers });
  await corsCall(app, "cors-preflight-401");
  await relaxFrom(panel, "/cors/preflight-401");
  const before = methodsFor(servers, "/cors/preflight-401").length;
  expect((await corsCall(app, "cors-preflight-401")).status).toBe(200);
  expect(methodsFor(servers, "/cors/preflight-401").slice(before)).toEqual(["OPTIONS", "PUT"]);
  const section = await openRelaxedDetail(panel, "/cors/preflight-401");
  await section.getByRole("button", { name: "Go to this request's preflight" }).click();
  await expect(panel.locator(".detail .cors")).toContainText(
    "The server's preflight responded 401 and Nahual replaced it with a local 204.",
  );
});

test("X5: un preflight con redirección funciona al primer intento sin llegar al servidor", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const { app, panel } = await setup({ context, nahualWorker, extensionId, servers });
  await corsCall(app, "cors-preflight-redirect");
  await relaxFrom(panel, "/cors/preflight-redirect");
  const before = methodsFor(servers, "/cors/preflight-redirect").length;
  expect((await corsCall(app, "cors-preflight-redirect")).status).toBe(200);
  expect(methodsFor(servers, "/cors/preflight-redirect").slice(before)).toEqual(["PUT"]);
});

test("SC-005: con credenciales, origen exacto y Allow-Credentials, nunca *", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const { app, panel } = await setup({ context, nahualWorker, extensionId, servers });
  await corsCall(app, "cors-no-credentials");
  await relaxFrom(panel, "/cors/no-credentials", async (form) => {
    await expect(form.getByLabel(/The app sends credentials/)).toBeChecked();
  });
  expect((await corsCall(app, "cors-no-credentials")).status).toBe(200);
  expect((await corsCall(app, "cors-wildcard-credentials")).status).toBe(200);
  for (const path of ["/cors/no-credentials", "/cors/wildcard-credentials"]) {
    const added = (await openRelaxedDetail(panel, path)).locator(".cors-relaxed .headers").first();
    await expect(added).toContainText(servers.appOrigin);
    await expect(added).toContainText("access-control-allow-credentials".replace(/^./, "A"), {
      ignoreCase: true,
    });
    expect(await added.textContent()).not.toMatch(/Allow-Origin\s*\*/i);
  }
});

test("R5: sin cookie, marcar la casilla de credenciales funciona al primer intento", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const { app, panel } = await setup({ context, nahualWorker, extensionId, servers });
  await context.clearCookies();
  expect((await corsCall(app, "cors-none-cred")).error).toContain("Failed to fetch");
  await relaxFrom(panel, "/cors/none", async (form) => {
    const box = form.getByLabel(/The app sends credentials/);
    await expect(box).not.toBeChecked();
    await box.check();
  });
  expect((await corsCall(app, "cors-none-cred")).status).toBe(200);
});

test("Expose-Headers y «el servidor ya responde bien»", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const { app, panel } = await setup({ context, nahualWorker, extensionId, servers });
  expect((await corsCall(app, "cors-ok")).total).toBeNull();
  await corsCall(app, "cors-none");
  await relaxFrom(panel, "/cors/none", async (form) => {
    await form.getByLabel(/Others, comma-separated/).fill("x-total");
  });
  expect((await corsCall(app, "cors-ok")).total).toBe("42");
  const section = await openRelaxedDetail(panel, "/cors/ok");
  await expect(section).toContainText("The server already responds correctly");
});

test("FR-013/FR-020: apagar con Alt+Shift+R y repetir de inmediato vuelve a bloquear", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const { app, panel } = await setup({ context, nahualWorker, extensionId, servers });
  await corsCall(app, "cors-preflight-401");
  await relaxFrom(panel, "/cors/preflight-401");
  expect((await corsCall(app, "cors-preflight-401")).status).toBe(200);
  await blurPanel(panel);
  await panel.keyboard.press("Alt+Shift+R");
  await expect(relaxIndicator(panel)).toHaveCount(0);
  expect((await corsCall(app, "cors-preflight-401")).error).toContain("Failed to fetch");
});

test("FR-025: pausar Nahual suspende la relajación", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const { app, panel } = await setup({ context, nahualWorker, extensionId, servers });
  await corsCall(app, "cors-none");
  await relaxFrom(panel, "/cors/none");
  await blurPanel(panel);
  await panel.keyboard.press("Alt+Shift+P");
  await expect(relaxIndicator(panel)).toContainText("suspended");
  expect((await corsCall(app, "cors-none")).error).toContain("Failed to fetch");
  await panel.keyboard.press("Alt+Shift+P");
  await expect(relaxIndicator(panel)).toContainText("active");
  expect((await corsCall(app, "cors-none")).status).toBe(200);
});

test("US2-7, FR-029/030: orígenes de producción bloquean y terminan relajaciones", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const { app, panel } = await setup({ context, nahualWorker, extensionId, servers });
  await corsCall(app, "cors-none");
  await relaxFrom(panel, "/cors/none");
  await addProductionOrigin(panel, servers.apiOrigin);
  await expect(relaxIndicator(panel)).toHaveCount(0);
  await expect(notices(panel)).toContainText("marked as production");
  expect((await corsCall(app, "cors-none")).error).toContain("Failed to fetch");
  const section = await openCorsDetail(panel, "/cors/none");
  await expect(section).toContainText(
    `Cannot be relaxed: ${servers.apiOrigin} is in your list of production origins.`,
  );
  await expect(section.getByRole("button", { name: "Allow CORS for development" })).toHaveCount(0);
});
