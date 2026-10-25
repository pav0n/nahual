import { describe, expect, it } from "vitest";
import { LIMITS } from "../src/schemas/limits.ts";
import {
  IgnoreListSchema,
  RepeaterRequestSchema,
  RepeaterResponseSchema,
  RepeaterSendSchema,
  type RepeaterRequest,
} from "../src/schemas/repeater.ts";
import {
  ComparableResponseSchema,
  DiffResultSchema,
  PathSegmentSchema,
} from "../src/schemas/diff.ts";

const request = (overrides: Partial<RepeaterRequest> = {}): RepeaterRequest => ({
  method: "GET",
  url: "https://api.test/items?page=2",
  headers: [{ name: "accept", value: "application/json", enabled: true }],
  body: { kind: "none" },
  ...overrides,
});
const ok = (value: unknown) => RepeaterRequestSchema.safeParse(value).success;
const MB5 = 5 * 1024 * 1024;

describe("RepeaterRequestSchema (005, data-model)", () => {
  it("acepta un request mínimo", () => expect(ok(request())).toBe(true));

  it("método de letras, 1–64 caracteres", () => {
    expect(ok(request({ method: "PATCH" }))).toBe(true);
    expect(ok(request({ method: "" }))).toBe(false);
    expect(ok(request({ method: "GET POST" }))).toBe(false);
    expect(ok(request({ method: "G".repeat(65) }))).toBe(false);
  });

  it("URL absoluta http(s) de hasta urlMax", () => {
    expect(ok(request({ url: "http://127.0.0.1:8080/a" }))).toBe(true);
    expect(ok(request({ url: "/relativa" }))).toBe(false);
    expect(ok(request({ url: "ftp://x.test/" }))).toBe(false);
    // eslint-disable-next-line no-script-url -- la prueba comprueba que se rechaza.
    expect(ok(request({ url: "javascript:alert(1)" }))).toBe(false);
    expect(ok(request({ url: `https://a.test/${"x".repeat(LIMITS.urlMax)}` }))).toBe(false);
  });

  it(`headers con nombre válido, sin CR/LF y hasta ${LIMITS.repeaterHeadersMax}`, () => {
    expect(ok(request({ headers: [{ name: "x-a", value: "1", enabled: false }] }))).toBe(true);
    expect(ok(request({ headers: [{ name: "x a", value: "1", enabled: true }] }))).toBe(false);
    expect(ok(request({ headers: [{ name: "x-a", value: "1\r\nx: y", enabled: true }] }))).toBe(
      false,
    );
    const many = Array.from({ length: LIMITS.repeaterHeadersMax + 1 }, (_, i) => ({
      name: `x-${i}`,
      value: "1",
      enabled: true,
    }));
    expect(ok(request({ headers: many }))).toBe(false);
  });

  it("body none, texto de hasta 5 MB u original base64 de hasta 5 MB", () => {
    expect(ok(request({ body: { kind: "none", reason: "evicted" } }))).toBe(true);
    expect(ok(request({ body: { kind: "text", text: '{"a":1}' } }))).toBe(true);
    expect(ok(request({ body: { kind: "text", text: "x".repeat(MB5 + 1) } }))).toBe(false);
    expect(
      ok(request({ body: { kind: "original", base64: "AAEC", contentType: null, size: 3 } })),
    ).toBe(true);
    expect(
      ok(request({ body: { kind: "original", base64: "AAEC", contentType: null, size: MB5 + 1 } })),
    ).toBe(false);
    expect(
      ok(request({ body: { kind: "original", base64: "no base64!", contentType: null, size: 1 } })),
    ).toBe(false);
  });

  it("los errores llevan claves de _locales en su campo", () => {
    const result = RepeaterRequestSchema.safeParse(request({ url: "nope", method: "1" }));
    expect(result.success).toBe(false);
    const paths = result.error?.issues.map((i) => [i.path.join("."), i.message]);
    expect(paths).toContainEqual(["url", "rule_error_url"]);
    expect(paths).toContainEqual(["method", "rule_error_method"]);
  });
});

describe("RepeaterResponseSchema y RepeaterSendSchema", () => {
  const response = {
    status: 200,
    headers: [{ name: "content-type", value: "application/json" }],
    body: { encoding: "text", text: "{}" },
    mimeType: "application/json",
  };

  it("respuesta con body de texto o solo metadatos", () => {
    expect(RepeaterResponseSchema.safeParse(response).success).toBe(true);
    expect(
      RepeaterResponseSchema.safeParse({
        ...response,
        body: { encoding: "none", info: { available: false, size: 10, reason: "binary" } },
      }).success,
    ).toBe(true);
    expect(RepeaterResponseSchema.safeParse({ ...response, status: 1000 }).success).toBe(false);
  });

  it("envío con estado y error de la lista", () => {
    const send = {
      sendId: "3f1c2b4a-8d9e-4f60-a1b2-c3d4e5f60718",
      request: request(),
      mode: "page",
      startedAt: 1,
      state: "failed",
      response: null,
      error: { code: "context_lost", messageKey: "repeater_error_context_lost" },
      durationMs: null,
      size: null,
      preflight: null,
      ruleEffects: [],
      relaxed: false,
      cors: null,
      notSentHeaders: ["cookie"],
      exchangeId: null,
    };
    expect(RepeaterSendSchema.safeParse(send).success).toBe(true);
    expect(RepeaterSendSchema.safeParse({ ...send, state: "lost" }).success).toBe(false);
    expect(
      RepeaterSendSchema.safeParse({ ...send, error: { code: "boom", messageKey: "x" } }).success,
    ).toBe(false);
  });
});

describe("IgnoreListSchema (research R10)", () => {
  const key = "a".repeat(64);

  it("claves hash y solo rutas y nombres de header", () => {
    const list = {
      version: 1,
      endpoints: {
        [key]: { paths: [[{ key: "meta" }, { key: "timestamp" }]], headers: ["date"], usedAt: 1 },
      },
    };
    expect(IgnoreListSchema.safeParse(list).success).toBe(true);
    expect(
      IgnoreListSchema.safeParse({ ...list, endpoints: { "GET /x": list.endpoints[key] } }).success,
    ).toBe(false);
    expect(
      IgnoreListSchema.safeParse({
        ...list,
        endpoints: { [key]: { ...list.endpoints[key], values: ["secret"] } },
      }).success,
    ).toBe(false);
    expect(
      IgnoreListSchema.safeParse({
        ...list,
        endpoints: { [key]: { ...list.endpoints[key], paths: [[{ any: true }]] } },
      }).success,
    ).toBe(true);
  });

  it(`hasta ${LIMITS.ignoreEntriesMax} entradas por endpoint`, () => {
    const headers = Array.from({ length: LIMITS.ignoreEntriesMax + 1 }, (_, i) => `h${i}`);
    expect(
      IgnoreListSchema.safeParse({
        version: 1,
        endpoints: { [key]: { paths: [], headers, usedAt: 1 } },
      }).success,
    ).toBe(false);
  });
});

describe("schemas del diff", () => {
  it("segmentos de ruta", () => {
    expect(PathSegmentSchema.safeParse({ key: "a" }).success).toBe(true);
    expect(PathSegmentSchema.safeParse({ index: 2 }).success).toBe(true);
    expect(PathSegmentSchema.safeParse({ idField: "id", id: 42 }).success).toBe(true);
    expect(PathSegmentSchema.safeParse({ idField: "name", id: 42 }).success).toBe(false);
    expect(PathSegmentSchema.safeParse({ index: -1 }).success).toBe(false);
  });

  it("respuesta comparable: la pegada no tiene status ni headers", () => {
    expect(
      ComparableResponseSchema.safeParse({
        origin: { kind: "pasted" },
        status: null,
        headers: null,
        body: { kind: "text", text: "{}", contentType: null },
      }).success,
    ).toBe(true);
    expect(
      ComparableResponseSchema.safeParse({
        origin: { kind: "send", sendId: "3f1c2b4a-8d9e-4f60-a1b2-c3d4e5f60718" },
        status: 200,
        headers: [],
        body: { kind: "unavailable", reason: "binary", size: 10 },
      }).success,
    ).toBe(true);
  });

  it("resultado vacío", () => {
    expect(
      DiffResultSchema.safeParse({
        status: null,
        headers: [],
        body: { mode: "equal" },
        ignored: { headers: [], body: [] },
        total: 0,
        notes: [],
      }).success,
    ).toBe(true);
  });
});
