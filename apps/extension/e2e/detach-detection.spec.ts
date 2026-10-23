import {
  attach,
  createRule,
  openApp,
  openPanel,
  openQueue,
  ownSessions,
  pausedOption,
  startFetch,
  statusOf,
  tabIdOf,
} from "./fixtures/panel.ts";
import { expect, test } from "./fixtures/extension.ts";

test.use({ withConflictExtension: true });

test("cerrar la pestaña objetivo ⇒ desconectado (target_closed) en < 1 s", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const app = await openApp(context, servers.appOrigin);
  const tabId = await tabIdOf(nahualWorker, `${servers.appOrigin}/`);
  const panel = await openPanel(context, extensionId, tabId);
  await attach(panel);

  await app.close();
  await expect(statusOf(panel)).toContainText("Disconnected", { timeout: 1_000 });
  await expect(statusOf(panel)).toContainText("The tab was closed");
  expect(await ownSessions(nahualWorker)).toEqual([]);
});

test("con otra extensión ya adjunta, Nahual coexiste: adjunta, pausa y continúa (E3 d)", async ({
  context,
  nahualWorker,
  conflictWorker,
  extensionId,
  servers,
}) => {
  // Hallazgo del spike: Chrome admite varios clientes de chrome.debugger por pestaña, así que
  // otro cliente adjunto no provoca "en conflicto" (ese estado queda para errores de attach).
  const app = await openApp(context, servers.appOrigin);
  const tabId = await tabIdOf(nahualWorker, `${servers.appOrigin}/`);
  const panel = await openPanel(context, extensionId, tabId);

  await conflictWorker.evaluate(
    (id) => (globalThis as never as Conflict).conflict.attach(id),
    tabId,
  );
  await attach(panel);
  expect(await ownSessions(nahualWorker)).toEqual([tabId]);

  await createRule(panel, { name: "Echo", pattern: "*echo-headers*", stage: "request" });
  const response = startFetch(app, `${servers.apiOrigin}/echo-headers`);
  await openQueue(panel);
  await expect(pausedOption(panel, "/echo-headers")).toBeVisible();
  await panel.keyboard.press("Alt+Shift+C");
  expect((await response).status).toBe(200);

  // Si el otro cliente se suelta, Nahual sigue adjunto.
  await conflictWorker.evaluate(
    (id) => (globalThis as never as Conflict).conflict.detach(id),
    tabId,
  );
  await panel.waitForTimeout(300);
  await expect(statusOf(panel)).toContainText("Attached");
});

test("E3 (d): otra extensión intenta adjuntarse con Nahual ya adjunto", async ({
  context,
  nahualWorker,
  conflictWorker,
  extensionId,
  servers,
}) => {
  await openApp(context, servers.appOrigin);
  const tabId = await tabIdOf(nahualWorker, `${servers.appOrigin}/`);
  const panel = await openPanel(context, extensionId, tabId);
  await attach(panel);

  const result = await conflictWorker.evaluate(
    (id) =>
      (globalThis as never as Conflict).conflict.attach(id).then(
        () => "attached",
        (e: Error) => `error: ${e.message}`,
      ),
    tabId,
  );
  await panel.waitForTimeout(500);
  const nahualStatus = (await statusOf(panel).textContent()) ?? "";
  test.info().annotations.push({
    type: "E3(d)",
    description: `auxiliar: ${result}; Nahual: ${nahualStatus.trim()}`,
  });
  console.log(`[E3 d] auxiliar: ${result} | Nahual: ${nahualStatus.trim()}`);
  // Sea cual sea el resultado, Nahual no queda en un estado incoherente.
  const own = await ownSessions(nahualWorker);
  if (nahualStatus.includes("Attached")) expect(own).toContain(tabId);
  else expect(own).not.toContain(tabId);
});

interface Conflict {
  conflict: { attach(tabId: number): Promise<void>; detach(tabId: number): Promise<void> };
}
