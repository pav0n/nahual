import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import ts from "typescript";

const DTS = readFileSync(new URL("../src/hook-context.d.ts", import.meta.url), "utf8");

/** Compila un hook con `lib.es2022` y los tipos de Nahual; devuelve los mensajes de error. */
export function compileHook(source: string): string[] {
  const dir = mkdtempSync(path.join(tmpdir(), "nahual-hook-"));
  writeFileSync(path.join(dir, "nahual-hooks.d.ts"), DTS);
  const file = path.join(dir, "hook.ts");
  writeFileSync(file, source);
  const program = ts.createProgram([file, path.join(dir, "nahual-hooks.d.ts")], {
    lib: ["lib.es2022.d.ts"],
    types: [],
    strict: true,
    noEmit: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
  });
  return ts
    .getPreEmitDiagnostics(program)
    .map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n"));
}
