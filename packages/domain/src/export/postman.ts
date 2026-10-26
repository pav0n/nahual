import { z } from "zod";
import type { RedactedSite } from "../sensitive.ts";
import {
  endpointOf,
  isJsonType,
  mediaType,
  omittedNote,
  parseJson,
  type ExportOptions,
} from "./common.ts";
import type { ExportBody, ExportHeader, ExportSource } from "./source.ts";

const SCHEMA = "https://schema.getpostman.com/json/collection/v2.1.0/collection.json";

/** Textos de estado de los códigos habituales, para el ejemplo de respuesta. */
const STATUS: Record<number, string> = {
  200: "OK",
  201: "Created",
  202: "Accepted",
  204: "No Content",
  301: "Moved Permanently",
  302: "Found",
  304: "Not Modified",
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  409: "Conflict",
  422: "Unprocessable Entity",
  429: "Too Many Requests",
  500: "Internal Server Error",
  502: "Bad Gateway",
  503: "Service Unavailable",
};

const KeyValue = z.strictObject({ key: z.string(), value: z.string() });
const Url = z.strictObject({
  raw: z.string(),
  protocol: z.string().optional(),
  host: z.array(z.string()).optional(),
  port: z.string().optional(),
  path: z.array(z.string()).optional(),
  query: z.array(KeyValue).optional(),
});
const Body = z.discriminatedUnion("mode", [
  z.strictObject({
    mode: z.literal("raw"),
    raw: z.string(),
    options: z.strictObject({ raw: z.strictObject({ language: z.enum(["json", "text"]) }) }),
  }),
  z.strictObject({ mode: z.literal("urlencoded"), urlencoded: z.array(KeyValue) }),
  z.strictObject({
    mode: z.literal("formdata"),
    formdata: z.array(KeyValue.extend({ type: z.literal("text") })),
  }),
]);
const Request = z.strictObject({
  method: z.string(),
  header: z.array(KeyValue),
  url: Url,
  body: Body.optional(),
});

/** Subconjunto de Postman Collection v2.1.0 que genera Nahual; las pruebas validan la salida. */
export const PostmanCollectionSchema = z.strictObject({
  info: z.strictObject({ name: z.string(), description: z.string(), schema: z.literal(SCHEMA) }),
  variable: z.array(KeyValue).optional(),
  item: z.array(
    z.strictObject({
      name: z.string(),
      description: z.string().optional(),
      request: Request,
      response: z.array(
        z.strictObject({
          name: z.string(),
          originalRequest: Request,
          status: z.string(),
          code: z.int(),
          header: z.array(KeyValue),
          body: z.string(),
          _postman_previewlanguage: z.enum(["json", "text"]),
        }),
      ),
    }),
  ),
});
export type PostmanCollection = z.infer<typeof PostmanCollectionSchema>;

const header = (headers: readonly ExportHeader[]) =>
  headers.map((h) => ({ key: h.name, value: h.value }));

function url(raw: string): z.infer<typeof Url> {
  try {
    const parsed = new URL(raw);
    const query = [...parsed.searchParams].map(([key, value]) => ({ key, value }));
    return {
      raw,
      protocol: parsed.protocol.replace(/:$/, ""),
      host: parsed.hostname.split("."),
      ...(parsed.port ? { port: parsed.port } : {}),
      path: parsed.pathname.split("/").filter(Boolean),
      ...(query.length ? { query } : {}),
    };
  } catch {
    return { raw };
  }
}

function body(b: ExportBody, notes: string[]): z.infer<typeof Body> | undefined {
  switch (b.kind) {
    case "text": {
      const json =
        parseJson(b.text).ok && (isJsonType(b.contentType) || mediaType(b.contentType) === "");
      return { mode: "raw", raw: b.text, options: { raw: { language: json ? "json" : "text" } } };
    }
    case "form":
      return {
        mode: "urlencoded",
        urlencoded: b.fields.map((f) => ({ key: f.name, value: f.value })),
      };
    case "multipart":
      for (const part of b.parts)
        if (part.kind === "file") notes.push(`omitted file part: ${part.name} (${part.filename})`);
      return {
        mode: "formdata",
        formdata: b.parts.flatMap((p) =>
          p.kind === "field" ? [{ key: p.name, value: p.value, type: "text" as const }] : [],
        ),
      };
    case "omitted":
      notes.push(omittedNote(b));
      return undefined;
    case "none":
      return undefined;
  }
}

/**
 * Colección de Postman (007, research R8, FR-016b): un elemento por request en el orden dado, con
 * la respuesta capturada como ejemplo. Los valores sensibles ya vienen como `{{nahual_…}}` y se
 * declaran como variables de colección vacías. Sin `_postman_id`: misma entrada, mismo archivo.
 */
export function postman(
  prepared: readonly { source: ExportSource; redacted: readonly RedactedSite[] }[],
  options: ExportOptions & { site?: string },
): string {
  const first = prepared[0]?.source;
  let origin = options.site ?? "";
  if (!origin && first) {
    try {
      origin = new URL(first.request.url).origin;
    } catch {
      origin = first.request.url;
    }
  }
  const variables = [...new Set(prepared.flatMap((p) => p.redacted.map((s) => s.postmanVar)))];
  const items = prepared.map(({ source }) => {
    const notes: string[] = [];
    const requestBody = body(source.request.body, notes);
    const request = {
      method: source.request.method,
      header: header(source.request.headers),
      url: url(source.request.url),
      ...(requestBody ? { body: requestBody } : {}),
    };
    const response = source.response;
    const examples = response
      ? [
          {
            name: "Captured",
            originalRequest: request,
            status: STATUS[response.status] ?? "",
            code: response.status,
            header: header(response.headers),
            body: response.body.kind === "text" ? response.body.text : "",
            _postman_previewlanguage:
              response.body.kind === "text" && parseJson(response.body.text).ok
                ? ("json" as const)
                : ("text" as const),
          },
        ]
      : [];
    return {
      name: endpointOf(source),
      ...(notes.length ? { description: notes.join("\n") } : {}),
      request,
      response: examples,
    };
  });
  const captured = first ? new Date(first.capturedAt).toISOString() : "";
  const collection: PostmanCollection = {
    info: {
      name: `Nahual · ${origin}`,
      description: `Generated by Nahual ${options.appVersion} · captured ${captured}`,
      schema: SCHEMA,
    },
    ...(variables.length ? { variable: variables.map((key) => ({ key, value: "" })) } : {}),
    item: items,
  };
  return `${JSON.stringify(collection, null, 2)}\n`;
}
