import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";

export interface TestServers {
  /** Origen A: la página "app" que se inspecciona. */
  appOrigin: string;
  /** Origen B: la API, en otro puerto (otro origen). */
  apiOrigin: string;
  /** Headers recibidos por la API en orden de llegada. */
  received: { path: string; method: string; headers: IncomingMessage["headers"] }[];
  close(): Promise<void>;
}

const APP_PAGE = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>Nahual test app</title></head>
<body><h1>Nahual test app</h1><pre id="out"></pre></body></html>`;

function listen(server: Server): Promise<string> {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve(`http://127.0.0.1:${port}`);
    });
  });
}

export async function startServers(): Promise<TestServers> {
  const received: TestServers["received"] = [];
  let appOrigin = "";

  const app = createServer((req, res) => {
    if (req.url === "/load") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(readFileSync(new URL("./load-page.html", import.meta.url)));
      return;
    }
    if (req.url === "/" || req.url?.startsWith("/?") || req.url === "/next") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(APP_PAGE);
      return;
    }
    res.writeHead(404).end();
  });

  const cors = (res: ServerResponse) => {
    res.setHeader("access-control-allow-origin", appOrigin);
    res.setHeader("access-control-allow-headers", "content-type, x-custom");
    res.setHeader("access-control-allow-methods", "GET, POST, PUT");
    res.setHeader("access-control-expose-headers", "x-nahual-response");
  };

  const api = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    received.push({ path: url.pathname, method: req.method ?? "", headers: req.headers });
    switch (url.pathname) {
      case "/echo-headers":
        cors(res);
        if (req.method === "OPTIONS") {
          res.writeHead(204).end();
          return;
        }
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ headers: req.headers }));
        return;
      case "/data":
        cors(res);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
        return;
      case "/redirect":
        cors(res);
        res.writeHead(302, { location: "/data" }).end();
        return;
      case "/no-cors":
        // Sin headers CORS: para los experimentos E1/E2.
        if (req.method === "OPTIONS") {
          res.writeHead(Number(url.searchParams.get("preflight") ?? 204)).end();
          return;
        }
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
        return;
      default:
        res.writeHead(404).end();
    }
  });

  appOrigin = await listen(app);
  const apiOrigin = await listen(api);

  return {
    appOrigin,
    apiOrigin,
    received,
    close: async () => {
      await Promise.all(
        [app, api].map(
          (s) =>
            new Promise<void>((resolve) => {
              s.closeAllConnections();
              s.close(() => resolve());
            }),
        ),
      );
    },
  };
}
