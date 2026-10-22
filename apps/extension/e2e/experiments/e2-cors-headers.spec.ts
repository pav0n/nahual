import { openApp, tabIdOf } from "../fixtures/panel.ts";
import { test } from "../fixtures/extension.ts";
import {
  installLab,
  labEvents,
  labSend,
  saveResult,
  setPolicy,
  type LabPolicy,
} from "./cdp-lab.ts";

interface Case {
  id: string;
  description: string;
  path: string;
  init: {
    method?: string;
    headers?: Record<string, string>;
    credentials?: "include";
    body?: string;
  };
  policy: (origin: string) => LabPolicy;
}

const cases: Case[] = [
  {
    id: "A0",
    description: "Control: GET simple sin CORS y sin cambios",
    path: "/no-cors",
    init: {},
    policy: () => ({ name: "continue" }),
  },
  {
    id: "A",
    description: "GET simple: añadir Access-Control-Allow-Origin exacto en Response",
    path: "/no-cors",
    init: {},
    policy: (o) => ({ name: "addCors", origin: o, credentials: false }),
  },
  {
    id: "B",
    description: "GET con credenciales: ACAO exacto + Allow-Credentials en Response",
    path: "/no-cors",
    init: { credentials: "include" },
    policy: (o) => ({ name: "addCors", origin: o, credentials: true }),
  },
  {
    id: "B2",
    description: "Con credenciales pero sin Allow-Credentials",
    path: "/no-cors",
    init: { credentials: "include" },
    policy: (o) => ({ name: "addCors", origin: o, credentials: false }),
  },
  {
    id: "C",
    description: "PUT con preflight rechazado (404): solo se modifica la etapa Response",
    path: "/no-cors?preflight=404",
    init: { method: "PUT", headers: { "x-custom": "1" }, body: "{}" },
    policy: (o) => ({ name: "addCors", origin: o, credentials: false }),
  },
  {
    id: "D",
    description: "PUT con preflight rechazado (404): se responde el preflight con fulfillRequest",
    path: "/no-cors?preflight=404",
    init: { method: "PUT", headers: { "x-custom": "1" }, body: "{}" },
    policy: (o) => ({ name: "fulfillPreflight", origin: o, credentials: false }),
  },
];

test("E2: ¿basta modificar Access-Control-* en la etapa Response?", async ({
  context,
  nahualWorker,
  servers,
}) => {
  const app = await openApp(context, servers.appOrigin);
  const tabId = await tabIdOf(nahualWorker, `${servers.appOrigin}/`);
  const consoleErrors: string[] = [];
  app.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });
  await installLab(nahualWorker, tabId);
  await labSend(nahualWorker, tabId, "Network.enable");
  await labSend(nahualWorker, tabId, "Fetch.enable", {
    patterns: [
      { urlPattern: "*no-cors*", requestStage: "Request" },
      { urlPattern: "*no-cors*", requestStage: "Response" },
    ],
  });

  const results = [];
  for (const c of cases) {
    await setPolicy(nahualWorker, c.policy(servers.appOrigin));
    consoleErrors.length = 0;
    const before = servers.received.length;
    const outcome = await app.evaluate(
      async ([url, init]) => {
        try {
          const r = await fetch(url as string, init as RequestInit);
          return { ok: true, status: r.status, body: await r.text() };
        } catch (e) {
          return { ok: false, error: String(e) };
        }
      },
      [`${servers.apiOrigin}${c.path}`, c.init] as const,
    );
    await app.waitForTimeout(200);
    const events = (await labEvents(nahualWorker)) as Record<string, unknown>[];
    results.push({
      ...c,
      policy: c.policy("<origen de la app>"),
      outcome,
      serverSaw: servers.received.slice(before).map((r) => r.method),
      fetchPaused: events
        .filter((e) => e.method === "Fetch.requestPaused")
        .map((e) => `${e.reqMethod} ${e.stage}`),
      corsErrors: events
        .filter((e) => e.method === "Network.loadingFailed")
        .map((e) => e.corsErrorStatus ?? e.errorText),
      labErrors: events.filter((e) => e.method === "lab.error"),
      console: [...consoleErrors],
    });
  }
  saveResult("e2-cors-headers", {
    userAgent: await nahualWorker.evaluate(() => navigator.userAgent),
    results,
  });
});
