import type { BrowserContext, Worker } from "@playwright/test";
import type { TestServers } from "./fixtures/servers.ts";
import {
  attachAndReload,
  corsCall,
  openApp,
  openCorsDetail,
  openPanel,
  openSection,
  requestRow,
  tabIdOf,
  trafficGrid,
  trafficRow,
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

const BLOCKED = "Blocked by CORS";

/** Cada ruta del fixture con la causa que debe explicar el detalle (SC-004). */
const CASES: [id: string, path: string, cause: RegExp][] = [
  ["cors-none", "/cors/none", /did not send Access-Control-Allow-Origin/],
  ["cors-mismatch", "/cors/mismatch", /allows a different origin/],
  ["cors-preflight-401", "/cors/preflight-401", /responded with a non-2xx status/],
  ["cors-preflight-redirect", "/cors/preflight-redirect", /responded with a redirect/],
  ["cors-method", "/cors/method", /does not allow the DELETE method/],
  ["cors-header", "/cors/header", /does not allow the x-custom header/],
  [
    "cors-wildcard-credentials",
    "/cors/wildcard-credentials",
    /Access-Control-Allow-Origin: \* and the request carries credentials/,
  ],
  [
    "cors-no-credentials",
    "/cors/no-credentials",
    /did not send Access-Control-Allow-Credentials: true/,
  ],
];

test("US1-1/2, SC-004: cada causa se marca y se explica; /cors/ok no", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const fx = { context, nahualWorker, extensionId, servers };
  const { app, panel } = await setup(fx);
  for (const [id, path, cause] of CASES) {
    const result = await corsCall(app, id);
    expect(result.error, id).toContain("Failed to fetch");
    await expect(requestRow(panel, path).last()).toContainText(BLOCKED);
    const section = await openCorsDetail(panel, path);
    await expect(section.locator(".cors-cause"), id).toContainText(cause);
    await expect(section).not.toContainText("Unrecognized cause");
  }
  expect((await corsCall(app, "cors-ok")).status).toBe(200);
  await expect(requestRow(panel, "/cors/ok").last()).not.toContainText(BLOCKED);
});

test("US1-3: qué pidió la app y qué respondió el servidor, con la diferencia", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const fx = { context, nahualWorker, extensionId, servers };
  const { app, panel } = await setup(fx);
  await corsCall(app, "cors-header-cred");
  const section = await openCorsDetail(panel, "/cors/header");
  await expect(section).toContainText(fx.servers.appOrigin);
  await expect(section).toContainText("x-custom");
  // Bloqueado en el preflight: el request real nunca salió y no hay cookie que ver (R5).
  await expect(section.locator("dt", { hasText: /^Credentials$/ }).locator("..")).toContainText(
    "not detected",
  );
  await expect(section.locator(".cors-diff")).toContainText("Access-Control-Allow-Headers");

  await corsCall(app, "cors-mismatch");
  const mismatch = await openCorsDetail(panel, "/cors/mismatch");
  await expect(mismatch.locator(".cors-diff")).toContainText(fx.servers.appOrigin);
  await expect(mismatch.locator(".cors-diff")).toContainText("https://otro.example");

  await corsCall(app, "cors-no-credentials");
  const credentials = await openCorsDetail(panel, "/cors/no-credentials");
  await expect(credentials.locator("dt", { hasText: /^Credentials$/ }).locator("..")).toContainText(
    "yes",
  );
});

test("US1-6: el request y su preflight se relacionan en ambos sentidos", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const fx = { context, nahualWorker, extensionId, servers };
  const { app, panel } = await setup(fx);
  await corsCall(app, "cors-preflight-401");
  const section = await openCorsDetail(panel, "/cors/preflight-401");
  await expect(section).toContainText("401");
  await section.getByRole("button", { name: "Go to this request's preflight" }).click();
  await expect(panel.locator(".detail h2")).toContainText("OPTIONS");
  await panel
    .locator(".detail .cors")
    .getByRole("button", { name: "Go to this preflight's request" })
    .click();
  await expect(panel.locator(".detail h2")).toContainText("PUT");
});

test("US1-5: un request fallado por una regla de 002 no se marca como CORS", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const fx = { context, nahualWorker, extensionId, servers };
  const { app, panel } = await setup(fx);
  await openSection(panel, "Rules");
  await panel.getByRole("button", { name: /^(Create your first rule|New rule)$/ }).click();
  const editor = panel.locator(".editor");
  await editor.getByLabel("Name", { exact: true }).fill("Fallar blocked");
  await editor.getByLabel("URL prefilter").fill("*/blocked*");
  await editor.getByLabel("Stage").selectOption("request");
  await editor.getByLabel("Action").selectOption("fail");
  await editor.getByRole("button", { name: "Save rule" }).click();
  await expect(panel.locator(".rule-item").filter({ hasText: "Fallar blocked" })).toBeVisible();
  await openSection(panel, "Traffic");
  expect((await corsCall(app, "blocked")).error).toContain("Failed to fetch");
  await expect(trafficRow(panel, "/blocked").last()).toContainText("Failed");
  await expect(trafficRow(panel, "/blocked").last()).not.toContainText(BLOCKED);
});

test("FR-002: el filtro CORS aísla los bloqueados; nada de tráfico modificado", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const fx = { context, nahualWorker, extensionId, servers };
  const { app, panel } = await setup(fx);
  await corsCall(app, "cors-none");
  await corsCall(app, "cors-ok");
  await expect(requestRow(panel, "/cors/none").last()).toContainText(BLOCKED);
  await panel.locator(".filters").getByLabel(/^CORS/).selectOption("blocked");
  const rows = trafficGrid(panel).getByRole("row");
  await expect(rows.filter({ hasText: "/cors/ok" })).toHaveCount(0);
  await expect(rows.filter({ hasText: "/cors/none" })).not.toHaveCount(0);
  for (const text of await rows.allTextContents()) {
    if (text.includes("/cors/")) expect(text).toContain(BLOCKED);
  }
  // Sin relajación, el servidor recibió los requests tal cual (sin preflight inventado).
  expect(fx.servers.received.filter((r) => r.path === "/cors/none").map((r) => r.method)).toEqual([
    "GET",
  ]);
});
