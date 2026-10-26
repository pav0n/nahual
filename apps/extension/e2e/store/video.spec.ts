import path from "node:path";
import { chromium, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { NAHUAL_DIST, expect } from "../fixtures/extension.ts";
import {
  appFetch,
  attachAndReload,
  callApi,
  corsCall,
  createRule,
  detach,
  openCorsDetail,
  openQueue,
  openSection,
  pausedEditor,
  pausedOption,
  relaxIndicator,
  requestRow,
  trafficRow,
} from "../fixtures/panel.ts";
import { ASSETS, LOGO, SIZE, setup, test } from "./store.ts";

// 007 T038: video del listing (docs/store/assets/demo.webm, guion en docs/store/assets/README.md).
// Graba el panel real; los títulos, los subtítulos de cada paso y el resalte de cada clic se
// dibujan encima con popovers (capa superior, sobre los diálogos modales) que no reciben clics.

/** El contexto se abre con grabación (el fixture común no graba). */
const video = test.extend<{ context: BrowserContext }>({
  // eslint-disable-next-line no-empty-pattern -- Playwright exige desestructurar los fixtures.
  context: async ({}, use, info) => {
    const context = await chromium.launchPersistentContext("", {
      channel: "chromium",
      headless: process.env.HEADED !== "1",
      args: [
        "--lang=en-US",
        // Sin pantalla, la barra de depuración no se ve pero encoge el área grabada: se omite.
        "--silent-debugger-extension-api",
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

const OVERLAY_CSS = `
  .nh-ov{position:fixed;inset:auto;margin:0;border:0;padding:0;background:transparent;pointer-events:none;overflow:visible}
  .nh-cap{left:50%;bottom:44px;transform:translateX(-50%);max-width:1040px;padding:14px 26px;border-radius:14px;
    background:rgba(13,17,23,.94);border:1px solid rgba(43,228,160,.55);box-shadow:0 18px 50px rgba(0,0,0,.55);
    color:#e8eaed;font:700 24px/1.25 system-ui,"Segoe UI",Roboto,"Liberation Sans",sans-serif;text-align:center}
  .nh-cap small{display:block;margin-top:4px;font-weight:400;font-size:16px;color:#a8b3c1}
  .nh-cap b{background:linear-gradient(90deg,#1eb8e0,#2be4a0);-webkit-background-clip:text;background-clip:text;color:transparent}
  .nh-cap .step{display:inline-block;margin-right:10px;padding:1px 9px;border-radius:9px;font-size:15px;vertical-align:3px;
    color:#0d1117;background:linear-gradient(90deg,#1eb8e0,#2be4a0)}
  .nh-card{inset:0;width:100vw;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;
    color:#e8eaed;font-family:system-ui,"Segoe UI",Roboto,"Liberation Sans",sans-serif;text-align:center;
    background:radial-gradient(circle at 85% 0%,rgba(30,184,224,.32),transparent 45%),radial-gradient(circle at 0% 100%,rgba(43,228,160,.22),transparent 40%),#0d1117}
  .nh-card svg{width:120px;height:120px}
  .nh-card h1{margin:0;font-size:56px;letter-spacing:12px}
  .nh-card .tag{color:#2be4a0;font-weight:700;letter-spacing:4px;font-size:16px}
  .nh-card p{margin:8px 0 0;font-size:24px;color:#a8b3c1;max-width:900px}
  .nh-ring{border:3px solid #2be4a0;border-radius:8px;box-shadow:0 0 0 6px rgba(43,228,160,.25),0 0 24px rgba(43,228,160,.6)}
`;

/** Muestra (o quita, con `null`) un popover de la capa superior, encima de todo lo demás. */
async function overlay(
  panel: Page,
  id: string,
  className: string,
  html: string | null,
  box?: object,
) {
  await panel.evaluate(
    ({ id, className, html, css, box }) => {
      if (!document.getElementById("nh-ov-style")) {
        const style = document.createElement("style");
        style.id = "nh-ov-style";
        style.textContent = css;
        document.head.append(style);
      }
      document.getElementById(id)?.remove();
      if (html === null) return;
      const el = document.createElement("div");
      el.id = id;
      el.className = `nh-ov ${className}`;
      el.setAttribute("popover", "manual");
      el.append(...new DOMParser().parseFromString(html, "text/html").body.childNodes);
      Object.assign(el.style, box ?? {});
      document.body.append(el);
      el.showPopover();
    },
    { id, className, html, css: OVERLAY_CSS, box },
  );
}

/** Subtítulo del paso; `**texto**` se resalta. */
const caption = (panel: Page, step: string, title: string, sub: string) =>
  overlay(
    panel,
    "nh-cap",
    "nh-cap",
    `<span class="step">${step}</span>${title.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")}<small>${sub}</small>`,
  );

const card = (panel: Page, html: string | null) => overlay(panel, "nh-card", "nh-card", html);

/** Resalta el control antes de usarlo, como si el cursor lo señalara. */
async function point(panel: Page, target: Locator) {
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  if (!box) return;
  await overlay(panel, "nh-ring", "nh-ring", "", {
    left: `${box.x - 6}px`,
    top: `${box.y - 6}px`,
    width: `${box.width + 12}px`,
    height: `${box.height + 12}px`,
  });
  await panel.waitForTimeout(700);
  await overlay(panel, "nh-ring", "nh-ring", null);
}

async function click(panel: Page, target: Locator, options?: Parameters<Locator["click"]>[0]) {
  await point(panel, target);
  await target.click(options);
}

const HOOK_DRAFT = `// Simulate the API answering in maintenance mode
export default (ctx: HookContext) => {
  const data = ctx.json<{ status: string; items: number[] }>();
  data.items = "none";
  data.status = "maintenance";
  ctx.log("rewrote", data);
  ctx.response!.body = JSON.stringify(data);
  return ctx;
};`;

video(
  "video del listing: recorrido por lo que DevTools no hace",
  async ({ context, nahualWorker, extensionId, servers }) => {
    test.setTimeout(240_000);
    const { app, panel } = await setup(context, nahualWorker, extensionId, servers);
    await panel.emulateMedia({ colorScheme: "dark" });
    const beat = (ms = 1_600) => panel.waitForTimeout(ms);
    const api = servers.apiOrigin;

    // Portada.
    await card(
      panel,
      `${LOGO}<h1>NAHUAL</h1><div class="tag">DEVTOOLS TRAFFIC TOOLKIT</div>
     <p>Pause, rewrite, replay and export your app's traffic, right inside DevTools, on the tab you're already debugging.</p>`,
    );
    await beat(3_500);
    await card(panel, null);

    // 1. Adjuntar.
    await caption(
      panel,
      "1",
      "Attach to the tab you're debugging",
      "No proxy, no certificates, no separate browser: your real session.",
    );
    await beat();
    await attachAndReload(panel, app);
    for (const id of ["items", "export-items", "empty"]) await callApi(app, id);
    await beat(2_200);

    // 2. Pausa condicional y edición en vuelo.
    await caption(
      panel,
      "2",
      "Pause **only what matters**",
      "A rule that stops responses with status ≥ 500, and nothing else.",
    );
    await createRule(panel, {
      name: "Catch server errors",
      pattern: "*/api/*",
      stage: "response",
      conditions: [{ kind: "Status", op: "≥", fields: { Value: "500" } }],
    });
    await beat();
    const pending = callApi(app, "error");
    await openQueue(panel);
    await expect(pausedOption(panel, "/api/error")).toBeVisible();
    await caption(
      panel,
      "2",
      "Edit the response **in flight**",
      "Change status, headers or body before the page sees it.",
    );
    await beat();
    const editor = pausedEditor(panel);
    await point(panel, editor.getByLabel("Status"));
    await editor.getByLabel("Status").fill("200");
    await point(panel, editor.getByLabel("Response body"));
    await editor.getByLabel("Response body").fill('{"items":[],"notice":"Served by Nahual"}');
    await beat(1_200);
    await click(panel, editor.getByRole("button", { name: "Continue with changes" }));
    expect((await pending).status).toBe(200);
    await openSection(panel, "Traffic");
    await trafficRow(panel, "/api/error").last().click();
    await panel.locator(".detail").getByRole("tab", { name: "Response" }).click();
    await caption(panel, "2", "The page got **your** response", "The 500 never reached it.");
    await beat(2_600);

    // 3. CORS explicado y relajado de forma acotada.
    await caption(
      panel,
      "3",
      "Know **why** CORS blocked it",
      "The exact cause, what the app asked for and what the server answered.",
    );
    await corsCall(app, "cors-wildcard-credentials");
    const cors = await openCorsDetail(panel, "/cors/wildcard-credentials");
    await beat(3_000);
    await click(panel, cors.getByRole("button", { name: "Allow CORS for development" }));
    await caption(
      panel,
      "3",
      "Relax it **for this tab only**",
      "Scoped to one origin, expires on its own, never in production.",
    );
    await beat(2_000);
    await click(
      panel,
      cors.locator(".relax-form").getByRole("button", { name: "Allow", exact: true }),
    );
    await expect(relaxIndicator(panel)).toBeVisible();
    const retry = await corsCall(app, "cors-wildcard-credentials");
    expect(retry.error).toBeUndefined();
    await beat(2_000);

    // 4. Hook en TypeScript con tipos.
    await caption(
      panel,
      "4",
      "Rewrite traffic with **TypeScript hooks**",
      "Real code, type-checked as you type, run in a sandbox.",
    );
    await openSection(panel, "Rules");
    await click(panel, panel.getByRole("button", { name: "New rule" }));
    const form = panel.locator(".editor");
    await form.getByLabel("Name", { exact: true }).fill("Maintenance mode");
    await form.getByLabel("URL prefilter").fill("*/hooks/items*");
    await form.getByLabel("Stage").selectOption("response");
    await form.getByLabel("Action", { exact: true }).selectOption("hook");
    await expect(panel.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });
    await panel.locator(".cm-content").click();
    await panel.keyboard.press("Control+A");
    await panel.keyboard.press("Delete");
    for (const line of HOOK_DRAFT.split("\n")) {
      await panel.keyboard.insertText(`${line}\n`);
      await panel.waitForTimeout(250);
    }
    const typeError = panel.getByText(/Type 'string' is not assignable/);
    await expect(typeError).toBeVisible();
    await typeError.evaluate((el) => el.scrollIntoView({ block: "end" }));
    await caption(panel, "4", "Caught **before** it runs", "items is number[], not a string.");
    await beat(2_800);
    await panel.locator(".cm-content").click();
    await panel.keyboard.press("Control+A");
    await panel.keyboard.insertText(HOOK_DRAFT.replace('data.items = "none";', "data.items = [];"));
    await expect(typeError).toHaveCount(0);
    await beat(1_200);
    await click(panel, form.getByRole("button", { name: "Save rule" }));
    await expect(panel.locator(".editor")).toHaveCount(0);
    await appFetch(app, `${api}/hooks/items`);
    await openSection(panel, "Traffic");
    await trafficRow(panel, "/hooks/items").last().click();
    await click(panel, panel.locator(".detail").getByRole("tab", { name: "Hooks" }));
    await caption(panel, "4", "See **every run**", "What changed, its logs and how long it took.");
    await beat(3_000);

    // 5. Repeater con diff.
    await caption(
      panel,
      "5",
      "Replay any request and **diff** the result",
      "Edit and resend, then compare field by field with the original.",
    );
    await app.evaluate(async (u) => {
      await (await fetch(u, { credentials: "include" })).text();
    }, `${api}/diff/a`);
    await click(panel, trafficRow(panel, "/diff/a").last(), { button: "right" });
    await click(panel, panel.getByRole("menuitem", { name: "Send to repeater" }));
    const repeater = panel.locator(".repeater");
    await repeater.getByLabel("URL", { exact: true }).fill(`${api}/diff/b`);
    await click(panel, repeater.getByRole("button", { name: "Send", exact: true }));
    await expect(repeater.locator(".send-result").getByText("Sending…")).toHaveCount(0);
    await click(panel, repeater.getByRole("button", { name: "Compare with original" }));
    await expect(panel.locator(".diff-view").getByRole("status")).toBeVisible();
    await beat(3_200);

    // 6. Exportar a tests y mocks.
    const exportCaption = () =>
      caption(
        panel,
        "6",
        "Turn real traffic into **tests and mocks**",
        "Secrets are redacted by default.",
      );
    await exportCaption();
    await openSection(panel, "Traffic");
    await click(panel, requestRow(panel, "/export/items").last(), { button: "right" });
    await click(panel, panel.getByRole("menuitem", { name: "Export as…" }));
    const exportDialog = panel.getByRole("dialog", { name: /^Export/ });
    await expect(exportDialog.locator(".cm-content")).toBeVisible();
    // El diálogo modal entra en la capa superior encima del subtítulo: se vuelve a mostrar.
    await exportCaption();
    for (const format of ["cURL", "Vitest test", "MSW handler", "Zod schema"]) {
      await click(panel, exportDialog.getByRole("tab", { name: format, exact: true }));
      await beat(1_800);
    }
    await panel.keyboard.press("Escape");

    // Cierre.
    await caption(
      panel,
      "✓",
      "Detach when you're done",
      "Nahual lets go of the tab and the page is back to normal.",
    );
    await detach(panel);
    await beat(1_800);
    await overlay(panel, "nh-cap", "nh-cap", null);
    await card(
      panel,
      `${LOGO}<h1>NAHUAL</h1><div class="tag">DEVTOOLS TRAFFIC TOOLKIT</div>
     <p>Free · Local · No account · No telemetry</p>`,
    );
    await beat(3_500);

    const recording = panel.video();
    await panel.close();
    await recording?.saveAs(path.join(ASSETS, "demo.webm"));
  },
);
