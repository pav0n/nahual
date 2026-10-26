import type { Locator, Page } from "@playwright/test";
import { test as base, expect } from "../fixtures/extension.ts";
import {
  appFetch,
  attachAndReload,
  installHook,
  callApi,
  closeSettings,
  corsCall,
  createRule,
  openPanel,
  openQueue,
  openSection,
  openSettings,
  relaxFrom,
  requestRow,
  tabIdOf,
  trafficRow,
  type SettingsSection,
} from "../fixtures/panel.ts";
import { startServers, type TestServers } from "../fixtures/servers.ts";

// 004 research R14: capturas de referencia por plataforma de las vistas principales, en claro y
// oscuro a 320, 800 y 1280 px. `pnpm --filter @nahual/extension e2e:visual`; con
// `--update-snapshots` se regeneran (y se revisan a mano antes de guardarlas).

/** Puertos fijos: las URLs del tráfico salen en las capturas. */
const test = base.extend<{ servers: TestServers }>({
  // eslint-disable-next-line no-empty-pattern -- Playwright exige desestructurar los fixtures.
  servers: async ({}, use) => {
    const servers = await startServers({ app: 47101, api: 47102, third: 47103 });
    await use(servers);
    await servers.close();
  },
});

const WIDTHS = [320, 800, 1280] as const;
const THEMES = ["light", "dark"] as const;

/** Lo que cambia en cada ejecución (tiempos, cuentas regresivas, fechas) se tapa. */
const dynamic = (panel: Page): Locator[] => [
  panel.locator(".cell-time"),
  panel.locator(".summary"),
  panel.locator(".countdown"),
  panel.locator(".toasts"),
  panel.locator(".headers-editor"),
  panel.locator(".header-item").filter({ hasText: /^(date|keep-alive)/i }),
  // 005: horas, duraciones y headers que cambian en cada envío.
  panel.locator(".send-summary"),
  panel.locator(".history-select"),
  panel.locator(".diff-side select"),
  panel.locator(".diff-change").filter({ hasText: /Header (date|keep-alive)/ }),
  panel.locator(".diff-summary strong"),
  // 006: duraciones de los hooks.
  panel.locator(".timing-table .num"),
  panel.locator(".hooks-tab > section > p.muted"),
  panel.locator(".hook-error-counter"),
];

async function shoot(panel: Page, name: string) {
  // Un aviso de un paso anterior (dura 10 s) cambiaría el alto según el tiempo de la corrida.
  await expect(panel.locator(".toast")).toHaveCount(0, { timeout: 15_000 });
  for (const width of WIDTHS) {
    await panel.setViewportSize({ width, height: 640 });
    await expect(panel).toHaveScreenshot(`${name}-${width}.png`, {
      mask: dynamic(panel),
      animations: "disabled",
      caret: "hide",
    });
  }
}

for (const theme of THEMES) {
  test(`vistas principales, tema ${theme}`, async ({
    context,
    nahualWorker,
    extensionId,
    servers,
  }) => {
    test.setTimeout(180_000);
    const app = await context.newPage();
    await app.goto(`${servers.appOrigin}/`);
    const tabId = await tabIdOf(nahualWorker, `${servers.appOrigin}/`);
    const panel = await openPanel(context, extensionId, tabId);
    await panel.emulateMedia({ colorScheme: theme });
    await attachAndReload(panel, app);
    await callApi(app, "items");
    await callApi(app, "empty");

    // Tráfico con detalle (pestaña Response: body estable).
    await trafficRow(panel, "/api/items").click();
    await panel.locator(".detail").getByRole("tab", { name: "Response" }).click();
    await expect(panel.locator(".detail").getByLabel("Response body")).toBeVisible();
    await shoot(panel, `${theme}-traffic-detail`);

    // Menú contextual y menú de sesión.
    await trafficRow(panel, "/api/empty").click({ button: "right" });
    await expect(panel.getByRole("menu")).toBeVisible();
    await shoot(panel, `${theme}-context-menu`);
    await panel.keyboard.press("Escape");
    await panel.getByRole("button", { name: /^Session/ }).click();
    await expect(panel.getByRole("menu")).toBeVisible();
    await shoot(panel, `${theme}-session-menu`);
    await panel.keyboard.press("Escape");

    // CORS relajado.
    await corsCall(app, "cors-none");
    await relaxFrom(panel, "/cors/none");
    await requestRow(panel, "/cors/none").last().click();
    await shoot(panel, `${theme}-cors-relaxed`);
    await panel.keyboard.press("Alt+Shift+R");

    // Reglas, pausado en Tráfico y Pausados.
    await createRule(panel, {
      name: "Errores",
      pattern: "*/api/*",
      stage: "response",
      conditions: [{ kind: "Status", op: "≥", fields: { Value: "500" } }],
    });
    await shoot(panel, `${theme}-rules`);
    const error = callApi(app, "error");
    await openSection(panel, "Traffic");
    await trafficRow(panel, "/api/error").last().click();
    await expect(panel.locator(".detail").getByRole("tab", { name: "Edit" })).toBeVisible();
    await shoot(panel, `${theme}-paused-in-traffic`);
    await openQueue(panel);
    await shoot(panel, `${theme}-paused`);
    await panel.keyboard.press("Alt+Shift+K");
    await error;

    // Ajustes, cada sección.
    for (const section of ["General", "Pauses", "Development CORS", "Shortcuts"] as const) {
      await openSettings(panel, section as SettingsSection);
      await shoot(panel, `${theme}-settings-${section.toLowerCase().replace(" ", "-")}`);
    }
    await closeSettings(panel);

    // 005: repeater con resultado, diff JSON, diff por líneas y body original no editable.
    const repeat = async (path: string, to: string) => {
      await app.evaluate(async (u) => {
        await (await fetch(u, { credentials: "include" })).text();
      }, `${servers.apiOrigin}${path}`);
      await openSection(panel, "Traffic");
      await panel.setViewportSize({ width: 1280, height: 640 });
      await trafficRow(panel, path).last().click({ button: "right" });
      await panel.getByRole("menuitem", { name: "Send to repeater" }).click();
      const r = panel.locator(".repeater");
      await r.getByLabel("URL", { exact: true }).fill(`${servers.apiOrigin}${to}`);
      await r.getByRole("button", { name: "Send", exact: true }).click();
      await expect(r.locator(".send-result").getByText("Sending…")).toHaveCount(0);
      return r;
    };
    const r = await repeat("/diff/a", "/diff/b");
    await shoot(panel, `${theme}-repeater`);
    await r.getByRole("button", { name: "Compare with original" }).click();
    await expect(panel.locator(".diff-view").getByRole("status")).toBeVisible();
    await shoot(panel, `${theme}-diff-json`);
    const lines = await repeat("/diff/text?v=1", "/diff/text?v=2");
    await lines.getByRole("button", { name: "Compare with original" }).click();
    await expect(panel.locator(".diff-view").getByRole("status")).toBeVisible();
    await shoot(panel, `${theme}-diff-lines`);
    await app.evaluate(async (api) => {
      await fetch(`${api}/echo`, {
        method: "POST",
        headers: { "content-type": "image/png" },
        body: new Uint8Array([137, 80, 78, 71, 0, 1, 2]),
      });
    }, servers.apiOrigin);
    await openSection(panel, "Traffic");
    await panel.setViewportSize({ width: 1280, height: 640 });
    // El último /echo es su preflight: se elige el POST.
    await requestRow(panel, "/echo").last().click({ button: "right" });
    await panel.getByRole("menuitem", { name: "Send to repeater" }).click();
    await expect(panel.locator(".repeater").getByText(/Original body, not editable/)).toBeVisible();
    await shoot(panel, `${theme}-repeater-binary`);

    // 006: editor del hook (como Sources), con error, y pestaña Hooks (como Timing).
    await openSection(panel, "Rules");
    await panel
      .getByRole("button", { name: /Create your first rule|New rule/ })
      .first()
      .click();
    await panel.getByLabel("Name").fill("Hook visual");
    await panel.getByLabel("Action", { exact: true }).selectOption("hook");
    await expect(panel.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });
    await panel.locator(".cm-content").click();
    await panel.keyboard.press("Control+A");
    await panel.keyboard.insertText(
      "// Cambia el estado\nexport default (ctx: HookContext) => {\n  const data = ctx.json<{ status: string }>();\n  data.status = 42;\n  ctx.response!.body = JSON.stringify(data);\n  return ctx;\n};",
    );
    await expect(panel.getByText(/Line 4: Type 'number' is not assignable/)).toBeVisible();
    await panel.locator(".cm-content").blur();
    await shoot(panel, `${theme}-hook-editor`);
    await panel.getByRole("button", { name: "Cancel" }).click();
    await installHook(panel, {
      name: "Estado",
      stage: "response",
      prefilter: "*/hooks/items*",
      source: `export default (ctx) => { const d = ctx.json(); d.status = "error"; ctx.log("status", d.status); ctx.response.body = JSON.stringify(d); return ctx; };`,
    });
    await installHook(panel, {
      name: "Falla",
      stage: "response",
      prefilter: "*/hooks/items*",
      source: `export default () => { throw new Error("boom"); };`,
    });
    await appFetch(app, `${servers.apiOrigin}/hooks/items`);
    await openSection(panel, "Traffic");
    await panel.setViewportSize({ width: 1280, height: 640 });
    await trafficRow(panel, "/hooks/items").last().click();
    await panel.locator(".detail").getByRole("tab", { name: "Hooks" }).click();
    await expect(panel.locator(".hooks-tab").getByText(/boom/)).toBeVisible();
    await shoot(panel, `${theme}-hooks-tab`);

    // 006: consola de hooks en el cajón (como Console) con el contador de errores.
    await appFetch(app, `${servers.apiOrigin}/hooks/items`);
    await expect(panel.getByRole("button", { name: /unread hook errors/ })).toBeVisible();
    await panel.getByRole("button", { name: /unread hook errors/ }).click();
    await panel
      .getByRole("region", { name: "Hooks console" })
      .getByRole("button", { name: "Logs" })
      .click();
    await expect(panel.locator(".hook-console .console-row").first()).toBeVisible();
    await shoot(panel, `${theme}-hooks-console`);
  });
}
