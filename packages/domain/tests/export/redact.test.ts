import { describe, expect, it } from "vitest";
import { exportSourceFromExchange } from "../../src/export/source.ts";
import { REDACTED, redactExportSource } from "../../src/sensitive.ts";
import { getItems, postForm, postItem, postUpload } from "../fixtures-export.ts";

const source = (f: typeof getItems) =>
  exportSourceFromExchange(f.exchange, f.requestBody, f.responseBody);

describe("redactExportSource (007, research R3, FR-010)", () => {
  it("redacta headers de request y response, query y campos JSON del body", () => {
    const { source: out, redacted } = redactExportSource(source(postItem));
    const json = JSON.stringify(out);
    for (const secret of [
      "secret-cookie-value",
      "secret-api-key",
      "secret-query-token",
      "secret-body-password",
    ])
      expect(json).not.toContain(secret);
    expect(out.request.url).toBe(`http://127.0.0.1:4311/export/items?token=${REDACTED}&lang=es`);
    expect(redacted.map((s) => [s.side, s.where, s.name, s.envVar, s.postmanVar])).toEqual([
      ["request", "header", "cookie", "NAHUAL_COOKIE", "nahual_cookie"],
      ["request", "header", "x-api-key", "NAHUAL_X_API_KEY", "nahual_x_api_key"],
      ["request", "query", "token", "NAHUAL_QUERY_TOKEN", "nahual_query_token"],
      ["request", "body", "password", "NAHUAL_BODY_PASSWORD", "nahual_body_password"],
    ]);
  });

  it("redacta set-cookie de la respuesta y lo cuenta del lado response", () => {
    const { source: out, redacted } = redactExportSource(source(getItems));
    expect(out.request.headers.find((h) => h.name === "authorization")?.value).toBe(REDACTED);
    expect(out.response?.headers.find((h) => h.name === "set-cookie")?.value).toBe(REDACTED);
    expect(redacted.filter((s) => s.side === "response").map((s) => s.name)).toEqual([
      "set-cookie",
    ]);
  });

  it("redacta campos de formulario y partes multipart con nombre sensible", () => {
    const form = redactExportSource(source(postForm));
    expect(form.source.request.body).toEqual({
      kind: "form",
      fields: [
        { name: "a", value: "1" },
        { name: "session_id", value: REDACTED },
      ],
    });
    expect(redactExportSource(source(postUpload)).redacted).toEqual([]);
  });

  it("acepta un marcador por sitio y desambigua nombres de variable repetidos", () => {
    const base = source(postItem);
    const twice = {
      ...base,
      request: {
        ...base.request,
        headers: [...base.request.headers, { name: "cookie", value: "otra" }],
      },
    };
    const { source: out, redacted } = redactExportSource(twice, (site) => `{{${site.postmanVar}}}`);
    expect(redacted.filter((s) => s.name === "cookie").map((s) => s.envVar)).toEqual([
      "NAHUAL_COOKIE",
      "NAHUAL_COOKIE_2",
    ]);
    expect(out.request.headers.filter((h) => h.name === "cookie").map((h) => h.value)).toEqual([
      "{{nahual_cookie}}",
      "{{nahual_cookie_2}}",
    ]);
  });

  it("no toca un body de texto no JSON y no cambia la entrada", () => {
    const base = source(postItem);
    const plain = {
      ...base,
      request: {
        ...base.request,
        body: { kind: "text" as const, text: "password=x", contentType: "text/plain" },
      },
    };
    const before = JSON.stringify(plain);
    expect(redactExportSource(plain).source.request.body).toEqual(plain.request.body);
    expect(JSON.stringify(plain)).toBe(before);
  });
});
