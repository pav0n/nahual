import { describe, expect, it } from "vitest";
import {
  buildHookContext,
  headersToRecord,
  toHeaderList,
  type HookExchange,
} from "../src/context.ts";

const exchange = (overrides: Partial<HookExchange> = {}): HookExchange => ({
  method: "POST",
  url: "http://127.0.0.1:4311/graphql",
  resourceType: "Fetch",
  requestHeaders: [
    { name: "Content-Type", value: "application/json" },
    { name: "X-Trace", value: "a" },
    { name: "x-trace", value: "b" },
  ],
  requestBody: {
    kind: "text",
    text: '{"query":"query GetUser { me { id } }","operationName":"GetUser"}',
  },
  status: 200,
  responseHeaders: [
    { name: "content-type", value: "application/json" },
    { name: "Set-Cookie", value: "a=1" },
    { name: "set-cookie", value: "b=2" },
  ],
  responseBody: { kind: "binary" },
  ...overrides,
});

describe("headersToRecord", () => {
  it("nombres en minúsculas; repetidos con ', ', set-cookie con salto de línea", () => {
    expect(headersToRecord(exchange().requestHeaders)).toEqual({
      "content-type": "application/json",
      "x-trace": "a, b",
    });
    expect(headersToRecord(exchange().responseHeaders)["set-cookie"]).toBe("a=1\nb=2");
  });
});

describe("toHeaderList (inversa de headersToRecord)", () => {
  const original = exchange().responseHeaders;

  it("sin cambios devuelve la lista original con su orden y mayúsculas", () => {
    expect(toHeaderList(headersToRecord(original), original)).toEqual(original);
  });

  it("un valor cambiado conserva el nombre original; set-cookie se vuelve a separar", () => {
    const record = {
      ...headersToRecord(original),
      "content-type": "text/plain",
      "set-cookie": "c=3\nd=4",
    };
    expect(toHeaderList(record, original)).toEqual([
      { name: "content-type", value: "text/plain" },
      { name: "Set-Cookie", value: "c=3" },
      { name: "Set-Cookie", value: "d=4" },
    ]);
  });

  it("quita los ausentes y añade los nuevos al final", () => {
    const record = { "set-cookie": "a=1\nb=2", "x-new": "1" };
    expect(toHeaderList(record, original)).toEqual([
      { name: "Set-Cookie", value: "a=1" },
      { name: "set-cookie", value: "b=2" },
      { name: "x-new", value: "1" },
    ]);
  });
});

describe("buildHookContext (FR-003, FR-005, FR-006)", () => {
  it("etapa Request: request editable, operationName GraphQL y sin response", () => {
    const ctx = buildHookContext(exchange(), "request", "http://127.0.0.1:4310");
    expect(ctx.stage).toBe("request");
    expect(ctx.site).toBe("http://127.0.0.1:4310");
    expect(ctx.request.graphql).toEqual({ operationName: "GetUser" });
    expect(ctx.request.body).toMatchObject({ kind: "text", contentType: "application/json" });
    expect(ctx.request.body.size).toBe(
      new TextEncoder().encode(
        exchange().requestBody.kind === "text"
          ? (exchange().requestBody as { text: string }).text
          : "",
      ).length,
    );
    expect(ctx.response).toBeNull();
  });

  it("etapa Response: status, headers y body no textual con su tipo", () => {
    const ctx = buildHookContext(exchange(), "response", "http://127.0.0.1:4310");
    expect(ctx.response).toEqual({
      status: 200,
      headers: { "content-type": "application/json", "set-cookie": "a=1\nb=2" },
      body: { kind: "binary", contentType: "application/json", size: null },
    });
  });

  it("sin GraphQL, graphql es null; body desconocido cuenta como none", () => {
    const ctx = buildHookContext(
      exchange({ url: "http://x.test/api", requestBody: { kind: "unknown" } }),
      "request",
      "http://x.test",
    );
    expect(ctx.request.graphql).toBeNull();
    expect(ctx.request.body).toEqual({ kind: "none", contentType: "application/json", size: null });
  });
});
