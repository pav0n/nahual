import { headerValues } from "./match/headers.ts";
import type { Header } from "./schemas/common.ts";

/** Preflight CORS: `OPTIONS` con `Access-Control-Request-Method`. */
export function isPreflight(method: string, headers: Header[]): boolean {
  return (
    method.toUpperCase() === "OPTIONS" &&
    headerValues(headers, "access-control-request-method").length > 0
  );
}

/**
 * Headers de un mock respondido localmente (research R21). Si el request va a otro origen que la
 * página y el mock no define CORS, se añade `Access-Control-Allow-Origin` con el origen exacto de
 * la página (nunca `*`) y `Access-Control-Allow-Credentials`: sin ellos la página descartaría el
 * mock por CORS. El contenido es sintético: no expone datos de ningún servidor.
 */
export function mockHeadersFor(
  headers: Header[],
  context: { pageOrigin: string | null; requestUrl: string },
): Header[] {
  if (context.pageOrigin === null) return headers;
  let requestOrigin: string;
  try {
    requestOrigin = new URL(context.requestUrl).origin;
  } catch {
    return headers;
  }
  if (requestOrigin === context.pageOrigin) return headers;
  if (headerValues(headers, "access-control-allow-origin").length > 0) return headers;
  return [
    ...headers,
    { name: "access-control-allow-origin", value: context.pageOrigin },
    { name: "access-control-allow-credentials", value: "true" },
  ];
}
