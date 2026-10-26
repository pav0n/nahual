import { describe, expect, it } from "vitest";
import { parseHookFile, serializeHookFile } from "../src/hook-file.ts";

// T053 (contracts/hook-file.md, FR-035 a FR-038).

const config = {
  name: "Lista vacía en /api/items",
  stage: "response" as const,
  prefilter: { kind: "glob" as const, pattern: "*/api/items*" },
  methods: [],
  resourceTypes: ["Fetch" as const, "XHR" as const],
  conditions: [{ kind: "status" as const, op: "eq" as const, value: 200 }],
};
const source = `export default (ctx: HookContext) => {\n  const d = ctx.json<{ items: unknown[] }>();\n  d.items = [];\n  ctx.response!.body = JSON.stringify(d);\n  return ctx;\n};\n`;

describe("archivo de hook .ts", () => {
  it("ida y vuelta idéntica de configuración y código", () => {
    const file = serializeHookFile(config, source);
    expect(file.startsWith("/* @nahual-hook 1\n")).toBe(true);
    expect(parseHookFile(file)).toEqual({ config, source });
  });

  it("un prefiltro con */ no cierra el comentario", () => {
    const file = serializeHookFile(config, source);
    const header = file.slice(0, file.indexOf("*/\n") + 2);
    expect(header.match(/\*\//g)).toHaveLength(1);
    expect(file).toContain(String.raw`"*\/api/items*"`);
    expect(parseHookFile(file).config?.prefilter).toEqual({
      kind: "glob",
      pattern: "*/api/items*",
    });
  });

  it("nunca exporta permisos, sitio, id, orden, estado ni check", () => {
    const file = serializeHookFile(
      {
        ...config,
        id: "x",
        site: "s",
        order: 2,
        enabled: true,
        permissions: {},
        check: {},
      } as never,
      source,
    );
    for (const field of ["permissions", "site", '"id"', '"order"', "enabled", "check"])
      expect(file).not.toContain(field);
  });

  it("sin bloque: solo el código y el motivo", () => {
    expect(parseHookFile(source)).toEqual({
      config: null,
      configError: "hook_file_no_config",
      source,
    });
  });

  it("JSON inválido o configuración inválida: el código igual, con el motivo", () => {
    const badJson = `/* @nahual-hook 1\n{ nope }\n*/\n${source}`;
    expect(parseHookFile(badJson)).toMatchObject({
      config: null,
      configError: "hook_file_bad_json",
    });
    const badConfig = `/* @nahual-hook 1\n${JSON.stringify({ ...config, name: "x".repeat(81) })}\n*/\n${source}`;
    expect(parseHookFile(badConfig)).toMatchObject({
      config: null,
      configError: "hook_file_bad_config",
    });
    expect(parseHookFile(badJson).source).toBe(source);
  });

  it("admite import type de ./nahual-hooks en el código", () => {
    const withImport = `import type { HookContext } from "./nahual-hooks";\n${source}`;
    expect(parseHookFile(serializeHookFile(config, withImport)).source).toBe(withImport);
  });
});
