import {
  graphqlOperations,
  headerValues,
  utf8Bytes,
  type BodyAccess,
  type Header,
  type Stage,
} from "@nahual/domain";
import type { HookBody, HookContextData, HookHeaders } from "./schemas.ts";

/** Lo que el SW sabe de un intercambio pausado (la `ExchangeView` de 002 más el body). */
export interface HookExchange {
  method: string;
  url: string;
  resourceType: string;
  requestHeaders: Header[];
  requestBody: BodyAccess;
  status: number | null;
  responseHeaders: Header[];
  responseBody: BodyAccess;
}

/** `set-cookie` no admite unir valores con coma: va uno por línea. */
const joinerOf = (name: string) => (name === "set-cookie" ? "\n" : ", ");

/** Headers como objeto con nombres en minúsculas; los repetidos se unen (contracts/hook-api.md). */
export function headersToRecord(headers: Header[]): HookHeaders {
  const record: HookHeaders = {};
  for (const { name, value } of headers) {
    const key = name.toLowerCase();
    record[key] = key in record ? `${record[key]}${joinerOf(key)}${value}` : value;
  }
  return record;
}

/**
 * Inversa de `headersToRecord`: los que no cambian salen tal cual (orden, mayúsculas y entradas
 * separadas); los cambiados toman el nombre del primero original; los nuevos van al final.
 */
export function toHeaderList(record: HookHeaders, original: Header[]): Header[] {
  const before = headersToRecord(original);
  const list: Header[] = [];
  const done = new Set<string>();
  for (const header of original) {
    const key = header.name.toLowerCase();
    if (!(key in record) || done.has(key)) continue;
    const value = record[key] ?? "";
    if (value === before[key]) {
      list.push(...original.filter((h) => h.name.toLowerCase() === key));
    } else {
      const values = key === "set-cookie" ? value.split("\n") : [value];
      list.push(...values.map((v) => ({ name: header.name, value: v })));
    }
    done.add(key);
  }
  for (const [key, value] of Object.entries(record)) {
    if (done.has(key) || original.some((h) => h.name.toLowerCase() === key)) continue;
    const values = key === "set-cookie" ? value.split("\n") : [value];
    list.push(...values.map((v) => ({ name: key, value: v })));
  }
  return list;
}

function bodyOf(body: BodyAccess, headers: Header[]): HookBody {
  const contentType = headerValues(headers, "content-type")[0] ?? null;
  if (body.kind === "text")
    return { kind: "text", text: body.text, contentType, size: utf8Bytes(body.text) };
  const kind = body.kind === "binary" || body.kind === "tooLarge" ? body.kind : "none";
  return { kind, contentType, size: null };
}

/** Contexto de un hook para una etapa (FR-003, FR-005, FR-006): solo datos. */
export function buildHookContext(
  exchange: HookExchange,
  stage: Stage,
  site: string,
): HookContextData {
  const requestBody = bodyOf(exchange.requestBody, exchange.requestHeaders);
  const ops = graphqlOperations({
    method: exchange.method,
    url: exchange.url,
    body: requestBody.kind === "text" ? requestBody.text : null,
  });
  return {
    stage,
    resourceType: exchange.resourceType,
    site,
    request: {
      method: exchange.method,
      url: exchange.url,
      headers: headersToRecord(exchange.requestHeaders),
      body: requestBody,
      graphql: ops === null ? null : { operationName: ops[0] ?? null },
    },
    response:
      stage === "response"
        ? {
            status: exchange.status ?? 0,
            headers: headersToRecord(exchange.responseHeaders),
            body: bodyOf(exchange.responseBody, exchange.responseHeaders),
          }
        : null,
  };
}
