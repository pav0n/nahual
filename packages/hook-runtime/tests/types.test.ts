import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

// T015: la API pública compila hooks válidos y marca como error lo que un hook no puede usar.

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

describe("hook-context.d.ts (contracts/hook-api.md)", () => {
  it.each([
    [
      "con import type",
      `import type { HookContext } from "./nahual-hooks";
export default (ctx: HookContext) => { ctx.setHeader("x-debug", "nahual"); return ctx; };`,
    ],
    [
      "con el tipo global y async",
      `export default async (ctx: HookContext) => {
  if (!ctx.response) return;
  const data = ctx.json<{ items: number[] }>();
  data.items = [];
  ctx.response.body = JSON.stringify(data);
  ctx.state.count = ((ctx.state.count as number) ?? 0) + 1;
  ctx.log("items", data.items.length, new URL(ctx.request.url).searchParams.get("page"));
  await new Promise<void>((resolve) => setTimeout(resolve, 10));
  return ctx;
};`,
    ],
    [
      "respond en etapa Request",
      `export default (ctx: HookContext) => {
  const id = Number(new URL(ctx.request.url).pathname.split("/").pop());
  if (ctx.graphql?.operationName === "GetUser") console.log("graphql");
  ctx.respond({ status: 200, body: { id } });
};`,
    ],
  ])("compila un hook válido (%s)", (_name, source) => {
    expect(compileHook(source)).toEqual([]);
  });

  it.each([
    ["fetch", `export default (ctx: HookContext) => { fetch(ctx.request.url); };`],
    ["document", `export default (ctx: HookContext) => { document.cookie = "a"; };`],
    ["window", `export default (ctx: HookContext) => { window.location.href = ctx.request.url; };`],
    ["XMLHttpRequest", `export default () => { new XMLHttpRequest(); };`],
    ["chrome", `export default () => { chrome.runtime.sendMessage("x"); };`],
    [
      "status de texto",
      `export default (ctx: HookContext) => { if (ctx.response) ctx.response.status = "x"; };`,
    ],
  ])("marca como error %s", (_name, source) => {
    expect(compileHook(source).length).toBeGreaterThan(0);
  });
});
