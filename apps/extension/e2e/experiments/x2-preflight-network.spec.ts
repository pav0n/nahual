import { openApp, tabIdOf } from "../fixtures/panel.ts";
import { test } from "../fixtures/extension.ts";
import { installLab, labEvents, labSend, saveResult, setPolicy } from "./cdp-lab.ts";

// 003-X2 (research R6): ¿el preflight llega por Network y con qué `initiator`?
// 003-X5 (research R1): ¿un preflight 401/302 se pausa en etapa Response y acepta
// `fulfillRequest` 204?
test("X2 y X5: preflight en Network y en la etapa Response de Fetch", async ({
  context,
  nahualWorker,
  servers,
}) => {
  const app = await openApp(context, servers.appOrigin);
  const tabId = await tabIdOf(nahualWorker, `${servers.appOrigin}/`);
  await installLab(nahualWorker, tabId);
  await labSend(nahualWorker, tabId, "Network.enable");
  await setPolicy(nahualWorker, { name: "continue" });

  const fetchFrom = async (path: string) => {
    const url = `${servers.apiOrigin}${path}`;
    return app.evaluate(async (u) => {
      try {
        const r = await fetch(u, { method: "PUT", headers: { "x-custom": "1" }, body: "{}" });
        return { ok: true, status: r.status };
      } catch (e) {
        return { ok: false, error: String(e) };
      }
    }, url);
  };

  // X2: solo Network.
  const x2 = [];
  for (const path of ["/cors/preflight-401", "/cors/ok"]) {
    const before = servers.received.length;
    const outcome = await fetchFrom(path);
    await app.waitForTimeout(300);
    const events = (await labEvents(nahualWorker)) as Record<string, unknown>[];
    x2.push({
      path,
      outcome,
      serverSaw: servers.received.slice(before).map((r) => r.method),
      network: events
        .filter((e) => String(e.method).startsWith("Network."))
        .map((e) => ({
          method: e.method,
          type: e.type,
          reqMethod: e.reqMethod,
          initiator: e.initiator,
          status: e.status,
          corsErrorStatus: e.corsErrorStatus,
        })),
    });
  }

  // X5: Fetch en etapa Response; el preflight se reemplaza por 204 local con fulfillRequest o
  // con continueResponse. Como respaldo (D5 de 001), fulfillRequest en etapa Request.
  const x5 = [];
  const variants = [
    ["fulfillPreflightAtResponse", "Response"],
    ["continuePreflightAtResponse", "Response"],
    ["fulfillPreflight", "Request"],
  ] as const;
  for (const [name, stage] of variants) {
    await labSend(nahualWorker, tabId, "Fetch.enable", {
      patterns: [
        { urlPattern: `${servers.apiOrigin}/cors/*`, requestStage: stage },
        { urlPattern: `${servers.apiOrigin}/cors/*`, requestStage: "Response" },
      ],
    });
    await setPolicy(nahualWorker, { name, origin: servers.appOrigin, credentials: false });
    for (const path of ["/cors/preflight-401", "/cors/preflight-redirect"]) {
      const before = servers.received.length;
      const outcome = await fetchFrom(path);
      await app.waitForTimeout(300);
      const events = (await labEvents(nahualWorker)) as Record<string, unknown>[];
      x5.push({
        variant: name,
        path,
        outcome,
        serverSaw: servers.received.slice(before).map((r) => r.method),
        fetchPaused: events
          .filter((e) => e.method === "Fetch.requestPaused")
          .map((e) => `${e.reqMethod as string} ${e.stage as string} ${String(e.status ?? "")}`),
        labErrors: events.filter((e) => e.method === "lab.error"),
        corsErrors: events
          .filter((e) => e.method === "Network.loadingFailed")
          .map((e) => e.corsErrorStatus ?? e.errorText),
      });
    }
  }

  saveResult("x2-preflight-network", {
    userAgent: await nahualWorker.evaluate(() => navigator.userAgent),
    x2,
    x5,
  });
});
