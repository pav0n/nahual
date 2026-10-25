import type { HookContextData } from "../src/schemas.ts";

/** Contexto de etapa Request mínimo; cada prueba cambia lo que le interesa. */
export function requestContext(): HookContextData {
  return {
    stage: "request",
    resourceType: "Fetch",
    site: "http://127.0.0.1:4310",
    request: {
      method: "GET",
      url: "http://127.0.0.1:4311/hooks/items?page=1",
      headers: { accept: "application/json", authorization: "Bearer secreto" },
      body: { kind: "none", contentType: null, size: null },
      graphql: null,
    },
    response: null,
  };
}

/** Contexto de etapa Response con body JSON. */
export function responseContext(): HookContextData {
  const ctx = requestContext();
  return {
    ...ctx,
    stage: "response",
    response: {
      status: 200,
      headers: { "content-type": "application/json", "set-cookie": "a=1\nb=2" },
      body: {
        kind: "text",
        text: '{"status":"ok","items":[1,2,3]}',
        contentType: "application/json",
        size: 32,
      },
    },
  };
}
