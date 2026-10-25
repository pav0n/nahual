import {
  attachAndReload,
  appFetch,
  hookExecutions,
  installHook,
  openApp,
  openPanel,
  tabIdOf,
} from "./fixtures/panel.ts";
import { expect, test } from "./fixtures/extension.ts";

// 006 (SC-001, FR-031, FR-032, research R17): cada vector de escape del sandbox falla sin efecto
// sobre el intercambio, la página ni la red. Escrita antes del runtime (T022).

const ITEMS = '{"status":"ok","items":[1,2,3]}';

/** Cuerpo de un hook que intenta un vector; `LEAK` se reemplaza por la URL de `/leak`. */
const VECTORS: Record<string, string> = {
  fetch: `await fetch(LEAK);`,
  xhr: `const x = new XMLHttpRequest(); x.open("GET", LEAK, false); x.send();`,
  websocket: `new WebSocket(LEAK.replace("http", "ws"));`,
  eventSource: `new EventSource(LEAK);`,
  importScripts: `(self as any).importScripts(LEAK);`,
  sendBeacon: `(navigator as any).sendBeacon(LEAK, "x");`,
  chrome: `(chrome as any).runtime.sendMessage({ leak: true });`,
  parent: `(parent as any).postMessage(LEAK, "*");`,
  top: `(top as any).location.href = LEAK;`,
  opener: `(opener as any).postMessage(LEAK, "*");`,
  cookie: `ctx.log((document as any).cookie);`,
  localStorage: `(localStorage as any).setItem("x", "y");`,
  indexedDB: `(indexedDB as any).open("leak");`,
  worker: `new Worker(LEAK);`,
  location: `(location as any).href = LEAK;`,
  dynamicImport: `await import(LEAK);`,
};

for (const [name, attempt] of Object.entries(VECTORS)) {
  for (const target of ["api", "third"] as const) {
    test(`SC-001: ${name} hacia ${target} falla sin efecto`, async ({
      context,
      nahualWorker,
      extensionId,
      servers,
    }) => {
      const app = await openApp(context, servers.appOrigin);
      const tabId = await tabIdOf(nahualWorker, `${servers.appOrigin}/`);
      const panel = await openPanel(context, extensionId, tabId);
      await attachAndReload(panel, app);
      const leak = `${target === "api" ? servers.apiOrigin : servers.thirdOrigin}/leak?v=${name}`;
      await installHook(panel, {
        name: `escape ${name}`,
        stage: "response",
        prefilter: "*/hooks/items*",
        source: `// @ts-nocheck
const LEAK = ${JSON.stringify(leak)};
export default async (ctx: HookContext) => {
  ${attempt}
  if (ctx.response) ctx.response.body = "escaped";
  return ctx;
};`,
      });
      const response = await appFetch(app, `${servers.apiOrigin}/hooks/items`);
      expect(response).toEqual({ status: 200, body: ITEMS });
      await expect
        .poll(async () => (await hookExecutions(panel)).map((e) => e.result))
        .toEqual(["hook_failed"]);
      const [execution] = await hookExecutions(panel);
      expect(["access_denied", "exception"]).toContain(execution?.errorType);
      await panel.waitForTimeout(300);
      expect(servers.leaks).toEqual([]);
    });
  }
}
