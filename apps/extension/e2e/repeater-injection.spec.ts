import {
  attachAndReload,
  callApi,
  openApp,
  openPanel,
  repeater,
  repeaterSend,
  sendToRepeater,
  tabIdOf,
  trafficRow,
} from "./fixtures/panel.ts";
import { expect, test } from "./fixtures/extension.ts";

// 005 SC-004 (research R1, contracts/panel-protocol.md): lo que el dev escribe en URL, headers y
// body viaja como datos; nada se ejecuta en la página ni en la extensión.

const PAYLOADS = [
  '"); globalThis.__pwned=1; ("',
  "</script><script>globalThis.__pwned=2</script>",
  "${globalThis.__pwned=3}",
  "`; globalThis.__pwned=4; `",
  "\n//# sourceURL=x\n})(); globalThis.__pwned=5; (function(){",
];

test("SC-004: cargas de inyección en URL, header y body no se ejecutan y llegan literales", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const app = await openApp(context, servers.appOrigin);
  const tabId = await tabIdOf(nahualWorker, `${servers.appOrigin}/`);
  const panel = await openPanel(context, extensionId, tabId);
  await panel.setViewportSize({ width: 1200, height: 800 });
  await attachAndReload(panel, app);
  await callApi(app, "echo");
  await sendToRepeater(panel, trafficRow(panel, "/echo").filter({ hasText: "POST" }).last());
  const r = repeater(panel);

  for (const [i, payload] of PAYLOADS.entries()) {
    const before = servers.received.length;
    await r
      .getByLabel("URL", { exact: true })
      .fill(`${servers.apiOrigin}/echo?q=${encodeURIComponent(payload)}`);
    // El valor de un header no admite saltos de línea: se usa la parte de una línea.
    const oneLine = payload.replaceAll("\n", " ");
    await r.getByRole("button", { name: "Add header" }).click();
    await r
      .getByLabel(/^Header name \d+$/)
      .last()
      .fill("x-custom");
    await r.getByLabel("Value of x-custom").last().fill(oneLine);
    await r.getByLabel("Request body").fill(payload);
    await repeaterSend(panel);
    const received = servers.received.slice(before).find((x) => x.method === "POST");
    expect(received?.url, `URL ${i}`).toBe(`/echo?q=${encodeURIComponent(payload)}`);
    // HTTP recorta los espacios de los extremos del valor de un header.
    expect(received?.headers["x-custom"], `header ${i}`).toBe(oneLine.trim());
    expect(received?.body, `body ${i}`).toBe(payload);
    await r.getByRole("button", { name: "Remove header x-custom" }).last().click();
  }

  expect(await app.evaluate(() => (globalThis as { __pwned?: number }).__pwned ?? null)).toBeNull();
  expect(
    await nahualWorker.evaluate(() => (globalThis as { __pwned?: number }).__pwned ?? null),
  ).toBeNull();
  expect(
    await panel.evaluate(() => (globalThis as { __pwned?: number }).__pwned ?? null),
  ).toBeNull();
});
