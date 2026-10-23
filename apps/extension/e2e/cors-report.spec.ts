import {
  attachAndReload,
  corsCall,
  openApp,
  openCorsDetail,
  openPanel,
  relaxExtraOrigins,
  relaxIndicator,
  tabIdOf,
} from "./fixtures/panel.ts";
import { expect, test } from "./fixtures/extension.ts";

test("US3: reporte con lo que backend debe configurar, sin valores sensibles, y copiar", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  // No se puede conceder a un origen chrome-extension://: se concede al contexto.
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const app = await openApp(context, servers.appOrigin);
  const tabId = await tabIdOf(nahualWorker, `${servers.appOrigin}/`);
  const panel = await openPanel(context, extensionId, tabId);
  await attachAndReload(panel, app);
  for (const id of [
    "cors-sensitive",
    "cors-header-cred",
    "cors-preflight-401",
    "cors-no-credentials",
  ])
    expect((await corsCall(app, id)).error, id).toContain("Failed to fetch");

  const section = await openCorsDetail(panel, "/cors/sensitive");
  await section.getByRole("button", { name: "Generate report for backend" }).click();
  const dialog = panel.getByRole("dialog", { name: /^Report for backend/ });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".warning")).toContainText("only relaxes CORS in the debugging");
  const text = dialog.getByLabel("Report text");
  for (const expected of [
    servers.appOrigin,
    "  - GET",
    "  - POST",
    "  - PUT",
    "  - authorization",
    "  - x-custom",
    "Credentials: yes",
    "Suggested Access-Control-Max-Age: 600 s",
    "missing Access-Control-Allow-Origin",
    "POST /cors/sensitive",
    "PUT /cors/preflight-401",
    "only relaxes CORS in the debugging",
  ])
    await expect(text).toHaveValue(new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

  await dialog.getByLabel("Configuration example").selectOption({ label: "Express" });
  await expect(text).toHaveValue(/app\.use\(cors\(/);
  const value = await text.inputValue();
  // SC-006: ningún valor sembrado (token en query, Authorization, cookie, body).
  expect(value).not.toMatch(/secret/);
  expect(value).not.toContain("token=");

  await dialog.getByRole("button", { name: "Copy" }).click();
  await expect(dialog).toContainText("Report copied to the clipboard.");
  expect(await panel.evaluate(() => navigator.clipboard.readText())).toBe(value);

  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(dialog).toBeHidden();
});

test("US3-5: sin bloqueos para ese origen ⇒ estado vacío que explica cómo provocarlos", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const app = await openApp(context, servers.appOrigin);
  const tabId = await tabIdOf(nahualWorker, `${servers.appOrigin}/`);
  const panel = await openPanel(context, extensionId, tabId);
  await attachAndReload(panel, app);
  expect(await relaxExtraOrigins(panel, tabId, servers.appOrigin, 1)).toEqual([true]);
  await expect(relaxIndicator(panel)).toBeVisible({ timeout: 5_000 });
  await relaxIndicator(panel).getByRole("button", { name: "Report" }).click();
  const dialog = panel.getByRole("dialog", { name: /^Report for backend/ });
  await expect(dialog).toContainText("No blocked requests for this origin");
  await expect(dialog).toContainText("repeat the failing action");
});
