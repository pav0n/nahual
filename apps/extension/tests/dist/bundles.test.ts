import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DIST, listFiles } from "./helpers.ts";

// 006 SC-007, FR-019 (research R4): el editor de hooks, TypeScript y Sucrase no entran en la
// carga inicial del panel, que crece como mucho un 10 % sobre la de 005.

/** Carga inicial del panel en 005 (bytes de los imports estáticos de panel.html, build de main). */
const PANEL_INITIAL_005 = 606_793;

/** Archivos que carga panel.html sin `import()` dinámico. */
function initialGraph(): string[] {
  const html = readFileSync(path.join(DIST, "src/panel/panel.html"), "utf8");
  const seen = new Set<string>();
  const queue = [...html.matchAll(/(?:src|href)="\/(assets\/[^"]+\.(?:js|css))"/g)].map(
    (m) => m[1] ?? "",
  );
  while (queue.length > 0) {
    const file = queue.shift() ?? "";
    if (seen.has(file)) continue;
    seen.add(file);
    if (!file.endsWith(".js")) continue;
    const code = readFileSync(path.join(DIST, file), "utf8");
    for (const m of code.matchAll(
      /(?:^|[;}\s])import(?:[^"'`()]*?from)?\s*["'`]\.\/([^"'`]+\.js)["'`]/g,
    ))
      queue.push(`assets/${m[1] ?? ""}`);
  }
  return [...seen];
}

describe("carga inicial del panel (006, SC-007)", () => {
  const files = initialGraph();
  const code = files.map((f) => readFileSync(path.join(DIST, f), "utf8")).join("\n");

  it("no incluye el editor de código, TypeScript ni Sucrase", () => {
    expect(code).not.toContain("cm-content");
    expect(code).not.toContain("createLanguageService");
    expect(code).not.toContain("processExportFunction");
  });

  it("el editor y el servicio de tipos van en chunks aparte", () => {
    const assets = listFiles(path.join(DIST, "assets")).map((f) => path.basename(f));
    expect(assets.some((f) => f.startsWith("HookEditor-"))).toBe(true);
    expect(assets.some((f) => f.startsWith("hook-types.worker-"))).toBe(true);
  });

  it("crece como mucho un 10 % sobre 005", () => {
    const bytes = files.reduce((sum, f) => sum + readFileSync(path.join(DIST, f)).length, 0);
    expect(bytes).toBeLessThanOrEqual(PANEL_INITIAL_005 * 1.1);
  });
});
