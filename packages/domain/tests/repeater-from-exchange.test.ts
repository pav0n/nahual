import { describe, expect, it } from "vitest";
import { repeaterRequestFromExchange } from "../src/repeater/from-exchange.ts";
import type { CapturedExchange } from "../src/schemas/exchange.ts";
import { RepeaterRequestSchema } from "../src/schemas/repeater.ts";

function exchange(overrides: Partial<CapturedExchange> = {}): CapturedExchange {
  return {
    id: "ex-1",
    seq: 1,
    method: "POST",
    url: "https://api.test/items?page=2",
    urlTruncated: false,
    resourceType: "Fetch",
    isPreflight: false,
    requestHeaders: [
      { name: "content-type", value: "application/json" },
      { name: "authorization", value: "Bearer secret" },
    ],
    responseHeaders: [],
    status: 200,
    state: "complete",
    encodedSize: 10,
    decodedSize: 10,
    startedAt: 1,
    durationMs: 5,
    mimeType: "application/json",
    requestBody: { available: true, size: 7 },
    responseBody: { available: true, size: 2 },
    ruleEffects: [],
    ...overrides,
  };
}

describe("repeaterRequestFromExchange (005, FR-002, FR-002a)", () => {
  it("copia método, URL y headers activos, con body de texto", () => {
    const { request, name } = repeaterRequestFromExchange(exchange(), {
      kind: "text",
      text: '{"a":1}',
    });
    expect(request).toEqual({
      method: "POST",
      url: "https://api.test/items?page=2",
      headers: [
        { name: "content-type", value: "application/json", enabled: true },
        { name: "authorization", value: "Bearer secret", enabled: true },
      ],
      body: { kind: "text", text: '{"a":1}' },
    });
    expect(name).toBe("POST /items");
    expect(RepeaterRequestSchema.safeParse(request).success).toBe(true);
  });

  it("body binario conservado ⇒ original no editable con su tipo y tamaño", () => {
    const ex = exchange({
      requestHeaders: [{ name: "Content-Type", value: "image/png" }],
    });
    const { request } = repeaterRequestFromExchange(ex, {
      kind: "base64",
      base64: "iVBORw==",
      size: 4,
    });
    expect(request.body).toEqual({
      kind: "original",
      base64: "iVBORw==",
      contentType: "image/png",
      size: 4,
    });
  });

  it.each([
    [
      "sin body",
      { available: false, size: null, reason: "none" as const },
      { kind: "unavailable", reason: "none" } as const,
      { kind: "none" },
    ],
    [
      "desalojado",
      { available: true, size: 9 },
      { kind: "unavailable", reason: "evicted" } as const,
      { kind: "none", reason: "evicted" },
    ],
    [
      "demasiado grande",
      { available: false, size: null, reason: "tooLarge" as const },
      { kind: "unavailable", reason: "tooLarge" } as const,
      { kind: "none", reason: "tooLarge" },
    ],
    [
      "binario sin conservar",
      { available: false, size: null, reason: "binary" as const },
      { kind: "unavailable", reason: "binary" } as const,
      { kind: "none", reason: "unavailable" },
    ],
  ])("%s ⇒ body vacío con su motivo", (_name, requestBody, body, expected) => {
    expect(repeaterRequestFromExchange(exchange({ requestBody }), body).request.body).toEqual(
      expected,
    );
  });

  it("GET sin body ⇒ none sin motivo", () => {
    const { request } = repeaterRequestFromExchange(
      exchange({ method: "GET", requestBody: { available: false, size: null, reason: "none" } }),
      null,
    );
    expect(request.body).toEqual({ kind: "none" });
  });

  it("un header que el schema no admite (valor con salto de línea) se omite", () => {
    const { request } = repeaterRequestFromExchange(
      exchange({
        requestHeaders: [
          { name: "x-a", value: "1\n2" },
          { name: "x-b", value: "2" },
        ],
      }),
      null,
    );
    expect(request.headers.map((h) => h.name)).toEqual(["x-b"]);
  });

  it("nombre por defecto recortado a 60 caracteres", () => {
    const { name } = repeaterRequestFromExchange(
      exchange({ method: "GET", url: `https://api.test/${"a".repeat(200)}` }),
      null,
    );
    expect(name.length).toBeLessThanOrEqual(60);
    expect(name.startsWith("GET /aaa")).toBe(true);
  });

  it("URL recortada en la captura: se marca como no reproducible", () => {
    const { truncatedUrl } = repeaterRequestFromExchange(exchange({ urlTruncated: true }), null);
    expect(truncatedUrl).toBe(true);
  });
});
