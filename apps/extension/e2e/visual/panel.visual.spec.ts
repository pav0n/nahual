import type { Locator, Page } from "@playwright/test";
import { test as base, expect } from "../fixtures/extension.ts";
import {
  attachAndReload,
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
];

async function shoot(panel: Page, name: string) {
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
  });
}
