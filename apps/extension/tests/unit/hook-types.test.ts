import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createHookTypesService } from "../../src/panel/hooks/hook-types-service.ts";

// T033 (FR-015, FR-016, SC-005, research R4): autocompletado, tipos y sintaxis no admitida.

const require = createRequire(import.meta.url);
const libDir = path.dirname(require.resolve("typescript/lib/lib.es2022.d.ts"));
const libs = Object.fromEntries(
  readdirSync(libDir)
    .filter((f) => /^lib\.(es5|es20\d\d[\w.]*|decorators[\w.]*)\.d\.ts$/.test(f))
    .map((f) => [f, readFileSync(path.join(libDir, f), "utf8")]),
);
const dts = readFileSync(
  new URL("../../../../packages/hook-runtime/src/hook-context.d.ts", import.meta.url),
  "utf8",
);

const service = createHookTypesService(libs, dts);
const check = (source: string) => {
  service.update(source);
  return service.diagnostics();
};

describe("servicio de tipos de los hooks", () => {
  it("un hook válido no tiene diagnósticos", () => {
    expect(
      check(`export default (ctx: HookContext) => { ctx.setHeader("a", "b"); return ctx; };`),
    ).toEqual([]);
  });

  it("errores de tipo con su línea: status de texto y fetch", () => {
    const found = check(
      `export default (ctx: HookContext) => {\n  if (ctx.response) ctx.response.status = "x";\n  fetch("/x");\n};`,
    );
    expect(found.map((d) => d.line)).toEqual([2, 3]);
    expect(found.every((d) => d.severity === "error")).toBe(true);
  });

  it.each([
    ["enum", `enum A { B }\nexport default (ctx: HookContext) => ctx;`, "hook_error_enum"],
    [
      "import",
      `import x from "lodash";\nexport default (ctx: HookContext) => ctx;`,
      "hook_error_import",
    ],
    ["require", `export default (ctx: HookContext) => { require("fs"); };`, "hook_error_import"],
    [
      "export con nombre",
      `export const x = 1;\nexport default (ctx: HookContext) => ctx;`,
      "hook_error_export",
    ],
    ["sin export default", `const f = (ctx: HookContext) => ctx;`, "hook_error_no_default"],
  ])("marca %s", (_name, source, message) => {
    expect(check(source).map((d) => d.message)).toContain(message);
  });

  it("admite import type de ./nahual-hooks", () => {
    expect(
      check(
        `import type { HookContext } from "./nahual-hooks";\nexport default (ctx: HookContext) => ctx;`,
      ),
    ).toEqual([]);
  });

  it("autocompleta ctx. con la descripción de la API", () => {
    const source = `export default (ctx: HookContext) => { ctx. };`;
    service.update(source);
    const items = service.completions(source.indexOf("ctx. ") + 4);
    expect(items.map((i) => i.label)).toEqual(
      expect.arrayContaining([
        "request",
        "response",
        "state",
        "log",
        "json",
        "setHeader",
        "respond",
      ]),
    );
    expect(items.find((i) => i.label === "state")?.detail).toMatch(/1 MB/);
  });

  it("quickInfo describe un miembro", () => {
    const source = `export default (ctx: HookContext) => { ctx.respond; };`;
    service.update(source);
    expect(service.quickInfo(source.indexOf("respond") + 2)).toMatch(/Request/);
  });

  it("un hook de 200 líneas se analiza en menos de 1 s (SC-005)", () => {
    const lines = Array.from(
      { length: 196 },
      (_, i) => `  ctx.log("línea ${i}", ctx.request.url.length + ${i});`,
    ).join("\n");
    const source = `export default (ctx: HookContext) => {\n${lines}\n  return ctx;\n};`;
    check(source); // primer análisis: carga las libs
    const started = performance.now();
    service.update(`${source}\n`);
    service.diagnostics();
    service.completions(source.indexOf("ctx.log") + 4);
    expect(performance.now() - started).toBeLessThan(1000);
  });
});
