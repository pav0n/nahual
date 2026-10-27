import { describe, expect, it } from "vitest";
import { exportAs } from "../../src/export/index.ts";
import { exportSourceFromExchange } from "../../src/export/source.ts";
import { headersHook, redirectHook } from "../../src/requestly/templates.ts";
import { getItems, postUpload } from "../fixtures-export.ts";
import { OPTIONS } from "./helpers.ts";

// 007 T071 (plan.md "Revisión de implementación"): lo capturado de la página no puede salir de un
// comentario ni de un string del código exportado. U+2028 y U+2029 terminan una línea en JS y
// `JSON.stringify` no los escapa.

const TERMINATORS = ["\n", "\r", "\u2028", "\u2029"];
const lines = (code: string) => code.split(/\r\n|[\n\r\u2028\u2029]/);
const injected = (code: string) => lines(code).filter((l) => l.trimStart().startsWith("evil("));

describe("comentarios del código exportado", () => {
  it.each(TERMINATORS.map((t) => [JSON.stringify(t), t]))(
    "nombre y archivo de una parte multipart con %s",
    (_label, terminator) => {
      const body = postUpload.requestBody;
      if (body?.kind !== "text") throw new Error("fixture");
      const evil = body.text
        .replace('name="file"', `name="file${terminator}evil(1)"`)
        .replace('filename="photo.png"', `filename="p.png${terminator}evil(2)"`);
      const source = exportSourceFromExchange(
        postUpload.exchange,
        { kind: "text", text: evil },
        postUpload.responseBody,
      );
      for (const format of ["curl", "fetch"] as const) {
        const { code } = exportAs(format, [source], { ...OPTIONS, includeSensitive: true });
        expect(injected(code), format).toEqual([]);
      }
    },
  );
});

describe("marcadores de variables de entorno del test Vitest", () => {
  it("un valor capturado con el marcador no se convierte en env()", () => {
    const exchange = {
      ...getItems.exchange,
      requestHeaders: [
        ...getItems.exchange.requestHeaders,
        { name: "x-trap", value: "\uE000env:AWS_SECRET_ACCESS_KEY\uE001" },
      ],
    };
    const source = exportSourceFromExchange(exchange, getItems.requestBody, getItems.responseBody);
    const { code } = exportAs("vitest", [source], { ...OPTIONS, includeSensitive: false });
    expect(code).not.toContain('AWS_SECRET_ACCESS_KEY")');
    expect(code).not.toContain('env("AWS_SECRET_ACCESS_KEY');
  });
});

describe("plantillas de Requestly", () => {
  it.each(TERMINATORS.map((t) => [JSON.stringify(t), t]))("nombre y valor con %s", (_l, t) => {
    const evil = `x${t}evil(1)`;
    const codes = [
      redirectHook(evil, { key: "Url", operator: "Contains", value: evil }, "https://e.com/"),
      headersHook(evil, { key: "Url", operator: "Contains", value: evil }, "request", [
        { header: "x-a", type: "Add", value: evil },
      ]),
    ];
    for (const code of codes) expect(injected(code)).toEqual([]);
  });
});
