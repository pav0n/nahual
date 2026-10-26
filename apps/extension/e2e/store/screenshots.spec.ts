import { mkdirSync } from "node:fs";
import path from "node:path";
import { chromium, type BrowserContext, type Page } from "@playwright/test";
import { NAHUAL_DIST, expect, test as base } from "../fixtures/extension.ts";
import {
  attachAndReload,
  callApi,
  closeSettings,
  createRule,
  detach,
  installHook,
  openApp,
  openPanel,
  openQueue,
  openSection,
  openSettings,
  pausedEditor,
  pausedOption,
  requestRow,
  startFetch,
  tabIdOf,
  trafficRow,
} from "../fixtures/panel.ts";
import { startServers, type TestServers } from "../fixtures/servers.ts";

// 007 T038: capturas (1280×800, claro y oscuro) y video del listing de la Chrome Web Store, en
// docs/store/assets/. `pnpm --filter @nahual/extension e2e:store` tras `pnpm build:test`.
// Qué muestra cada archivo y el guion del video: docs/store/assets/README.md.

const ASSETS = path.resolve(import.meta.dirname, "../../../../docs/store/assets");
const SIZE = { width: 1280, height: 800 };

/** Puertos fijos y con aspecto de desarrollo local: las URLs salen en las capturas. */
const test = base.extend<{ servers: TestServers }>({
  // eslint-disable-next-line no-empty-pattern -- Playwright exige desestructurar los fixtures.
  servers: async ({}, use) => {
    const servers = await startServers({ app: 5173, api: 8787, third: 8788 });
    await use(servers);
    await servers.close();
  },
});

async function setup(
  context: BrowserContext,
  worker: Parameters<typeof tabIdOf>[0],
  id: string,
  servers: TestServers,
) {
  const app = await openApp(context, servers.appOrigin);
  const tabId = await tabIdOf(worker, `${servers.appOrigin}/`);
  const panel = await openPanel(context, id, tabId);
  await panel.setViewportSize(SIZE);
  return { app, panel };
}

/** Sin avisos pasajeros ni foco en la captura. */
async function settle(panel: Page) {
  await expect(panel.locator(".toast")).toHaveCount(0, { timeout: 15_000 });
  await panel.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
}

async function shot(panel: Page, dir: string, name: string) {
  await settle(panel);
  await panel.screenshot({ path: path.join(dir, name), animations: "disabled", caret: "hide" });
}

/**
 * Composición de la primera captura: la barra de Chrome con su aviso de depuración y DevTools
 * acoplado con el panel real. Chrome sin interfaz no dibuja ni la ventana ni la barra; las dos se
 * reproducen aquí con su texto real y se dice en docs/store/assets/README.md.
 */
function frame(theme: "light" | "dark", origin: string, panelPng: Buffer) {
  const dark = theme === "dark";
  const c = dark
    ? {
        win: "#202124",
        bar: "#35363a",
        text: "#e8eaed",
        muted: "#9aa0a6",
        omni: "#202124",
        page: "#121418",
        card: "#1f2329",
        info: "#3c3a2a",
        infoBorder: "#5c5530",
        line: "#3c4043",
      }
    : {
        win: "#dee1e6",
        bar: "#ffffff",
        text: "#202124",
        muted: "#5f6368",
        omni: "#f1f3f4",
        page: "#f6f7f9",
        card: "#ffffff",
        info: "#fef7e0",
        infoBorder: "#f9e2a6",
        line: "#dadce0",
      };
  const host = origin.replace(/^https?:\/\//, "");
  const product = (name: string, price: string) =>
    `<div class="card"><div class="ph"></div><b>${name}</b><span>${price}</span></div>`;
  return `<!doctype html><meta charset="utf-8"><style>
  *{box-sizing:border-box}body{margin:0;width:1280px;height:800px;overflow:hidden;font:13px system-ui,"Segoe UI",Roboto,"Liberation Sans",sans-serif;color:${c.text};background:${c.win}}
  .tabs{height:34px;display:flex;align-items:flex-end;padding:0 8px}
  .tab{height:28px;width:230px;background:${c.bar};border-radius:8px 8px 0 0;display:flex;align-items:center;gap:8px;padding:0 12px}
  .dot{width:14px;height:14px;border-radius:4px;background:#2be4a0}
  .omni{height:38px;background:${c.bar};display:flex;align-items:center;gap:14px;padding:0 12px;color:${c.muted}}
  .url{flex:1;height:28px;border-radius:14px;background:${c.omni};display:flex;align-items:center;padding:0 14px;color:${c.text}}
  .info{height:36px;background:${c.info};border-top:1px solid ${c.infoBorder};border-bottom:1px solid ${c.infoBorder};display:flex;align-items:center;gap:10px;padding:0 14px}
  .info i{width:16px;height:16px;border-radius:50%;border:2px solid ${c.muted};font:bold 10px/12px sans-serif;text-align:center;font-style:normal;color:${c.muted}}
  .info .grow{flex:1}.info button{font:inherit;padding:3px 14px;border-radius:14px;border:1px solid ${c.line};background:${c.bar};color:#0b57d0}
  .page{height:180px;background:${c.page};padding:16px 32px;overflow:hidden}
  .page h1{margin:0 0 12px;font-size:20px}.grid{display:flex;gap:16px}
  .card{width:180px;background:${c.card};border:1px solid ${c.line};border-radius:8px;padding:10px;display:flex;flex-direction:column;gap:4px}
  .ph{height:56px;border-radius:6px;background:linear-gradient(135deg,#1eb8e0,#2be4a0);opacity:.35}
  .card span{color:${c.muted}}
  .dt{border-top:1px solid ${c.line};background:${c.bar}}
  .dtabs{height:28px;display:flex;align-items:center;gap:18px;padding:0 12px;color:${c.muted};border-bottom:1px solid ${c.line}}
  .dtabs b{color:${c.text};border-bottom:2px solid #0b57d0;height:28px;line-height:28px}
  img{display:block}
  </style>
  <div class="tabs"><div class="tab"><span class="dot"></span>Demo store</div></div>
  <div class="omni">←&nbsp;→&nbsp;⟳<div class="url">${host}</div></div>
  <div class="info"><i>i</i><span class="grow">“Nahual” started debugging this browser</span><button>Cancel</button></div>
  <div class="page"><h1>Demo store</h1><div class="grid">${product("Desk lamp", "$39")}${product("Notebook", "$12")}${product("Headphones", "$89")}${product("Backpack", "$54")}</div></div>
  <div class="dt"><div class="dtabs"><span>Elements</span><span>Console</span><span>Sources</span><span>Network</span><span>Application</span><b>Nahual</b></div>
  <img src="data:image/png;base64,${panelPng.toString("base64")}" width="1280"></div>`;
}

/** Alto del panel dentro de la composición: 800 menos la ventana, la barra y la página. */
const DOCKED_PANEL_HEIGHT = 800 - 34 - 38 - 36 - 180 - 1 - 29;

for (const theme of ["light", "dark"] as const) {
  test(`capturas del listing, tema ${theme}`, async ({
    context,
    nahualWorker,
    extensionId,
    servers,
  }) => {
    test.setTimeout(180_000);
    const dir = path.join(ASSETS, theme);
    mkdirSync(dir, { recursive: true });
    const { app, panel } = await setup(context, nahualWorker, extensionId, servers);
    await panel.emulateMedia({ colorScheme: theme });
    await attachAndReload(panel, app);
    for (const id of ["items", "export-items", "export-items-2", "empty", "echo"])
      await callApi(app, id);

    // 1. Tráfico con detalle, dentro de DevTools y con la barra de depuración de Chrome.
    await panel.setViewportSize({ width: 1280, height: DOCKED_PANEL_HEIGHT });
    await trafficRow(panel, "/api/items").click();
    await panel.locator(".detail").getByRole("tab", { name: "Response" }).click();
    await expect(panel.locator(".detail").getByLabel("Response body")).toBeVisible();
    await settle(panel);
    const docked = await panel.screenshot({ animations: "disabled", caret: "hide" });
    const composed = await context.newPage();
    await composed.setViewportSize(SIZE);
    await composed.setContent(frame(theme, servers.appOrigin, docked));
    // Sin esperar a decodificar la imagen, la captura sale con el panel a medio pintar.
    await composed.locator("img").evaluate((img: HTMLImageElement) => img.decode());
    await composed.screenshot({ path: path.join(dir, "1-traffic-debugging.png") });
    await composed.close();
    await panel.setViewportSize(SIZE);

    // 2. Reglas: una pausa condicional y un hook en TypeScript.
    await createRule(panel, {
      name: "Pause failing orders",
      pattern: "*/api/orders*",
      stage: "response",
      conditions: [{ kind: "Status", op: "≥", fields: { Value: "500" } }],
    });
    await installHook(panel, {
      name: "Flag beta users",
      stage: "response",
      prefilter: "*/api/me",
      source: `export default (ctx: HookContext) => {\n  const user = ctx.json<{ flags: string[] }>();\n  user.flags.push("beta-checkout");\n  ctx.response!.body = JSON.stringify(user);\n  return ctx;\n};\n`,
    });
    await openSection(panel, "Rules");
    await expect(panel.locator(".rule-item")).toHaveCount(2);
    await shot(panel, dir, "2-rules.png");

    // 3. Repeater con el diff JSON contra el original.
    await app.evaluate(async (u) => {
      await (await fetch(u, { credentials: "include" })).text();
    }, `${servers.apiOrigin}/diff/a`);
    await openSection(panel, "Traffic");
    await trafficRow(panel, "/diff/a").last().click({ button: "right" });
    await panel.getByRole("menuitem", { name: "Send to repeater" }).click();
    const repeater = panel.locator(".repeater");
    await repeater.getByLabel("URL", { exact: true }).fill(`${servers.apiOrigin}/diff/b`);
    await repeater.getByRole("button", { name: "Send", exact: true }).click();
    await expect(repeater.locator(".send-result").getByText("Sending…")).toHaveCount(0);
    await repeater.getByRole("button", { name: "Compare with original" }).click();
    await expect(panel.locator(".diff-view").getByRole("status")).toBeVisible();
    await shot(panel, dir, "3-repeater-diff.png");

    // 4. "Exportar como…" cURL, con los valores sensibles redactados.
    await openSection(panel, "Traffic");
    await requestRow(panel, "/export/items").last().click({ button: "right" });
    await panel.getByRole("menuitem", { name: "Export as…" }).click();
    const exportDialog = panel.getByRole("dialog", { name: /^Export/ });
    await exportDialog.getByRole("tab", { name: "cURL", exact: true }).click();
    await expect(exportDialog.locator(".cm-content")).toContainText("redacted");
    await shot(panel, dir, "4-export-curl.png");
    await panel.keyboard.press("Escape");

    // 5. Selector de perfil de la pestaña, con dos perfiles.
    const profiles = await openSettings(panel, "Profiles");
    for (const name of ["QA staging", "Bug 1234"]) {
      await profiles.getByLabel("New profile").fill(name);
      await profiles.getByRole("button", { name: "Create profile" }).click();
      await expect(panel.getByRole("button", { name: `Delete profile: ${name}` })).toBeVisible();
    }
    await closeSettings(panel);
    await openSection(panel, "Rules");
    for (const [rule, profile] of [
      ["Pause failing orders", "QA staging"],
      ["Flag beta users", "QA staging"],
      ["Flag beta users", "Bug 1234"],
    ] as const) {
      await panel.getByRole("button", { name: `Assign profiles: ${rule}` }).click();
      await panel.getByRole("menuitemcheckbox", { name: profile }).click();
      await panel.keyboard.press("Escape");
    }
    await expect(panel.locator(".profile-tag")).toHaveCount(3);
    await panel.getByRole("button", { name: /^This tab's rule profile:/ }).click();
    await expect(panel.getByRole("menu", { name: "Rule profile" })).toBeVisible();
    await settle(panel);
    await panel
      .getByRole("menu", { name: "Rule profile" })
      .getByRole("menuitemcheckbox")
      .first()
      .focus();
    await panel.screenshot({
      path: path.join(dir, "5-profiles.png"),
      animations: "disabled",
      caret: "hide",
    });
  });
}

/** Video: el contexto se abre con grabación (el fixture común no graba). */
const video = test.extend<{ context: BrowserContext }>({
  // eslint-disable-next-line no-empty-pattern -- Playwright exige desestructurar los fixtures.
  context: async ({}, use, info) => {
    const context = await chromium.launchPersistentContext("", {
      channel: "chromium",
      headless: process.env.HEADED !== "1",
      args: [
        "--lang=en-US",
        `--disable-extensions-except=${NAHUAL_DIST}`,
        `--load-extension=${NAHUAL_DIST}`,
      ],
      viewport: SIZE,
      recordVideo: { dir: info.outputPath("video"), size: SIZE },
    });
    await use(context);
    await context.close();
  },
});

video(
  "video del listing: adjuntar, pausar, exportar y soltar",
  async ({ context, nahualWorker, extensionId, servers }) => {
    test.setTimeout(120_000);
    const { app, panel } = await setup(context, nahualWorker, extensionId, servers);
    await panel.emulateMedia({ colorScheme: "dark" });
    const beat = () => panel.waitForTimeout(1_200);
    await beat();

    await attachAndReload(panel, app);
    await callApi(app, "items");
    await beat();

    await createRule(panel, { name: "Pause items", pattern: "*/api/items", stage: "response" });
    await beat();
    const pending = startFetch(app, `${servers.apiOrigin}/api/items`);
    await openQueue(panel);
    await expect(pausedOption(panel, "/api/items")).toBeVisible();
    await beat();
    await pausedEditor(panel).getByRole("button", { name: "Continue unchanged" }).click();
    await pending;
    await beat();

    await callApi(app, "export-items");
    await openSection(panel, "Traffic");
    await requestRow(panel, "/export/items").last().click({ button: "right" });
    await beat();
    await panel.getByRole("menuitem", { name: "Export as…" }).click();
    const exportDialog = panel.getByRole("dialog", { name: /^Export/ });
    await expect(exportDialog.locator(".cm-content")).toBeVisible();
    await beat();
    await exportDialog.getByRole("tab", { name: "MSW handler", exact: true }).click();
    await beat();
    await panel.keyboard.press("Escape");

    await detach(panel);
    await beat();
    const recording = panel.video();
    await panel.close();
    await recording?.saveAs(path.join(ASSETS, "demo.webm"));
  },
);
