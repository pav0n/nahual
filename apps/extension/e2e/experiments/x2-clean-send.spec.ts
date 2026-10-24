import { openApp, openPanel, tabIdOf } from "../fixtures/panel.ts";
import { test } from "../fixtures/extension.ts";
import { saveResult } from "./cdp-lab.ts";

// 005-X2 (research R5): ¿el panel puede pedir un host opcional en un clic, y con él el `fetch` del
// SW con `credentials: "omit"` lee una respuesta sin CORS y no hereda cookies? Las E2E abren el
// panel como pestaña: dentro de DevTools se comprueba a mano (quickstart, paso 3). El build de
// pruebas concede `http://127.0.0.1/*` (el diálogo del permiso no se puede contestar desde
// Playwright); `localhost` queda sin conceder para probar la petición.

test("X2: permiso opcional por origen y fetch del service worker", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  const app = await openApp(context, servers.appOrigin);
  const tabId = await tabIdOf(nahualWorker, `${servers.appOrigin}/`);
  const panel = await openPanel(context, extensionId, tabId);
  const origin = `${servers.apiOrigin.replace("127.0.0.1", "localhost")}/*`;
  const granted = `${servers.apiOrigin}/*`;

  const swFetch = (path: string) =>
    nahualWorker.evaluate(async (url) => {
      try {
        const r = await fetch(url, {
          credentials: "omit",
          cache: "no-store",
          headers: { authorization: "Bearer written-by-dev" },
        });
        return { ok: true, status: r.status, body: (await r.text()).slice(0, 2000) };
      } catch (e) {
        return { ok: false, error: String(e) };
      }
    }, `${servers.apiOrigin}${path}`);

  const before = {
    grantedByTestBuild: await nahualWorker.evaluate(
      (o) => chrome.permissions.contains({ origins: [o] }),
      granted,
    ),
    contains: await nahualWorker.evaluate(
      (o) => chrome.permissions.contains({ origins: [o] }),
      origin,
    ),
    noCors: await swFetch("/no-cors"),
  };

  // Petición en un gesto del usuario: un botón añadido al panel.
  await panel.evaluate((o) => {
    const button = document.createElement("button");
    button.id = "x2-request";
    button.textContent = "x2";
    button.addEventListener("click", () => {
      const w = window as unknown as { __x2?: unknown };
      w.__x2 = "pending";
      chrome.permissions.request({ origins: [o] }).then(
        (granted) => (w.__x2 = { granted }),
        (e: unknown) => (w.__x2 = { error: String(e) }),
      );
    });
    document.body.append(button);
  }, origin);
  await panel.click("#x2-request");
  await panel.waitForTimeout(3000);
  const request = await panel.evaluate(() => (window as unknown as { __x2?: unknown }).__x2);

  const after = {
    contains: await nahualWorker.evaluate(
      (o) => chrome.permissions.contains({ origins: [o] }),
      origin,
    ),
    // Con acceso (127.0.0.1 en el build de pruebas).
    noCors: await swFetch("/no-cors"),
    echo: await swFetch("/echo"),
  };
  const echoHeaders = after.echo.ok
    ? (JSON.parse(after.echo.body ?? "{}") as { headers: Record<string, string> }).headers
    : {};
  saveResult("005-x2-clean-send", {
    before,
    request,
    after: { contains: after.contains, noCors: after.noCors },
    echo: {
      cookie: echoHeaders.cookie ?? null,
      authorization: echoHeaders.authorization ?? null,
      origin: echoHeaders.origin ?? null,
    },
  });
  void app;
});
