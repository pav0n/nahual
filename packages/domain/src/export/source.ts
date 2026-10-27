import { isForbiddenHeader } from "../repeater/forbidden-headers.ts";
import type { CapturedExchange } from "../schemas/exchange.ts";
import { LIMITS, utf8Bytes } from "../schemas/limits.ts";
import type { RepeaterRequest, RepeaterResponse } from "../schemas/repeater.ts";

// Entrada común de los exportadores (007, data-model "ExportSource", research R2). La construye
// el panel con los bodies que ya pide `getBody`; aquí no hay `chrome.*` ni red.

export interface ExportHeader {
  name: string;
  value: string;
}

export type MultipartPart =
  { kind: "field"; name: string; value: string } | { kind: "file"; name: string; filename: string };

export type ExportBody =
  | { kind: "text"; text: string; contentType: string | null }
  | { kind: "form"; fields: { name: string; value: string }[] }
  | { kind: "multipart"; parts: MultipartPart[] }
  | { kind: "omitted"; reason: "binary" | "tooLarge" | "unavailable"; size: number | null }
  | { kind: "none" };

export interface ExportResponse {
  status: number;
  headers: ExportHeader[];
  body: ExportBody;
  mimeType: string | null;
}

export interface ExportSource {
  request: { method: string; url: string; headers: ExportHeader[]; body: ExportBody };
  response: ExportResponse | null;
  /** Hora del intercambio; solo aparece en comentarios, nunca en el código ejecutable. */
  capturedAt: number;
}

/** Body tal como lo devuelve `getBody` (el mismo de `repeaterRequestFromExchange`). */
export type CapturedBody =
  { kind: "text"; text: string } | { kind: "base64"; base64: string; size: number } | null;

/** Los que pone el navegador no se exportan, salvo `cookie` y `referer` (research R4). */
const KEEP = new Set(["cookie", "referer"]);
const exportable = (name: string) =>
  !name.startsWith(":") && (KEEP.has(name.toLowerCase()) || !isForbiddenHeader(name));

export const headerValue = (headers: readonly ExportHeader[], name: string) =>
  headers.find((h) => h.name.toLowerCase() === name)?.value ?? null;

function parseMultipart(text: string, contentType: string): MultipartPart[] | null {
  const boundary = /boundary="?([^";]+)"?/i.exec(contentType)?.[1];
  if (!boundary) return null;
  const parts: MultipartPart[] = [];
  for (const chunk of text.split(`--${boundary}`).slice(1)) {
    if (chunk.startsWith("--")) break;
    const split = chunk.indexOf("\r\n\r\n");
    if (split < 0) return null;
    const head = chunk.slice(0, split);
    const name = /;\s*name="([^"]*)"/i.exec(head)?.[1];
    if (name === undefined) return null;
    const filename = /;\s*filename="([^"]*)"/i.exec(head)?.[1];
    parts.push(
      filename === undefined
        ? { kind: "field", name, value: chunk.slice(split + 4).replace(/\r\n$/, "") }
        : { kind: "file", name, filename },
    );
  }
  return parts;
}

/** Body de texto según su `content-type`: formulario, multipart o texto tal cual. */
function textBody(text: string, contentType: string | null): ExportBody {
  if (utf8Bytes(text) > LIMITS.exportInlineBodyBytes)
    return { kind: "omitted", reason: "tooLarge", size: utf8Bytes(text) };
  const type = contentType?.toLowerCase() ?? "";
  if (type.startsWith("application/x-www-form-urlencoded"))
    return {
      kind: "form",
      fields: [...new URLSearchParams(text)].map(([name, value]) => ({ name, value })),
    };
  if (type.startsWith("multipart/form-data")) {
    const parts = parseMultipart(text, contentType ?? "");
    if (parts) return { kind: "multipart", parts };
  }
  return { kind: "text", text, contentType };
}

function capturedBody(body: CapturedBody, contentType: string | null, available: boolean) {
  if (body?.kind === "text") return textBody(body.text, contentType);
  if (body?.kind === "base64")
    return { kind: "omitted", reason: "binary", size: body.size } satisfies ExportBody;
  return available
    ? ({ kind: "omitted", reason: "unavailable", size: null } satisfies ExportBody)
    : ({ kind: "none" } satisfies ExportBody);
}

/** Request capturado de Tráfico (no preflight) y, si la hubo, su respuesta. */
export function exportSourceFromExchange(
  exchange: CapturedExchange,
  requestBody: CapturedBody,
  responseBody: CapturedBody,
): ExportSource {
  const headers = exchange.requestHeaders.filter((h) => exportable(h.name));
  const responseHeaders = exchange.responseHeaders.map((h) => ({ name: h.name, value: h.value }));
  return {
    request: {
      method: exchange.method.toUpperCase(),
      url: exchange.url,
      headers: headers.map((h) => ({ name: h.name.toLowerCase(), value: h.value })),
      body: capturedBody(
        requestBody,
        headerValue(
          exchange.requestHeaders.map((h) => ({ ...h, name: h.name.toLowerCase() })),
          "content-type",
        ),
        exchange.requestBody.available,
      ),
    },
    response:
      exchange.status === null || exchange.state === "failed"
        ? null
        : {
            status: exchange.status,
            headers: responseHeaders,
            body: capturedBody(
              responseBody,
              headerValue(
                responseHeaders.map((h) => ({ ...h, name: h.name.toLowerCase() })),
                "content-type",
              ) ?? exchange.mimeType,
              exchange.responseBody.available,
            ),
            mimeType: exchange.mimeType,
          },
    capturedAt: exchange.startedAt,
  };
}

/** Request en edición de una pestaña del repeater y, si hay, la respuesta seleccionada. */
export function exportSourceFromRepeater(
  request: RepeaterRequest,
  response: RepeaterResponse | null,
  capturedAt: number,
): ExportSource {
  const headers = request.headers
    .filter((h) => h.enabled && exportable(h.name))
    .map((h) => ({ name: h.name.toLowerCase(), value: h.value }));
  const contentType = headerValue(headers, "content-type");
  let body: ExportBody;
  if (request.body.kind === "text") body = textBody(request.body.text, contentType);
  else if (request.body.kind === "original")
    body = { kind: "omitted", reason: "binary", size: request.body.size };
  else
    body = request.body.reason
      ? { kind: "omitted", reason: "unavailable", size: null }
      : { kind: "none" };
  let exportResponse: ExportResponse | null = null;
  if (response) {
    const responseHeaders = response.headers.map((h) => ({ name: h.name, value: h.value }));
    const type =
      headerValue(
        responseHeaders.map((h) => ({ ...h, name: h.name.toLowerCase() })),
        "content-type",
      ) ?? response.mimeType;
    exportResponse = {
      status: response.status,
      headers: responseHeaders,
      body:
        response.body.encoding === "text"
          ? textBody(response.body.text, type)
          : response.body.info.available || response.body.info.reason === "none"
            ? { kind: "none" }
            : { kind: "omitted", reason: "unavailable", size: response.body.info.size },
      mimeType: response.mimeType,
    };
  }
  return {
    request: { method: request.method.toUpperCase(), url: request.url, headers, body },
    response: exportResponse,
    capturedAt,
  };
}
