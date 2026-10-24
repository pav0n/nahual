import { chromium, test } from "@playwright/test";
import { NAHUAL_DIST } from "../fixtures/extension.ts";
import { startServers } from "../fixtures/servers.ts";
import { saveResult } from "./cdp-lab.ts";

// 004-D2 (research R12): ¿Escape dentro de un diálogo del panel de Nahual también alterna el cajón
// de la consola de DevTools? ¿Lo evita `stopPropagation` en fase de captura?
const PORT = 9339;

interface TargetInfo {
  type: string;
  url: string;
  webSocketDebuggerUrl: string;
}

/** Cliente CDP mínimo por WebSocket (Playwright no expone los destinos de DevTools). */
async function connect(url: string) {
  const ws = new WebSocket(url);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  let seq = 0;
  const pending = new Map<number, (value: unknown) => void>();
  ws.onmessage = (event) => {
    const message = JSON.parse(String(event.data)) as { id?: number; result?: unknown };
    if (message.id !== undefined) pending.get(message.id)?.(message.result);
  };
  const send = (method: string, params: object = {}) =>
    new Promise<unknown>((resolve) => {
      const id = ++seq;
      pending.set(id, resolve);
      ws.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async (expression: string) => {
    const reply = (await send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    })) as {
      result?: { value?: unknown };
      exceptionDetails?: { exception?: { description?: string } };
    };
    return reply.exceptionDetails
      ? { error: reply.exceptionDetails.exception?.description }
      : reply.result?.value;
  };
  const key = async (key: string, code: string, keyCode: number, modifiers = 0) => {
    const base = { key, code, windowsVirtualKeyCode: keyCode, modifiers };
    await send("Input.dispatchKeyEvent", { type: "rawKeyDown", ...base });
    await send("Input.dispatchKeyEvent", { type: "keyUp", ...base });
  };
  return { send, evaluate, key, close: () => ws.close() };
}

const targets = async () =>
  (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()) as TargetInfo[];

/** Alto visible del cajón (los módulos internos de DevTools no se pueden importar desde fuera). */
const DRAWER = `(() => {
  const deepAll = (root, out = []) => {
    for (const el of root.querySelectorAll("*")) {
      out.push(el);
      if (el.shadowRoot) deepAll(el.shadowRoot, out);
    }
    return out;
  };
  const drawers = deepAll(document).filter((el) => /drawer/.test(String(el.className ?? "")));
  return Math.round(Math.max(0, ...drawers.map((el) => el.getBoundingClientRect().height)));
})()`;

const OPEN_DIALOG = `(() => {
  const d = document.createElement("dialog");
  d.innerHTML = "<button>ok</button>";
  document.body.append(d);
  d.showModal();
  d.querySelector("button").focus();
  return document.hasFocus() && document.activeElement?.tagName;
})()`;

const DIALOG_CLOSED = `!document.querySelector("dialog:last-of-type").open`;

test("D2: Escape en un panel de extensión y el cajón de DevTools", async () => {
  const servers = await startServers();
  const context = await chromium.launchPersistentContext("", {
    channel: "chromium",
    headless: process.env.HEADED !== "1",
    args: [
      `--disable-extensions-except=${NAHUAL_DIST}`,
      `--load-extension=${NAHUAL_DIST}`,
      "--auto-open-devtools-for-tabs",
      `--remote-debugging-port=${PORT}`,
    ],
  });
  try {
    const app = await context.newPage();
    await app.goto(`${servers.appOrigin}/`);
    await app.waitForTimeout(1500);
    const devtoolsTargets = (await targets()).filter((t) => t.url.startsWith("devtools://"));
    test.skip(devtoolsTargets.length === 0, "sin destino devtools://: hacer D2 a mano");
    let panelTarget: TargetInfo | undefined;
    let devtools: Awaited<ReturnType<typeof connect>> | undefined;
    // Ctrl+[ desde Elements va a la pestaña anterior con vuelta: la última es la de la extensión.
    for (const target of devtoolsTargets) {
      const client = await connect(target.webSocketDebuggerUrl);
      await client.key("[", "BracketLeft", 219, 2);
      await app.waitForTimeout(1500);
      panelTarget = (await targets()).find((t) => t.url.includes("/src/panel/panel.html"));
      if (panelTarget) {
        devtools = client;
        break;
      }
      client.close();
    }
    test.skip(!panelTarget || !devtools, "el panel de Nahual no se abrió con Ctrl+[");
    if (!panelTarget || !devtools) return;
    const panel = await connect(panelTarget.webSocketDebuggerUrl);
    const tools = devtools;

    const trial = async () => {
      const focused = await panel.evaluate(OPEN_DIALOG);
      const before = await tools.evaluate(DRAWER);
      await tools.key("Escape", "Escape", 27);
      await app.waitForTimeout(800);
      return {
        focused,
        drawerHeightBefore: before,
        drawerHeightAfter: await tools.evaluate(DRAWER),
        dialogClosed: await panel.evaluate(DIALOG_CLOSED),
      };
    };

    const plain = await trial();
    await panel.evaluate(`(() => {
      window.addEventListener("keydown", (e) => {
        if (e.key === "Escape") e.stopPropagation();
      }, true);
      return true;
    })()`);
    const stopped = await trial();
    saveResult("d2-escape", {
      userAgent: await app.evaluate(() => navigator.userAgent),
      plain,
      stopPropagationInCapture: stopped,
    });
    panel.close();
    tools.close();
  } finally {
    await context.close();
    await servers.close();
  }
});
