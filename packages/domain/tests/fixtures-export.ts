import type { Header } from "../src/schemas/common.ts";
import type { CapturedExchange } from "../src/schemas/exchange.ts";

/**
 * Intercambios de prueba de los exportadores (007, T002) con sus bodies tal como los devuelve
 * `getBody`. Los valores sensibles contienen `secret` para buscarlos en la salida (SC-004).
 */
export const API = "http://127.0.0.1:4311";
export const AUTH = "Bearer secret-export-token";

export interface ExportFixture {
  exchange: CapturedExchange;
  requestBody:
    { kind: "text"; text: string } | { kind: "base64"; base64: string; size: number } | null;
  responseBody:
    { kind: "text"; text: string } | { kind: "base64"; base64: string; size: number } | null;
}

const h = (entries: Record<string, string>): Header[] =>
  Object.entries(entries).map(([name, value]) => ({ name, value }));

let seq = 0;
function exchange(overrides: Partial<CapturedExchange>): CapturedExchange {
  seq += 1;
  return {
    id: `ex-${seq}`,
    seq,
    method: "GET",
    url: `${API}/export/items`,
    urlTruncated: false,
    resourceType: "Fetch",
    isPreflight: false,
    requestHeaders: [],
    responseHeaders: [],
    status: 200,
    state: "complete",
    encodedSize: 100,
    decodedSize: 100,
    startedAt: 1_761_422_400_000,
    durationMs: 12,
    mimeType: "application/json",
    requestBody: { available: false, size: null, reason: "none" },
    responseBody: { available: true, size: 100 },
    ruleEffects: [],
    ...overrides,
  };
}

const text = (value: string) => ({ kind: "text" as const, text: value });

/** `GET` con `Authorization`, respuesta JSON 200 con `set-cookie` y `x-request-id`. */
export const getItems: ExportFixture = {
  exchange: exchange({
    url: `${API}/export/items?page=1`,
    requestHeaders: h({
      accept: "application/json",
      authorization: AUTH,
      "sec-fetch-mode": "cors",
      "user-agent": "Mozilla/5.0",
    }),
    responseHeaders: h({
      "content-type": "application/json",
      "content-length": "120",
      "set-cookie": "export_session=secret-export-cookie; Path=/",
      "x-request-id": "req-13-7",
    }),
  }),
  requestBody: null,
  responseBody: text(
    JSON.stringify({
      items: [
        { id: 1, name: "item-1", deletedAt: "2026-10-25T20:00:00.000Z" },
        { id: 2, name: "item-2", deletedAt: null },
      ],
      next: "/export/items?page=2",
    }),
  ),
};

/** `POST` JSON con `password`, `Cookie` y `?token=`; respuesta 201. */
export const postItem: ExportFixture = {
  exchange: exchange({
    method: "POST",
    url: `${API}/export/items?token=secret-query-token&lang=es`,
    requestHeaders: h({
      "content-type": "application/json",
      cookie: "sid=secret-cookie-value",
      "x-api-key": "secret-api-key",
      referer: "http://127.0.0.1:4310/",
      "content-length": "60",
    }),
    requestBody: { available: true, size: 60 },
    status: 201,
    responseHeaders: h({ "content-type": "application/json" }),
  }),
  requestBody: text(JSON.stringify({ name: 'it\'s "x" $HOME', password: "secret-body-password" })),
  responseBody: text(JSON.stringify({ created: true })),
};

/** Formulario `x-www-form-urlencoded`. */
export const postForm: ExportFixture = {
  exchange: exchange({
    method: "POST",
    url: `${API}/export/form`,
    requestHeaders: h({ "content-type": "application/x-www-form-urlencoded" }),
    requestBody: { available: true, size: 26 },
  }),
  requestBody: text("a=1&session_id=secret-form"),
  responseBody: text(JSON.stringify({ fields: { a: "1" } })),
};

const BOUNDARY = "----nahual";
/** `multipart/form-data` con una parte de texto y un archivo. */
export const postUpload: ExportFixture = {
  exchange: exchange({
    method: "POST",
    url: `${API}/export/upload`,
    requestHeaders: h({ "content-type": `multipart/form-data; boundary=${BOUNDARY}` }),
    requestBody: { available: true, size: 200 },
  }),
  requestBody: text(
    [
      `--${BOUNDARY}`,
      'Content-Disposition: form-data; name="note"',
      "",
      "hola",
      `--${BOUNDARY}`,
      'Content-Disposition: form-data; name="file"; filename="photo.png"',
      "Content-Type: image/png",
      "",
      "PNGDATA",
      `--${BOUNDARY}--`,
      "",
    ].join("\r\n"),
  ),
  responseBody: text(JSON.stringify({ parts: ["note", "file"] })),
};

/** Respuesta binaria (PNG). */
export const getBinary: ExportFixture = {
  exchange: exchange({
    url: `${API}/export/binary`,
    mimeType: "image/png",
    responseHeaders: h({ "content-type": "image/png" }),
  }),
  requestBody: null,
  responseBody: { kind: "base64", base64: "iVBORw0KGgo=", size: 8 },
};

/** Body de request de 1,5 MB: por encima del límite para incrustar (1 MB). */
export const postBig: ExportFixture = {
  exchange: exchange({
    method: "POST",
    url: `${API}/export/items`,
    requestHeaders: h({ "content-type": "application/json" }),
    requestBody: { available: true, size: 1_572_864 },
  }),
  requestBody: text(JSON.stringify({ data: "x".repeat(1_572_850) })),
  responseBody: text(JSON.stringify({ created: true })),
};

/** Request fallido, sin respuesta. */
export const failed: ExportFixture = {
  exchange: exchange({
    url: `${API}/export/items/9`,
    state: "failed",
    status: null,
    errorText: "net::ERR_CONNECTION_REFUSED",
    responseBody: { available: false, size: null, reason: "none" },
  }),
  requestBody: null,
  responseBody: null,
};

/** Preflight: "Exportar como…" no aplica. */
export const preflight: ExportFixture = {
  exchange: exchange({ method: "OPTIONS", isPreflight: true, resourceType: "Preflight" }),
  requestBody: null,
  responseBody: null,
};

/** Tres respuestas de `GET /export/items` para la inferencia Zod (campos ausentes y nulos). */
export const itemPages: ExportFixture[] = [1, 2, 3].map((page) => ({
  exchange: exchange({
    url: `${API}/export/items?page=${page}`,
    requestHeaders: h({ accept: "application/json" }),
    responseHeaders: h({ "content-type": "application/json" }),
  }),
  requestBody: null,
  responseBody: text(
    JSON.stringify(
      page < 3
        ? {
            items: [
              {
                id: page * 2 - 1,
                name: `item-${page * 2 - 1}`,
                deletedAt: "2026-10-25T20:00:00.000Z",
              },
              { id: page * 2, name: `item-${page * 2}`, deletedAt: null },
            ],
            next: `/export/items?page=${page + 1}`,
          }
        : { items: [{ id: 5, name: "item-5", deletedAt: "2026-10-25T20:00:00.000Z" }] },
    ),
  ),
}));

/** Dos requests del mismo endpoint (método + ruta) para la fusión de handlers MSW. */
export const sameEndpoint: ExportFixture[] = itemPages.slice(0, 2);
