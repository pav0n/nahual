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
  /** Origen C: un tercer origen (otra API, página y iframe) para el aislamiento CORS (003). */
  thirdOrigin: string;
  /** Requests recibidos por la API en orden de llegada. */
  received: ReceivedRequest[];
  close(): Promise<void>;
}

export interface ServerPorts {
  app?: number;
  api?: number;
  third?: number;
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

/**
 * Llamadas CORS de 003 (quickstart): `[id, origen, método, ruta, credenciales, headers, body]`.
 * `origen` es `"api"` (B) o `"third"` (C). El resultado incluye `x-total` si la página puede
 * leerlo (Expose-Headers).
 */
const CORS_CALLS = [
  ["cors-none", "api", "GET", "/cors/none", false, null, null],
  ["cors-none-cred", "api", "GET", "/cors/none", true, null, null],
  ["cors-mismatch", "api", "GET", "/cors/mismatch", false, null, null],
  ["cors-preflight-401", "api", "PUT", "/cors/preflight-401", false, null, null],
  ["cors-preflight-redirect", "api", "PUT", "/cors/preflight-redirect", false, null, null],
  ["cors-method", "api", "DELETE", "/cors/method", false, null, null],
  ["cors-header", "api", "GET", "/cors/header", false, { "x-custom": "1" }, null],
  ["cors-header-cred", "api", "GET", "/cors/header", true, { "x-custom": "1" }, null],
  ["cors-wildcard-credentials", "api", "GET", "/cors/wildcard-credentials", true, null, null],
  ["cors-no-credentials", "api", "GET", "/cors/no-credentials", true, null, null],
  ["cors-ok", "api", "GET", "/cors/ok", false, null, null],
  [
    "cors-sensitive",
    "api",
    "POST",
    "/cors/sensitive?token=secret-query-token",
    true,
    { authorization: "Bearer secret-auth-token", "content-type": "application/json" },
    JSON.stringify({ password: "secret-body-value" }),
  ],
  ["cors-third", "third", "GET", "/cors/none", false, null, null],
  ["blocked", "api", "GET", "/blocked", false, null, null],
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

function appPage(apiOrigin: string, thirdOrigin: string) {
  const buttons = [...CALLS, ...CORS_CALLS]
    .map(([id]) => `<button type="button" data-testid="call-${id}">${id}</button>`)
    .join("\n");
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>Nahual test app</title></head>
<body><h1>Nahual test app</h1>
<nav><a href="/next" data-testid="nav-next">next</a>
<a href="${thirdOrigin}/page" data-testid="nav-third">third</a></nav>
${buttons}
<button type="button" data-testid="load-frame">frame</button>
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
  const THIRD = ${JSON.stringify(thirdOrigin)};
  const CORS_CALLS = ${JSON.stringify(CORS_CALLS)};
  window.corsCall = async (id) => {
    const [, target, method, path, credentials, headers, body] = CORS_CALLS.find((c) => c[0] === id);
    const init = { method, credentials: credentials ? "include" : "omit" };
    if (headers) init.headers = headers;
    if (body) init.body = body;
    try {
      const res = await fetch((target === "third" ? THIRD : API) + path, init);
      const text = await res.text();
      const result = { id, status: res.status, total: res.headers.get("x-total"), body: text.slice(0, 2000) };
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
  for (const [id] of CORS_CALLS) {
    document.querySelector('[data-testid="call-' + id + '"]').addEventListener("click", () => window.corsCall(id));
  }
  document.querySelector('[data-testid="load-frame"]').addEventListener("click", () => {
    const frame = document.createElement("iframe");
    frame.src = THIRD + "/frame";
    frame.dataset.testid = "third-frame";
    document.body.append(frame);
  });
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

/**
 * Respuestas del diff de 005 (quickstart): `a` frente a `b` tiene un campo añadido, uno
 * eliminado, un tipo cambiado, un elemento de array distinto, un timestamp, un `access_token` y
 * `Set-Cookie`/`Location` con valores sensibles distintos.
 */
const DIFF_A = {
  id: 1,
  name: "a",
  removed: true,
  type: 1,
  list: [1, 2, 3],
  meta: { timestamp: "2026-01-01T00:00:00Z" },
  access_token: "secret-token-a",
};
const DIFF_B = {
  id: 1,
  name: "a",
  added: "new",
  type: "1",
  list: [1, 9, 3],
  meta: { timestamp: "2026-01-02T00:00:00Z" },
  access_token: "secret-token-b",
};
const DIFF_IDS = {
  "1": {
    items: [
      { id: 1, n: "a" },
      { id: 2, n: "b" },
    ],
  },
  "2": {
    items: [
      { id: 2, n: "b" },
      { id: 1, n: "a" },
      { id: 3, n: "c" },
    ],
  },
};
const DIFF_TEXT = { "1": "uno\ndos\ntres\n", "2": "uno\nDOS\ntres\ncuatro\n" };

/** ~1 MB de JSON determinista; `seed` cambia unos pocos valores (SC-003). */
function diffBig(seed: number) {
  return JSON.stringify({
    rows: Array.from({ length: 9000 }, (_, i) => ({
      id: i,
      label: `row-${i}-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`,
      value: i % 1000 === 0 ? i + seed : i,
      tags: ["a", "b", "c"],
    })),
  });
}

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
  let thirdOrigin = "";

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
      res.end(appPage(apiOrigin, thirdOrigin));
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
      if (url.pathname.startsWith("/cors/")) {
        corsRoute(url.pathname, req, res);
        return;
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
        case "/blocked":
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
        case "/diff/a":
        case "/diff/b":
          res.writeHead(200, {
            "content-type": "application/json",
            "set-cookie": `sid=secret-cookie-${url.pathname.slice(-1)}; Path=/`,
            location: `/next?token=secret-loc-${url.pathname.slice(-1)}&x=1`,
          });
          res.end(JSON.stringify(url.pathname === "/diff/a" ? DIFF_A : DIFF_B));
          return;
        case "/diff/ids":
          return json(res, 200, DIFF_IDS[url.searchParams.get("v") === "2" ? "2" : "1"]);
        case "/diff/text":
          res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
          res.end(DIFF_TEXT[url.searchParams.get("v") === "2" ? "2" : "1"]);
          return;
        case "/diff/big":
          res.writeHead(200, { "content-type": "application/json" });
          res.end(diffBig(Number(url.searchParams.get("seed") ?? 0)));
          return;
        case "/diff/html":
          res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
          res.end(`${XSS}<p>v${url.searchParams.get("v") ?? "1"}</p>`);
          return;
        case "/slow":
          await new Promise((r) => setTimeout(r, Number(url.searchParams.get("ms") ?? 3000)));
          return json(res, 200, { slow: true });
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

  /**
   * Rutas CORS de 003 (quickstart). Cada una provoca una causa de bloqueo concreta; `/cors/ok`
   * responde bien (con `x-total`, sin exponerlo).
   */
  function corsRoute(pathname: string, req: IncomingMessage, res: ServerResponse) {
    const preflight = req.method === "OPTIONS";
    const exact = { "access-control-allow-origin": appOrigin };
    const data = (headers: Record<string, string> = {}) => {
      res.writeHead(200, { "content-type": "application/json", ...headers });
      res.end(JSON.stringify({ ok: true, path: pathname }));
    };
    switch (pathname) {
      case "/cors/none":
      case "/cors/sensitive":
        if (preflight) return void res.writeHead(204).end();
        return data();
      case "/cors/mismatch":
        return preflight
          ? void res.writeHead(204, { "access-control-allow-origin": "https://otro.example" }).end()
          : data({ "access-control-allow-origin": "https://otro.example" });
      case "/cors/preflight-401":
        if (preflight) return void res.writeHead(401).end();
        return data();
      case "/cors/preflight-redirect":
        if (preflight) return void res.writeHead(302, { location: "/cors/ok" }).end();
        return data();
      case "/cors/method":
        if (preflight) {
          res.writeHead(204, {
            ...exact,
            "access-control-allow-methods": "GET, POST",
            "access-control-allow-headers": "content-type",
          });
          return void res.end();
        }
        return data(exact);
      case "/cors/header": {
        const base = { ...exact, "access-control-allow-credentials": "true" };
        if (preflight) {
          res.writeHead(204, {
            ...base,
            "access-control-allow-methods": "GET",
            "access-control-allow-headers": "content-type",
          });
          return void res.end();
        }
        return data(base);
      }
      case "/cors/wildcard-credentials":
        if (preflight) return void res.writeHead(204, { "access-control-allow-origin": "*" }).end();
        return data({ "access-control-allow-origin": "*" });
      case "/cors/no-credentials":
        if (preflight) return void res.writeHead(204, exact).end();
        return data(exact);
      case "/cors/ok": {
        const ok = {
          ...exact,
          "access-control-allow-credentials": "true",
          "access-control-allow-methods": "GET, PUT",
          "access-control-allow-headers": "content-type, x-custom",
        };
        if (preflight) return void res.writeHead(204, ok).end();
        return data({ ...ok, "x-total": "42" });
      }
      default:
        res.writeHead(404).end();
    }
  }

  // Origen C: otra API sin CORS, una página para navegar fuera de la app y un iframe que llama a B.
  const third = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    switch (url.pathname) {
      case "/cors/none":
        if (req.method === "OPTIONS") return void res.writeHead(204).end();
        res.writeHead(200, { "content-type": "application/json" });
        return void res.end(JSON.stringify({ ok: true, third: true }));
      case "/page":
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        return void res.end(
          `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Origen C</title></head>` +
            `<body><a href="${appOrigin}/" data-testid="nav-back">volver</a></body></html>`,
        );
      case "/frame":
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        return void res.end(
          `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Frame C</title></head>` +
            `<body><pre id="out"></pre><script>` +
            `window.callApi = () => fetch(${JSON.stringify(apiOrigin)} + "/cors/none")` +
            `.then((r) => r.status, (e) => String(e))` +
            `.then((v) => { document.getElementById("out").textContent = String(v); return v; });` +
            `</script></body></html>`,
        );
      default:
        res.writeHead(404).end();
    }
  });

  appOrigin = await listen(app, ports.app);
  apiOrigin = await listen(api, ports.api);
  thirdOrigin = await listen(third, ports.third);

  return {
    appOrigin,
    apiOrigin,
    thirdOrigin,
    received,
    close: async () => {
      await Promise.all(
        [app, api, third].map(
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
