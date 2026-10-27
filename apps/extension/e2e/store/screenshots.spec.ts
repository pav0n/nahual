import { mkdirSync } from "node:fs";
import path from "node:path";
import type { BrowserContext, Page } from "@playwright/test";
import { expect } from "../fixtures/extension.ts";
import {
  attachAndReload,
  callApi,
  corsCall,
  createRule,
  openCorsDetail,
  openQueue,
  openSection,
  pausedEditor,
  pausedOption,
  requestRow,
  trafficRow,
} from "../fixtures/panel.ts";
import { ASSETS, LOGO, SIZE, settle, setup, test } from "./store.ts";

// 007 T038: capturas (1280×800, claro y oscuro) y video del listing de la Chrome Web Store, en
// docs/store/assets/. `pnpm --filter @nahual/extension e2e:store` tras `pnpm build:test`.
// Cada captura es un cartel: un titular con lo que DevTools no hace (o no hace fácil) y el panel
// real debajo. Qué muestra cada archivo: docs/store/assets/README.md. El video: video.spec.ts.

/** El panel se captura a 1280 px y el cartel lo muestra a 1120 (×0,875). */
const PANEL = { width: 1280, height: 660 };

interface Poster {
  file: string;
  /** Titular; lo que va entre `*` se resalta. */
  title: string;
  subtitle: string;
  /** Muestra la barra de depuración de Chrome sobre DevTools (el listing la explica). */
  debugBar?: boolean;
}

/**
 * Cartel de 1280×800: marca, titular y el panel real dentro de una ventana de DevTools. Chrome sin
 * interfaz no dibuja ni DevTools ni la barra de depuración: se reproducen con su texto real y se
 * dice en docs/store/assets/README.md.
 */
function posterHtml(poster: Poster, origin: string, panelPng: Buffer) {
  const title = poster.title.replace(/\*(.+?)\*/g, "<em>$1</em>");
  const host = origin.replace(/^https?:\/\//, "");
  return `<!doctype html><meta charset="utf-8"><style>
  *{box-sizing:border-box}
  body{margin:0;width:1280px;height:800px;overflow:hidden;color:#e8eaed;font-family:system-ui,"Segoe UI",Roboto,"Liberation Sans",sans-serif;
    background:radial-gradient(circle at 88% -10%,rgba(30,184,224,.32),transparent 45%),radial-gradient(circle at -5% 105%,rgba(43,228,160,.22),transparent 40%),#0d1117}
  .brand{position:absolute;left:80px;top:40px;display:flex;align-items:center;gap:10px;font-weight:700;letter-spacing:5px;font-size:15px}
  .brand svg{width:30px;height:30px}
  .brand small{letter-spacing:2px;font-size:11px;color:#2be4a0;font-weight:700;margin-left:6px}
  h1{position:absolute;left:80px;top:78px;margin:0;font-size:42px;line-height:1.15;font-weight:800;letter-spacing:-.5px;max-width:1120px}
  h1 em{font-style:normal;background:linear-gradient(90deg,#1eb8e0,#2be4a0);-webkit-background-clip:text;background-clip:text;color:transparent}
  p{position:absolute;left:80px;top:136px;margin:0;font-size:19px;color:#a8b3c1;max-width:1120px}
  .win{position:absolute;left:80px;top:196px;width:1120px;border-radius:12px;overflow:hidden;background:#292a2d;
    box-shadow:0 30px 80px rgba(0,0,0,.6),0 0 0 1px rgba(255,255,255,.1)}
  .info{height:30px;background:#fef7e0;color:#202124;display:flex;align-items:center;gap:10px;padding:0 14px;font-size:13px}
  .info i{width:15px;height:15px;border-radius:50%;border:2px solid #5f6368;font:bold 9px/11px sans-serif;text-align:center;font-style:normal;color:#5f6368}
  .info .grow{flex:1}.info button{font:inherit;font-size:12px;padding:2px 12px;border-radius:12px;border:1px solid #dadce0;background:#fff;color:#0b57d0}
  .info .url{color:#5f6368;margin-left:auto;margin-right:12px}
  .tabs{height:26px;display:flex;align-items:center;gap:16px;padding:0 12px;font-size:12px;color:#9aa0a6;border-bottom:1px solid #3c4043}
  .tabs b{color:#e8eaed;border-bottom:2px solid #7cacf8;line-height:24px}
  img{display:block;width:1120px}
  </style>
  <div class="brand">${LOGO}NAHUAL<small>DEVTOOLS TRAFFIC TOOLKIT</small></div>
  <h1>${title}</h1>
  <p>${poster.subtitle}</p>
  <div class="win">
    ${poster.debugBar ? `<div class="info"><i>i</i><span>“Nahual” started debugging this browser</span><span class="url">${host}</span><button>Cancel</button></div>` : ""}
    <div class="tabs"><span>Elements</span><span>Console</span><span>Sources</span><span>Network</span><span>Application</span><b>Nahual</b></div>
    <img src="data:image/png;base64,${panelPng.toString("base64")}">
  </div>`;
}

async function poster(
  context: BrowserContext,
  panel: Page,
  dir: string,
  origin: string,
  p: Poster,
) {
  await settle(panel);
  const png = await panel.screenshot({ animations: "disabled", caret: "hide" });
  const page = await context.newPage();
  await page.setViewportSize(SIZE);
  await page.setContent(posterHtml(p, origin, png));
  // Sin esperar a decodificar la imagen, la captura sale con el panel a medio pintar.
  await page.locator("img").evaluate((img: HTMLImageElement) => img.decode());
  await page.screenshot({ path: path.join(dir, p.file) });
  await page.close();
}

const HOOK_WITH_TYPE_ERROR = `// Simulate a stale cache for the checkout flow
export default (ctx: HookContext) => {
  const cart = ctx.json<{ total: number; currency: string }>();
  cart.total = "free";
  ctx.response!.body = JSON.stringify(cart);
  return ctx;
};`;

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
    await panel.setViewportSize(PANEL);
    await attachAndReload(panel, app);
    for (const id of ["items", "export-items", "empty"]) await callApi(app, id);
    const shoot = (p: Poster) => poster(context, panel, dir, servers.appOrigin, p);

    // 1. Pausa condicional y edición de la respuesta antes de que llegue a la página.
    await createRule(panel, {
      name: "Catch server errors",
      pattern: "*/api/*",
      stage: "response",
      conditions: [{ kind: "Status", op: "≥", fields: { Value: "500" } }],
    });
    const pending = callApi(app, "error");
    await openQueue(panel);
    await expect(pausedOption(panel, "/api/error")).toBeVisible();
    await shoot({
      file: "1-pause-edit.png",
      title: "Pause and edit responses *in flight*",
      subtitle: "Only when they match your conditions: URL, method, status, headers or JSON body.",
      debugBar: true,
    });
    await pausedEditor(panel).getByRole("button", { name: "Continue unchanged" }).click();
    await pending;

    // 2. CORS: la causa explicada y la relajación acotada para desarrollo.
    await corsCall(app, "cors-wildcard-credentials");
    await openSection(panel, "Traffic");
    const cors = await openCorsDetail(panel, "/cors/wildcard-credentials");
    await cors.getByRole("button", { name: "Allow CORS for development" }).click();
    await expect(cors.locator(".relax-form")).toBeVisible();
    await shoot({
      file: "2-cors.png",
      title: "Know *why* CORS blocked it",
      subtitle:
        "A plain explanation of the cause, and a scoped, temporary fix for development only.",
    });
    await cors.locator(".relax-form").getByRole("button", { name: "Cancel" }).click();

    // 3. Hook en TypeScript con el error de tipos en vivo.
    await openSection(panel, "Rules");
    await panel.getByRole("button", { name: "New rule" }).click();
    await panel.getByLabel("Name").fill("Stale checkout cache");
    await panel.getByLabel("Action", { exact: true }).selectOption("hook");
    await expect(panel.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });
    await panel.locator(".cm-content").click();
    await panel.keyboard.press("Control+A");
    await panel.keyboard.insertText(HOOK_WITH_TYPE_ERROR);
    const typeError = panel.getByText(/Line 4: Type 'string' is not assignable/);
    await expect(typeError).toBeVisible();
    // El editor queda al final del formulario: se desplaza para que se vean el código y el error.
    await typeError.evaluate((el) => el.scrollIntoView({ block: "end" }));
    await shoot({
      file: "3-hooks.png",
      title: "Rewrite traffic with *TypeScript* hooks",
      subtitle: "Type-checked as you type, run in a sandbox, with timing for every execution.",
    });
    await panel.getByRole("button", { name: "Cancel" }).click();

    // 4. Repeater con el diff JSON contra el original.
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
    await shoot({
      file: "4-repeater-diff.png",
      title: "Replay any request and *diff* the result",
      subtitle: "Edit and resend from the page or a clean context, then compare field by field.",
    });

    // 5. Del tráfico real a un test de Vitest, con los secretos redactados.
    await openSection(panel, "Traffic");
    await requestRow(panel, "/export/items").last().click({ button: "right" });
    await panel.getByRole("menuitem", { name: "Export as…" }).click();
    const exportDialog = panel.getByRole("dialog", { name: /^Export/ });
    await exportDialog.getByRole("tab", { name: "Vitest test", exact: true }).click();
    await expect(exportDialog.locator(".cm-content")).toContainText("expect");
    await shoot({
      file: "5-export.png",
      title: "Turn real traffic into *tests and mocks*",
      subtitle: "cURL, fetch, Vitest, MSW, Zod or Postman, with secrets redacted by default.",
    });
    await panel.keyboard.press("Escape");
  });
}
