import { chromium, test, type CDPSession } from "@playwright/test";
import { startServers } from "../fixtures/servers.ts";
import { saveResult } from "./cdp-lab.ts";

// 004-D1 (research R1): valores calculados de los tokens de DevTools en Chrome estable, en tema
// claro y oscuro, más la fuente, el alto de fila de Network y el tamaño de sus iconos. Se copian
// valores, no código.
/** Envía un comando al destino de DevTools por la sesión del navegador (sin `flatten`). */
function targetClient(browser: CDPSession, targetSessionId: string) {
  let seq = 0;
  const pending = new Map<number, (value: unknown) => void>();
  browser.on("Target.receivedMessageFromTarget", (event) => {
    if (event.sessionId !== targetSessionId) return;
    const message = JSON.parse(event.message) as { id?: number; result?: unknown };
    if (message.id !== undefined) pending.get(message.id)?.(message.result);
  });
  return (method: string, params: object = {}) =>
    new Promise<unknown>((resolve) => {
      const id = ++seq;
      pending.set(id, resolve);
      void browser.send("Target.sendMessageToTarget", {
        sessionId: targetSessionId,
        message: JSON.stringify({ id, method, params }),
      });
    });
}

/** Mide dentro del frontend de DevTools: tokens de sintaxis/consola y la fuente del editor. */
const MEASURE = `(async () => {
  const deepAll = (root, selector, out = []) => {
    out.push(...root.querySelectorAll(selector));
    for (const el of root.querySelectorAll("*")) if (el.shadowRoot) deepAll(el.shadowRoot, selector, out);
    return out;
  };
  try {
    const UI = await import("./ui/legacy/legacy.js");
    await UI.ViewManager.ViewManager.instance().showView("sources");
  } catch (e) {}
  await new Promise((r) => setTimeout(r, 1500));
  const style = getComputedStyle(document.body);
  const tokens = {};
  for (const name of style) {
    if (/^--sys-color-(token|error|on-error|surface-error|on-surface-error|warning|on-warning|surface-yellow|on-surface-yellow)/.test(name) || /^--(override-)?console|^--app-color-console|^--source-code-font|^--monospace-font/.test(name))
      tokens[name] = style.getPropertyValue(name).trim();
  }
  const editor = deepAll(document, ".cm-editor, .cm-content").find((el) => el.getBoundingClientRect().height > 0);
  const es = editor ? getComputedStyle(editor) : null;
  return {
    tokens,
    editorFont: es ? { family: es.fontFamily, size: es.fontSize, lineHeight: es.lineHeight } : null,
  };
})`;

test("D3: tokens de sintaxis y consola de DevTools", async () => {
  const servers = await startServers();
  const browser = await chromium.launch({
    channel: "chromium",
    headless: process.env.HEADED !== "1",
    args: ["--auto-open-devtools-for-tabs"],
  });
  try {
    const page = await browser.newPage();
    await page.goto(`${servers.appOrigin}/`);
    const cdp = await browser.newBrowserCDPSession();
    let devtools: { targetId: string } | undefined;
    for (let i = 0; i < 20 && !devtools; i++) {
      const { targetInfos } = (await cdp.send("Target.getTargets")) as {
        targetInfos: { targetId: string; url: string }[];
      };
      devtools = targetInfos.find((t) => t.url.startsWith("devtools://"));
      if (!devtools) await page.waitForTimeout(500);
    }
    test.skip(!devtools, "Chrome no expone el destino devtools:// a CDP: medir a mano (R1)");
    if (!devtools) return;
    const { sessionId } = (await cdp.send("Target.attachToTarget", {
      targetId: devtools.targetId,
      flatten: false,
    })) as { sessionId: string };
    const send = targetClient(cdp, sessionId);
    const results: Record<string, unknown> = {};
    for (const theme of ["light", "dark"] as const) {
      await send("Emulation.setEmulatedMedia", {
        features: [{ name: "prefers-color-scheme", value: theme }],
      });
      await page.reload();
      const evaluated = (await send("Runtime.evaluate", {
        expression: `${MEASURE}()`,
        awaitPromise: true,
        returnByValue: true,
      })) as { result?: { value?: unknown } };
      results[theme] = evaluated.result?.value ?? null;
    }
    saveResult("006-d3-devtools-syntax", {
      userAgent: await page.evaluate(() => navigator.userAgent),
      ...results,
    });
  } finally {
    await browser.close();
    await servers.close();
  }
});
