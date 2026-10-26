import { describe, expect, it } from "vitest";
import { validateHookResult } from "../src/validate.ts";
import { requestContext, responseContext } from "./fixtures.ts";

const NO = { changeDestination: false, readSensitive: false };
const YES = { changeDestination: true, readSensitive: false };

describe("validateHookResult (R6, FR-010, FR-011)", () => {
  it("sin cambios ⇒ unchanged", () => {
    expect(validateHookResult(requestContext(), requestContext(), null, NO)).toEqual({
      kind: "unchanged",
    });
  });

  it("etapa Request: método, headers y body cambiados ⇒ edit con sus partes", () => {
    const after = requestContext();
    after.request.method = "PUT";
    after.request.headers["x-debug"] = "nahual";
    after.request.body = { kind: "text", text: "{}", contentType: null, size: 2 };
    const effect = validateHookResult(requestContext(), after, null, NO);
    expect(effect).toMatchObject({ kind: "edit", parts: ["method", "headers", "body"] });
  });

  it("ruta o query nuevas no necesitan permiso", () => {
    const after = requestContext();
    after.request.url = "http://127.0.0.1:4311/otra?x=1";
    expect(validateHookResult(requestContext(), after, null, NO)).toMatchObject({
      kind: "edit",
      parts: ["url"],
    });
  });

  it("otro origen sin permiso ⇒ error destino; con permiso ⇒ edit", () => {
    const after = requestContext();
    after.request.url = "http://127.0.0.1:4312/hooks/items";
    expect(validateHookResult(requestContext(), after, null, NO)).toMatchObject({
      kind: "error",
      type: "invalid_result",
      field: "url",
      message: "hook_error_destination",
    });
    expect(validateHookResult(requestContext(), after, null, YES)).toMatchObject({
      kind: "edit",
      parts: ["url"],
    });
  });

  it("valida con las reglas de 002: URL no http, método inválido, header con nombre inválido", () => {
    const url = requestContext();
    url.request.url = "ftp://files.test/a";
    expect(validateHookResult(requestContext(), url, null, YES)).toMatchObject({
      kind: "error",
      field: "url",
    });
    const method = requestContext();
    method.request.method = "GE T";
    expect(validateHookResult(requestContext(), method, null, NO)).toMatchObject({
      kind: "error",
      field: "method",
    });
    const header = requestContext();
    header.request.headers["bad name"] = "1";
    expect(validateHookResult(requestContext(), header, null, NO)).toMatchObject({
      kind: "error",
      field: "headers",
    });
  });

  it("campos de solo lectura cambiados ⇒ invalid_result con el campo", () => {
    const after = { ...requestContext(), resourceType: "Document" };
    expect(validateHookResult(requestContext(), after, null, NO)).toMatchObject({
      kind: "error",
      field: "resourceType",
    });
  });

  it("etapa Response: status y body; el request es de solo lectura", () => {
    const after = responseContext();
    if (!after.response) throw new Error();
    after.response.status = 503;
    after.response.body = {
      kind: "text",
      text: '{"items":[]}',
      contentType: "application/json",
      size: 12,
    };
    expect(validateHookResult(responseContext(), after, null, NO)).toMatchObject({
      kind: "edit",
      parts: ["status", "body"],
    });
    const request = responseContext();
    request.request.method = "DELETE";
    expect(validateHookResult(responseContext(), request, null, NO)).toMatchObject({
      kind: "error",
      field: "request",
    });
    const status = responseContext();
    if (status.response) status.response.status = 999;
    expect(validateHookResult(responseContext(), status, null, NO)).toMatchObject({
      kind: "error",
      field: "status",
    });
  });

  it("un body de texto nuevo reemplaza a uno binario", () => {
    const before = responseContext();
    if (before.response)
      before.response.body = { kind: "binary", contentType: "image/png", size: 100 };
    const after = structuredClone(before);
    if (after.response)
      after.response.body = { kind: "text", text: "hola", contentType: "image/png", size: 4 };
    expect(validateHookResult(before, after, null, NO)).toMatchObject({
      kind: "edit",
      parts: ["body"],
    });
  });

  it("respond solo en etapa Request y con un mock válido", () => {
    const respond = {
      status: 200,
      headers: { "content-type": "application/json" },
      body: '{"id":1}',
    };
    expect(validateHookResult(requestContext(), requestContext(), respond, NO)).toEqual({
      kind: "respond",
      ...respond,
    });
    expect(validateHookResult(responseContext(), responseContext(), respond, NO)).toMatchObject({
      kind: "error",
      field: "respond",
    });
    expect(
      validateHookResult(requestContext(), requestContext(), { ...respond, status: 42 }, NO),
    ).toMatchObject({ kind: "error", field: "status" });
  });
});
