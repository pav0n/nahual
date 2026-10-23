import { openApp, tabIdOf } from "../fixtures/panel.ts";
import { test } from "../fixtures/extension.ts";
import { installLab, labEvents, labSend, saveResult, setPolicy } from "./cdp-lab.ts";

// 003-X4 (research R7): tras `Fetch.continueResponse` con headers cambiados, ¿qué headers
// reportan `Network.responseReceived` y `responseReceivedExtraInfo`?
test("X4: headers que ve Network tras modificar la respuesta", async ({
  context,
  nahualWorker,
  servers,
}) => {
  const app = await openApp(context, servers.appOrigin);
  const tabId = await tabIdOf(nahualWorker, `${servers.appOrigin}/`);
  await installLab(nahualWorker, tabId);
  await labSend(nahualWorker, tabId, "Network.enable");
  await labSend(nahualWorker, tabId, "Fetch.enable", {
    patterns: [{ urlPattern: `${servers.apiOrigin}/cors/*`, requestStage: "Response" }],
  });
  await setPolicy(nahualWorker, { name: "markResponse", origin: servers.appOrigin });

  const outcome = await app.evaluate(async (url) => {
    try {
      const r = await fetch(url);
      return { ok: true, status: r.status };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }, `${servers.apiOrigin}/cors/none`);
  await app.waitForTimeout(300);
  const events = (await labEvents(nahualWorker)) as Record<string, unknown>[];
  const lower = (h: unknown) => Object.keys((h ?? {}) as object).map((k) => k.toLowerCase());
  const received = events.find((e) => e.method === "Network.responseReceived");
  const extra = events.find((e) => e.method === "Network.responseReceivedExtraInfo");
  saveResult("x4-network-headers", {
    userAgent: await nahualWorker.evaluate(() => navigator.userAgent),
    outcome,
    responseReceived: {
      hasMarker: lower(received?.headers).includes("x-nahual-marker"),
      hasAcao: lower(received?.headers).includes("access-control-allow-origin"),
    },
    responseReceivedExtraInfo: {
      present: extra !== undefined,
      hasMarker: lower(extra?.headers).includes("x-nahual-marker"),
      hasAcao: lower(extra?.headers).includes("access-control-allow-origin"),
    },
  });
});
