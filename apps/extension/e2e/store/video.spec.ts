import path from "node:path";
import { chromium, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { NAHUAL_DIST, expect } from "../fixtures/extension.ts";
import {
  appFetch,
  attachAndReload,
  callApi,
  corsCall,
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

/** Alto de la franja inferior de los subtítulos: el panel se encoge para que nunca tapen nada. */
const BAND = 104;

const OVERLAY_CSS = `
  .app{height:calc(100vh - ${BAND}px) !important}
  body{background:#0d1117 !important}
  .nh-ov{position:fixed;inset:auto;margin:0;border:0;padding:0;background:transparent;pointer-events:none;overflow:visible}
  .nh-cap{left:0;right:0;bottom:0;width:100vw;height:${BAND}px;display:flex;flex-direction:column;align-items:center;justify-content:center;
    background:radial-gradient(circle at 90% 0%,rgba(30,184,224,.22),transparent 50%),#0d1117;border-top:1px solid rgba(43,228,160,.45);
    color:#e8eaed;font:700 26px/1.25 system-ui,"Segoe UI",Roboto,"Liberation Sans",sans-serif;text-align:center}
  .nh-cap small{display:block;margin-top:6px;font-weight:400;font-size:17px;color:#a8b3c1}
  .nh-cap b{background:linear-gradient(90deg,#1eb8e0,#2be4a0);-webkit-background-clip:text;background-clip:text;color:transparent}
  .nh-cap .step{display:inline-block;margin-right:12px;padding:1px 10px;border-radius:10px;font-size:16px;vertical-align:4px;
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

/** Subtítulo del paso, en la franja inferior; `**texto**` se resalta. */
const caption = (panel: Page, step: string, title: string, sub: string) =>
  overlay(
    panel,
    "nh-cap",
    "nh-cap",
    `<div><span class="step">${step}</span>${title.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")}</div><small>${sub}</small>`,
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
  await panel.waitForTimeout(1_000);
  await overlay(panel, "nh-ring", "nh-ring", null);
}

async function click(panel: Page, target: Locator, options?: Parameters<Locator["click"]>[0]) {
  await point(panel, target);
  await target.click(options);
}

/** Escribe como una persona, para que se lea lo que se teclea. */
async function type(panel: Page, target: Locator, text: string) {
  await point(panel, target);
  await target.fill("");
  await target.pressSequentially(text, { delay: 45 });
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
    test.setTimeout(300_000);
    const { app, panel } = await setup(context, nahualWorker, extensionId, servers);
    await panel.emulateMedia({ colorScheme: "dark" });
    /** Pausa para leer; las vistas importantes se quedan de 4 a 5 s. */
    const beat = (ms = 2_000) => panel.waitForTimeout(ms);
    const api = servers.apiOrigin;

    // Portada.
    await card(
      panel,
      `${LOGO}<h1>NAHUAL</h1><div class="tag">DEVTOOLS TRAFFIC TOOLKIT</div>
     <p>Pause, rewrite, replay and export your app's traffic, right inside DevTools, on the tab you're already debugging.</p>`,
    );
    await beat(4_500);
    await card(panel, null);

    // 1. Adjuntar.
    await caption(
      panel,
      "1",
      "Attach to the tab you're debugging",
      "No proxy, no certificates, no separate browser: your real session.",
    );
    await beat(2_500);
    await attachAndReload(panel, app);
    for (const id of ["items", "export-items", "empty"]) await callApi(app, id);
    await beat(3_000);

    // 2. Pausa condicional y edición en vuelo.
    await caption(
      panel,
      "2",
      "Pause **only what matters**",
      "A rule that stops responses with status ≥ 500, and nothing else.",
    );
    await openSection(panel, "Rules");
    await click(panel, panel.getByRole("button", { name: /^(Create your first rule|New rule)$/ }));
    const ruleForm = panel.locator(".editor");
    await type(panel, ruleForm.getByLabel("Name", { exact: true }), "Catch server errors");
    await type(panel, ruleForm.getByLabel("URL prefilter"), "*/api/*");
    await ruleForm.getByLabel("Stage").selectOption("response");
    await click(panel, ruleForm.getByRole("button", { name: "Add condition" }));
    const condition = ruleForm.locator("fieldset.condition").last();
    await condition.getByLabel("Type").selectOption({ label: "Status" });
    await condition.getByLabel("Operator").selectOption({ label: "≥" });
    await type(panel, condition.getByLabel("Value", { exact: true }), "500");
    await condition.scrollIntoViewIfNeeded();
    await beat(3_500);
    await click(panel, ruleForm.getByRole("button", { name: "Save rule" }));
    await expect(panel.locator(".editor")).toHaveCount(0);
    await beat(1_500);
    const pending = callApi(app, "error");
    await openQueue(panel);
    await expect(pausedOption(panel, "/api/error")).toBeVisible();
    await caption(
      panel,
      "2",
      "A 500 is **held** before the page sees it",
      "Everything else keeps flowing.",
    );
    await beat(4_000);
    await caption(
      panel,
      "2",
      "Edit the response **in flight**",
      "Change status, headers or body, then let it continue.",
    );
    const editor = pausedEditor(panel);
    await type(panel, editor.getByLabel("Status"), "200");
    await point(panel, editor.getByLabel("Response body"));
    await editor.getByLabel("Response body").fill('{"items":[],"notice":"Served by Nahual"}');
    await beat(3_000);
    await click(panel, editor.getByRole("button", { name: "Continue with changes" }));
    expect((await pending).status).toBe(200);
    await openSection(panel, "Traffic");
    await trafficRow(panel, "/api/error").last().click();
    await panel.locator(".detail").getByRole("tab", { name: "Response" }).click();
    await caption(panel, "2", "The page got **your** response", "The 500 never reached it.");
    await beat(4_000);

    // 3. CORS explicado y relajado de forma acotada.
    await caption(
      panel,
      "3",
      "Know **why** CORS blocked it",
      "The exact cause, what the app asked for and what the server answered.",
    );
    await corsCall(app, "cors-wildcard-credentials");
    const cors = await openCorsDetail(panel, "/cors/wildcard-credentials");
    await beat(5_000);
    await click(panel, cors.getByRole("button", { name: "Allow CORS for development" }));
    await caption(
      panel,
      "3",
      "Relax it **for this tab only**",
      "Scoped to one origin, expires on its own, never in production.",
    );
    await beat(4_000);
    await click(
      panel,
      cors.locator(".relax-form").getByRole("button", { name: "Allow", exact: true }),
    );
    await expect(relaxIndicator(panel)).toBeVisible();
    const retry = await corsCall(app, "cors-wildcard-credentials");
    expect(retry.error).toBeUndefined();
    await caption(
      panel,
      "3",
      "The retry **goes through**",
      "And the bar on top reminds you it's relaxed.",
    );
    await beat(3_500);

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
    await type(panel, form.getByLabel("Name", { exact: true }), "Maintenance mode");
    await type(panel, form.getByLabel("URL prefilter"), "*/hooks/items*");
    await form.getByLabel("Stage").selectOption("response");
    await form.getByLabel("Action", { exact: true }).selectOption("hook");
    await expect(panel.locator(".cm-editor")).toBeVisible({ timeout: 15_000 });
    await panel.locator(".cm-editor").evaluate((el) => el.scrollIntoView({ block: "center" }));
    await panel.locator(".cm-content").click();
    await panel.keyboard.press("Control+A");
    await panel.keyboard.press("Delete");
    for (const line of HOOK_DRAFT.split("\n")) {
      await panel.keyboard.insertText(`${line}\n`);
      await panel.waitForTimeout(350);
    }
    const typeError = panel.getByText(/Type 'string' is not assignable/);
    await expect(typeError).toBeVisible();
    await typeError.evaluate((el) => el.scrollIntoView({ block: "end" }));
    await caption(panel, "4", "Caught **before** it runs", "items is number[], not a string.");
    await beat(4_500);
    await panel.locator(".cm-content").click();
    await panel.keyboard.press("Control+A");
    await panel.keyboard.insertText(HOOK_DRAFT.replace('data.items = "none";', "data.items = [];"));
    await expect(typeError).toHaveCount(0);
    await caption(
      panel,
      "4",
      "Fixed: **ready to run**",
      "Save it and it applies to the next matching response.",
    );
    await beat(2_500);
    await click(panel, form.getByRole("button", { name: "Save rule" }));
    await expect(panel.locator(".editor")).toHaveCount(0);
    await appFetch(app, `${api}/hooks/items`);
    await openSection(panel, "Traffic");
    await trafficRow(panel, "/hooks/items").last().click();
    await click(panel, panel.locator(".detail").getByRole("tab", { name: "Hooks" }));
    await caption(
      panel,
      "4",
      "See **every run**",
      "Which hook changed what, its logs and how long it took.",
    );
    await beat(5_000);

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
    await type(panel, repeater.getByLabel("URL", { exact: true }), `${api}/diff/b`);
    await click(panel, repeater.getByRole("button", { name: "Send", exact: true }));
    await expect(repeater.locator(".send-result").getByText("Sending…")).toHaveCount(0);
    await click(panel, repeater.getByRole("button", { name: "Compare with original" }));
    await expect(panel.locator(".diff-view").getByRole("status")).toBeVisible();
    await caption(
      panel,
      "5",
      "Every change, **field by field**",
      "Removed, changed and added values, with secrets still masked.",
    );
    await beat(5_500);

    // 6. Exportar a tests y mocks.
    const exportCaption = (title: string, sub: string) => caption(panel, "6", title, sub);
    await exportCaption(
      "Turn real traffic into **tests and mocks**",
      "Secrets are redacted by default.",
    );
    await openSection(panel, "Traffic");
    await click(panel, requestRow(panel, "/export/items").last(), { button: "right" });
    await click(panel, panel.getByRole("menuitem", { name: "Export as…" }));
    const exportDialog = panel.getByRole("dialog", { name: /^Export/ });
    await expect(exportDialog.locator(".cm-content")).toBeVisible();
    for (const [format, title, sub] of [
      [
        "Vitest test",
        "A **Vitest** test from the captured call",
        "Status and response shape checked against the real API.",
      ],
      [
        "MSW handler",
        "An **MSW** handler that replays it",
        "Mock the API in your tests or in the browser.",
      ],
    ] as const) {
      await click(panel, exportDialog.getByRole("tab", { name: format, exact: true }));
      // El diálogo modal entra en la capa superior encima del subtítulo: se vuelve a mostrar.
      await exportCaption(title, sub);
      await beat(4_500);
    }
    await panel.keyboard.press("Escape");

    // Cierre.
    await detach(panel);
    await overlay(panel, "nh-cap", "nh-cap", null);
    await card(
      panel,
      `${LOGO}<h1>NAHUAL</h1><div class="tag">DEVTOOLS TRAFFIC TOOLKIT</div>
     <p>Free · Local · No account · No telemetry</p>`,
    );
    await beat(4_500);

    const recording = panel.video();
    await panel.close();
    await recording?.saveAs(path.join(ASSETS, "demo.webm"));
  },
);
