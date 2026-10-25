import { openApp, tabIdOf } from "../fixtures/panel.ts";
import { expect, test } from "../fixtures/extension.ts";
import { installLab, labEvents, labSend, saveResult, setPolicy } from "./cdp-lab.ts";

// 005-X1 (research R1, R2): un `fetch` desde un mundo aislado del marco principal, con una
// función fija y el request como argumento, ¿lleva cookies y origen de la app, pasa por Network y
// Fetch, ignora un `window.fetch` reemplazado por la página y deja reconocer su `initiator`?

/** Función fija: el request llega solo como argumento (como `PAGE_SEND`). */
const SEND = `async function (req) {
  const res = await fetch(req.url, { method: req.method, headers: req.headers, credentials: "include" });
  return { status: res.status, body: await res.text() };
}
//# sourceURL=nahual-repeater
`;

test("X1: envío desde un mundo aislado", async ({ context, nahualWorker, servers }) => {
  const app = await openApp(context, servers.appOrigin);
  const tabId = await tabIdOf(nahualWorker, `${servers.appOrigin}/`);
  // La página reemplaza fetch: el mundo aislado no debe usarlo.
  await app.evaluate(() => {
    const w = window as unknown as { fetch: unknown; __hijacked?: boolean };
    w.fetch = () => {
      w.__hijacked = true;
      return Promise.reject(new Error("hijacked"));
    };
  });
  await installLab(nahualWorker, tabId);
  await labSend(nahualWorker, tabId, "Network.enable");
  await setPolicy(nahualWorker, { name: "continue" });
  await labSend(nahualWorker, tabId, "Fetch.enable", {
    patterns: [{ urlPattern: "*/echo*", requestStage: "Response" }],
  });

  const { frameTree } = (await labSend(nahualWorker, tabId, "Page.getFrameTree")) as {
    frameTree: { frame: { id: string } };
  };
  const world = (await labSend(nahualWorker, tabId, "Page.createIsolatedWorld", {
    frameId: frameTree.frame.id,
    worldName: "nahual-repeater",
  })) as { executionContextId: number };

  const injected = `${servers.apiOrigin}/echo?q=");globalThis.__pwned=1;("`;
  const result = (await labSend(nahualWorker, tabId, "Runtime.callFunctionOn", {
    executionContextId: world.executionContextId,
    functionDeclaration: SEND,
    arguments: [{ value: { url: injected, method: "GET", headers: { "x-custom": "1" } } }],
    awaitPromise: true,
    returnByValue: true,
  })) as { result: { value?: { status: number; body: string } }; exceptionDetails?: unknown };
  await app.waitForTimeout(300);
  const events = (await labEvents(nahualWorker)) as Record<string, unknown>[];
  const echo = JSON.parse(result.result.value?.body ?? "{}") as {
    headers: Record<string, string>;
    url: string;
  };
  const sent = events.find(
    (e) => e.method === "Network.requestWillBeSent" && String(e.url).includes("/echo"),
  ) as { initiator?: { type: string; stack?: { callFrames: { url: string }[] } } } | undefined;
  const page = await app.evaluate(() => {
    const w = window as unknown as { __hijacked?: boolean; __pwned?: number };
    return { hijacked: w.__hijacked ?? false, pwned: w.__pwned ?? null };
  });

  const data = {
    status: result.result.value?.status ?? null,
    exception: result.exceptionDetails ?? null,
    cookie: echo.headers?.cookie ?? null,
    origin: echo.headers?.origin ?? null,
    receivedUrl: echo.url,
    network: Boolean(sent),
    fetchPaused: events.some(
      (e) => e.method === "Fetch.requestPaused" && String(e.url).includes("/echo"),
    ),
    initiatorType: sent?.initiator?.type ?? null,
    initiatorUrls: sent?.initiator?.stack?.callFrames.map((f) => f.url) ?? [],
    pageHijacked: page.hijacked,
    pagePwned: page.pwned,
  };
  saveResult("005-x1-isolated-send", data);
  expect(data.status).toBe(200);
  expect(data.pageHijacked).toBe(false);
  expect(data.pagePwned).toBeNull();
});
