import { transform } from "sucrase";
import { describe, expect, it } from "vitest";
import { HOOK_TEMPLATES, templateSource } from "../src/templates.ts";
import { compileHook } from "./compile.ts";

// T032 (FR-017, contracts/hook-api.md): las plantillas compilan contra la API y se transpilan.

describe("plantillas de hooks", () => {
  it("son las tres de la spec, con su etapa", () => {
    expect(HOOK_TEMPLATES.map((t) => [t.id, t.stage])).toEqual([
      ["addHeader", "request"],
      ["changeJsonField", "response"],
      ["emptyList", "response"],
    ]);
  });

  it.each(HOOK_TEMPLATES.flatMap((t) => (["es", "en"] as const).map((lang) => [t.id, lang])))(
    "%s (%s) compila sin errores de tipo y Sucrase la transpila",
    (id, lang) => {
      const source = templateSource(id as never, lang as "es" | "en");
      expect(compileHook(source)).toEqual([]);
      expect(() => transform(source, { transforms: ["typescript", "imports"] })).not.toThrow();
    },
  );

  it("los comentarios van en el idioma del panel", () => {
    expect(templateSource("addHeader", "es")).toMatch(/Añade/);
    expect(templateSource("addHeader", "en")).toMatch(/Adds/);
  });
});
