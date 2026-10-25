import { openApp, openPanel, tabIdOf } from "../fixtures/panel.ts";
import { expect, test } from "../fixtures/extension.ts";
import { saveResult } from "./cdp-lab.ts";

// 005-X3 (research R12): ¿Vite + crxjs empaquetan el worker del diff como archivo propio que
// carga bajo la CSP `script-src 'self'` del panel?
test("X3: worker del diff bajo la CSP del panel", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  await openApp(context, servers.appOrigin);
  const tabId = await tabIdOf(nahualWorker, `${servers.appOrigin}/`);
  const panel = await openPanel(context, extensionId, tabId);
  const violations: string[] = [];
  panel.on("console", (m) => {
    if (/Content Security Policy/i.test(m.text())) violations.push(m.text());
  });
  const reply = await panel.evaluate(() =>
    (window as unknown as { __nahualDiffWorkerPing(): Promise<string> }).__nahualDiffWorkerPing(),
  );
  saveResult("005-x3-worker", { reply, violations });
  expect(reply).toBe("pong");
  expect(violations).toEqual([]);
});
