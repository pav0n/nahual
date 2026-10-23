import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { gzipSync } from "node:zlib";

export interface ReceivedRequest {
  path: string;
  url: string;
  method: string;
  headers: IncomingMessage["headers"];
  body: string;
}

export interface TestServers {
  /** Origen A: la página "app" que se inspecciona. */
  appOrigin: string;
  /** Origen B: la API, en otro puerto (otro origen). */
  apiOrigin: string;
  /** Requests recibidos por la API en orden de llegada. */
  received: ReceivedRequest[];
  close(): Promise<void>;
}

export interface ServerPorts {
  app?: number;
  api?: number;
}

/** Llamadas de la SPA de prueba (quickstart). Cada botón escribe la respuesta en `#out`. */
const CALLS = [
  ["items", "GET", "/api/items"],
  ["empty", "GET", "/api/empty"],
  ["error", "GET", "/api/error"],
  ["gzip", "GET", "/gzip"],
  ["binary", "GET", "/binary"],
  ["big", "GET", "/big"],
  ["redirect", "GET", "/redirect"],
  ["html", "GET", "/api/html"],
  ["echo", "POST", "/echo"],
  ["graphql-user", "POST", "/graphql"],
  ["graphql-user-errors", "POST", "/graphql?errors=1"],
  ["graphql-list", "POST", "/graphql"],
] as const;

const GRAPHQL_BODIES: Record<string, string> = {
  "graphql-user": JSON.stringify({
    operationName: "GetUser",
    query: "query GetUser { user { id } }",
  }),
  "graphql-user-errors": JSON.stringify({
    operationName: "GetUser",
    query: "query GetUser { user { id } }",
  }),
  "graphql-list": JSON.stringify({ query: "query ListUsers { users { id } }" }),
};

function appPage(apiOrigin: string) {
  const buttons = CALLS.map(
    ([id]) => `<button type="button" data-testid="call-${id}">${id}</button>`,
  ).join("\n");
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>Nahual test app</title></head>
<body><h1>Nahual test app</h1>
<nav><a href="/next" data-testid="nav-next">next</a></nav>
${buttons}
<pre id="out"></pre>
<script>
  const API = ${JSON.stringify(apiOrigin)};
  const CALLS = ${JSON.stringify(CALLS)};
  const BODIES = ${JSON.stringify({ ...GRAPHQL_BODIES, echo: JSON.stringify({ hello: "nahual" }) })};
  window.call = async (id) => {
    const [, method, path] = CALLS.find((c) => c[0] === id);
    const init = { method, credentials: "include" };
    if (BODIES[id]) {
      init.body = BODIES[id];
      init.headers = { "content-type": "application/json" };
    }
    try {
      const res = await fetch(API + path, init);
      const text = await res.text();
      const result = { id, status: res.status, body: text.slice(0, 2000) };
      document.getElementById("out").textContent = JSON.stringify(result);
      return result;
    } catch (error) {
      const result = { id, error: String(error) };
      document.getElementById("out").textContent = JSON.stringify(result);
      return result;
    }
  };
  for (const [id] of CALLS) {
    document.querySelector('[data-testid="call-' + id + '"]').addEventListener("click", () => window.call(id));
  }
</script></body></html>`;
}

function listen(server: Server, port = 0): Promise<string> {
  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => {
      const address = server.address() as AddressInfo;
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
}

/** PNG de 1×1 transparente. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

const XSS = `<img src=x onerror="window.__xss=1"><script>window.__xss=1</script>`;

let bigBody: string | null = null;
/** ~6 MB de JSON: por encima del límite de 5 MB de body evaluable. */
function big() {
  bigBody ??= JSON.stringify({
    items: Array.from(
      { length: 120_000 },
      (_, i) => `item-${i}-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`,
    ),
  });
  return bigBody;
}

export async function startServers(ports: ServerPorts = {}): Promise<TestServers> {
  const received: ReceivedRequest[] = [];
  let appOrigin = "";
  let apiOrigin = "";

  const app = createServer((req, res) => {
    if (req.url === "/load") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(readFileSync(new URL("./load-page.html", import.meta.url)));
      return;
    }
    if (req.url === "/" || req.url?.startsWith("/?") || req.url === "/next") {
      res.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "set-cookie": "nahual_session=secret-session-value; Path=/",
      });
      res.end(appPage(apiOrigin));
      return;
    }
    res.writeHead(404).end();
  });

  const cors = (res: ServerResponse) => {
    res.setHeader("access-control-allow-origin", appOrigin);
    res.setHeader("access-control-allow-credentials", "true");
    res.setHeader("access-control-allow-headers", "content-type, x-custom, authorization");
    res.setHeader("access-control-allow-methods", "GET, POST, PUT");
    res.setHeader("access-control-expose-headers", "x-nahual-response, x-evil");
  };

  const json = (res: ServerResponse, status: number, value: unknown) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(value));
  };

  const api = createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? "/", "http://x");
      const body = await readBody(req);
      if (url.pathname !== "/received") {
        received.push({
          path: url.pathname,
          url: req.url ?? "/",
          method: req.method ?? "",
          headers: req.headers,
          body,
        });
      }
      if (url.pathname !== "/no-cors") {
        cors(res);
        if (req.method === "OPTIONS") {
          res.writeHead(204).end();
          return;
        }
      }
      switch (url.pathname) {
        case "/echo-headers":
          return json(res, 200, { headers: req.headers });
        case "/data":
          return json(res, 200, { ok: true });
        case "/api/items":
          return json(res, 200, { items: [1, 2] });
        case "/api/empty":
          return json(res, 200, { items: [] });
        case "/api/error":
          return json(res, 500, { error: "boom" });
        case "/api/html":
          res.writeHead(200, { "content-type": "text/html; charset=utf-8", "x-evil": XSS });
          res.end(XSS);
          return;
        case "/gzip": {
          const zipped = gzipSync(JSON.stringify({ compressed: true, items: [1, 2, 3] }));
          res.writeHead(200, {
            "content-type": "application/json",
            "content-encoding": "gzip",
            "content-length": String(zipped.length),
          });
          res.end(zipped);
          return;
        }
        case "/binary":
          res.writeHead(200, { "content-type": "image/png", "content-length": String(PNG.length) });
          res.end(PNG);
          return;
        case "/big":
          res.writeHead(200, { "content-type": "application/json" });
          res.end(big());
          return;
        case "/graphql": {
          let operation = "";
          try {
            const parsed = JSON.parse(body) as { operationName?: string; query?: string };
            operation =
              parsed.operationName ??
              /\b(?:query|mutation)\s+(\w+)/.exec(parsed.query ?? "")?.[1] ??
              "";
          } catch {
            // Body no JSON: se responde igual.
          }
          if (url.searchParams.get("errors") === "1") {
            return json(res, 200, { data: null, errors: [{ message: "not found" }] });
          }
          return json(res, 200, { data: { operation } });
        }
        case "/echo":
          return json(res, 200, { method: req.method, url: req.url, headers: req.headers, body });
        case "/received":
          return json(res, 200, received);
        case "/redirect":
          res.writeHead(302, { location: "/data" }).end();
          return;
        case "/no-cors":
          // Sin headers CORS: para los experimentos E1/E2.
          if (req.method === "OPTIONS") {
            res.writeHead(Number(url.searchParams.get("preflight") ?? 204)).end();
            return;
          }
          return json(res, 200, { ok: true });
        default:
          res.writeHead(404).end();
      }
    })();
  });

  appOrigin = await listen(app, ports.app);
  apiOrigin = await listen(api, ports.api);

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
