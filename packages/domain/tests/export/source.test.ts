import { describe, expect, it } from "vitest";
import { exportSourceFromExchange, exportSourceFromRepeater } from "../../src/export/source.ts";
import {
  AUTH,
  failed,
  getBinary,
  getItems,
  postBig,
  postForm,
  postItem,
  postUpload,
  type ExportFixture,
} from "../fixtures-export.ts";

const from = (f: ExportFixture) =>
  exportSourceFromExchange(f.exchange, f.requestBody, f.responseBody);

describe("exportSourceFromExchange (007, data-model, research R2/R4)", () => {
  it("método y URL tal cual; headers en minúsculas sin los del navegador salvo cookie y referer", () => {
    const get = from(getItems);
    expect(get.request).toMatchObject({
      method: "GET",
      url: "http://127.0.0.1:4311/export/items?page=1",
    });
    expect(get.request.headers).toEqual([
      { name: "accept", value: "application/json" },
      { name: "authorization", value: AUTH },
      { name: "user-agent", value: "Mozilla/5.0" },
    ]);
    expect(from(postItem).request.headers.map((h) => h.name)).toEqual([
      "content-type",
      "cookie",
      "x-api-key",
      "referer",
    ]);
  });

  it("body de texto con su content-type, formulario y multipart", () => {
    expect(from(postItem).request.body).toMatchObject({
      kind: "text",
      contentType: "application/json",
    });
    expect(from(postForm).request.body).toEqual({
      kind: "form",
      fields: [
        { name: "a", value: "1" },
        { name: "session_id", value: "secret-form" },
      ],
    });
    expect(from(postUpload).request.body).toEqual({
      kind: "multipart",
      parts: [
        { kind: "field", name: "note", value: "hola" },
        { kind: "file", name: "file", filename: "photo.png" },
      ],
    });
  });

  it("omite bodies binarios y de más de 1 MB, y marca los no disponibles", () => {
    expect(from(getBinary).response?.body).toEqual({ kind: "omitted", reason: "binary", size: 8 });
    expect(from(postBig).request.body).toMatchObject({ kind: "omitted", reason: "tooLarge" });
    const lost = { ...getItems, responseBody: null };
    expect(from(lost).response?.body).toEqual({
      kind: "omitted",
      reason: "unavailable",
      size: null,
    });
    expect(from(getItems).request.body).toEqual({ kind: "none" });
  });

  it("sin respuesta (fallido) ⇒ response null", () => {
    expect(from(failed).response).toBeNull();
  });

  it("respuesta con status, headers y content-type", () => {
    expect(from(getItems).response).toMatchObject({
      status: 200,
      mimeType: "application/json",
      body: { kind: "text", contentType: "application/json" },
    });
  });
});

describe("exportSourceFromRepeater (007, US1-6)", () => {
  it("usa solo los headers activos y la respuesta seleccionada", () => {
    const source = exportSourceFromRepeater(
      {
        method: "post",
        url: "http://127.0.0.1:4311/export/items",
        headers: [
          { name: "Content-Type", value: "application/json", enabled: true },
          { name: "x-off", value: "1", enabled: false },
          { name: "sec-fetch-mode", value: "cors", enabled: true },
        ],
        body: { kind: "text", text: '{"a":1}' },
      },
      {
        status: 201,
        headers: [{ name: "content-type", value: "application/json" }],
        body: { encoding: "text", text: '{"created":true}' },
        mimeType: "application/json",
      },
      5,
    );
    expect(source.request.method).toBe("POST");
    expect(source.request.headers).toEqual([{ name: "content-type", value: "application/json" }]);
    expect(source.response).toMatchObject({
      status: 201,
      body: { kind: "text", text: '{"created":true}' },
    });
    expect(source.capturedAt).toBe(5);
  });

  it("body original binario ⇒ omitido; sin respuesta ⇒ null", () => {
    const source = exportSourceFromRepeater(
      {
        method: "PUT",
        url: "http://127.0.0.1:4311/x",
        headers: [],
        body: { kind: "original", base64: "AAAA", contentType: "image/png", size: 3 },
      },
      null,
      1,
    );
    expect(source.request.body).toEqual({ kind: "omitted", reason: "binary", size: 3 });
    expect(source.response).toBeNull();
  });
});
