import { describe, expect, it } from "vitest";
import {
  MAX_BODY_BYTES,
  base64ByteLength,
  decodeBody,
  isTextualContentType,
  stripContentEncoding,
  textToBase64,
  utf8ByteLength,
} from "../src/body.ts";

const b64 = (bytes: number[]) => btoa(String.fromCharCode(...bytes));

describe("body (research R7)", () => {
  it("límite de 5 MB", () => {
    expect(MAX_BODY_BYTES).toBe(5 * 1024 * 1024);
  });

  it("tamaños en bytes", () => {
    expect(utf8ByteLength("ñ")).toBe(2);
    expect(base64ByteLength(b64([1, 2, 3, 4]))).toBe(4);
    expect(base64ByteLength(b64([1, 2]))).toBe(2);
    expect(base64ByteLength(b64([1]))).toBe(1);
  });

  it("content-types textuales", () => {
    for (const type of [
      "text/html; charset=utf-8",
      "application/json",
      "application/problem+json",
      "application/xml",
      "image/svg+xml",
      "application/javascript",
      "application/x-www-form-urlencoded",
      "application/graphql-response+json",
    ]) {
      expect(isTextualContentType(type)).toBe(true);
    }
    for (const type of ["image/png", "application/octet-stream", "font/woff2", "video/mp4"]) {
      expect(isTextualContentType(type)).toBe(false);
    }
    expect(isTextualContentType(null)).toBeNull();
  });

  it("decodeBody: texto plano tal cual", () => {
    expect(
      decodeBody({ body: '{"a":1}', base64Encoded: false, contentType: "application/json" }),
    ).toEqual({ kind: "text", text: '{"a":1}', size: 7 });
  });

  it("decodeBody: base64 textual se decodifica como UTF-8", () => {
    const encoded = textToBase64('{"ñ":1}');
    expect(
      decodeBody({ body: encoded, base64Encoded: true, contentType: "application/json" }),
    ).toEqual({ kind: "text", text: '{"ñ":1}', size: 8 });
  });

  it("decodeBody: binario por content-type o por UTF-8 inválido", () => {
    expect(
      decodeBody({ body: b64([137, 80, 78, 71]), base64Encoded: true, contentType: "image/png" }),
    ).toEqual({ kind: "binary", size: 4 });
    expect(
      decodeBody({ body: b64([0xff, 0xfe, 0x00]), base64Encoded: true, contentType: null }),
    ).toEqual({ kind: "binary", size: 3 });
  });

  it("decodeBody: mayor que 5 MB", () => {
    const text = "x".repeat(MAX_BODY_BYTES + 1);
    expect(decodeBody({ body: text, base64Encoded: false, contentType: "text/plain" })).toEqual({
      kind: "tooLarge",
      size: MAX_BODY_BYTES + 1,
    });
  });

  it("textToBase64 es inverso de la decodificación", () => {
    expect(atob(textToBase64("hola"))).toBe("hola");
  });

  it("stripContentEncoding elimina Content-Encoding y recalcula Content-Length", () => {
    expect(
      stripContentEncoding(
        [
          { name: "Content-Encoding", value: "gzip" },
          { name: "content-length", value: "20" },
          { name: "content-type", value: "application/json" },
        ],
        42,
      ),
    ).toEqual([
      { name: "content-type", value: "application/json" },
      { name: "content-length", value: "42" },
    ]);
  });
});
