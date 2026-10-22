import { openApp, tabIdOf } from "../fixtures/panel.ts";
import { test } from "../fixtures/extension.ts";
import { installLab, labEvents, labSend, saveResult, setPolicy } from "./cdp-lab.ts";

test("E1: ¿los preflight CORS (OPTIONS) llegan a Fetch.requestPaused?", async ({
  context,
  nahualWorker,
  servers,
}) => {
  const app = await openApp(context, servers.appOrigin);
  const tabId = await tabIdOf(nahualWorker, `${servers.appOrigin}/`);
  await installLab(nahualWorker, tabId);
  await setPolicy(nahualWorker, { name: "continue" });
  await labSend(nahualWorker, tabId, "Network.enable");
  await labSend(nahualWorker, tabId, "Fetch.enable", {
    patterns: [
      { urlPattern: "*", requestStage: "Request" },
      { urlPattern: "*", requestStage: "Response" },
    ],
  });

  const fetchResult = await app.evaluate(async (url) => {
    try {
      const r = await fetch(url, { method: "PUT", headers: { "x-custom": "1" }, body: "{}" });
      return { ok: true, status: r.status };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }, `${servers.apiOrigin}/echo-headers`);

  const events = ((await labEvents(nahualWorker)) as Record<string, unknown>[]).filter(
    (e) => String(e.url ?? "").includes("/echo-headers") || e.method === "Network.loadingFailed",
  );
  const paused = events.filter((e) => e.method === "Fetch.requestPaused");
  saveResult("e1-preflight", {
    userAgent: await nahualWorker.evaluate(() => navigator.userAgent),
    fetchResult,
    serverSaw: servers.received.filter((r) => r.path === "/echo-headers").map((r) => r.method),
    preflightInNetwork: events.some(
      (e) => e.method === "Network.requestWillBeSent" && e.type === "Preflight",
    ),
    preflightPausedInFetch: paused.some((e) => e.reqMethod === "OPTIONS"),
    pausedSummary: paused.map(
      (e) => `${e.reqMethod} ${e.stage} ${e.resourceType}${e.status ? ` ${e.status}` : ""}`,
    ),
    events,
  });
});
