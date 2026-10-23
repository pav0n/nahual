import { openApp, tabIdOf } from "../fixtures/panel.ts";
import { test } from "../fixtures/extension.ts";
import { installLab, labEvents, labSend, saveResult, setPolicy } from "./cdp-lab.ts";

// 003-X1 (research R5): ¿`Fetch.requestPaused` en etapa Response trae `Cookie`? ¿Llega
// `requestWillBeSentExtraInfo` antes de la etapa Response?
test("X1: señal de credenciales en Fetch y en Network", async ({
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
  await setPolicy(nahualWorker, { name: "continue" });

  const run = async (label: string) => {
    const outcome = await app.evaluate(async (url) => {
      try {
        const r = await fetch(url, { credentials: "include" });
        return { ok: true, status: r.status };
      } catch (e) {
        return { ok: false, error: String(e) };
      }
    }, `${servers.apiOrigin}/cors/no-credentials`);
    await app.waitForTimeout(300);
    const events = (await labEvents(nahualWorker)) as Record<string, unknown>[];
    const paused = events.find((e) => e.method === "Fetch.requestPaused" && e.stage === "Response");
    const networkId = paused?.networkId;
    const order = events
      .filter((e) => e.requestId === networkId || e.networkId === networkId)
      .map((e) => `${e.method as string}${e.stage ? ` (${e.stage as string})` : ""}`);
    const extra = events.find(
      (e) => e.method === "Network.requestWillBeSentExtraInfo" && e.requestId === networkId,
    );
    return {
      label,
      outcome,
      fetchResponseStageHasCookie: (paused?.requestHeaders as string[] | undefined)?.includes(
        "cookie",
      ),
      fetchRequestHeaders: paused?.requestHeaders,
      extraInfoHasCookie: (extra?.requestHeaders as string[] | undefined)?.includes("cookie"),
      extraInfoHasOrigin: (extra?.requestHeaders as string[] | undefined)?.includes("origin"),
      order,
    };
  };

  const withCookie = await run("credentials include, con cookie");
  await context.clearCookies();
  const withoutCookie = await run("credentials include, sin cookie");
  saveResult("x1-cors-credentials", {
    userAgent: await nahualWorker.evaluate(() => navigator.userAgent),
    withCookie,
    withoutCookie,
  });
});
