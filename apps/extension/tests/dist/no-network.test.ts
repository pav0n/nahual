import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PAGE_ABORT, PAGE_SEND } from "../../src/background/repeater/page-template.ts";
import { DIST, DIST_TEST, filesContaining, listFiles } from "./helpers.ts";

// FR-015 / principio I: la extensión no hace tráfico de red propio ni evalúa código.
const FORBIDDEN = [
  /\bfetch\(/g,
  /XMLHttpRequest/g,
  /\bWebSocket\b/g,
  /\bEventSource\b/g,
  /sendBeacon/g,
  /\beval\(/g,
  /\bFunction\(/g,
  /importScripts/g,
];

/**
 * Código de terceros permitido, con el fragmento exacto que lo justifica:
 * - Zod 4 comprueba si puede compilar schemas con `Function("")` dentro de un try/catch y solo
 *   si `jitless` es falso; @nahual/protocol fija `z.config({ jitless: true })`.
 */
const ALLOWED = [
  /\.jitless\|\|.{0,80}try\{return Function\(``\),!0\}catch\{return!1\}/,
  // - @nahual/domain enumera los `Network.ResourceType` de CDP como texto: `WebSocket` y
  //   `EventSource` son nombres de tipo de recurso dentro de esa lista, no las APIs.
  /`Prefetch`,`EventSource`,`WebSocket`,`Manifest`/,
  // 005 (research R14): el único uso de red propia, el contexto limpio del repeater, junto al
  // permiso que lo acota (`chromeCleanSendDeps`).
  /request:\(\w+,\w+\)=>$/,
  // - El `fetch` de la plantilla del repeater es texto que se ejecuta en la página, no en la
  //   extensión (research R1).
  /\/\* nahual:page-template \*\/ $/,
  // - 006 (research R5): el servicio de tipos incluye `lib.es2022.d.ts` como texto; ahí `eval`
  //   es una declaración de tipos, no una llamada.
  /declare function $/,
];

/** 006: el chunk de la página sandbox de hooks, el único donde se evalúa código. */
const isSandboxChunk = (file: string) => path.basename(file).startsWith("sandbox-");

/**
 * 007: el chunk de "Exportar como…" genera código para el proyecto del dev; su `fetch(` es texto
 * de una plantilla (empieza un template literal), nunca una llamada de la extensión.
 */
const isExportChunk = (file: string) => path.basename(file).startsWith("ExportDialog-");
const TEMPLATE_FETCH = /`fetch\(\$\{/g;

describe("bundles de producción", () => {
  const files = listFiles(DIST).filter((f) => f.endsWith(".js") && !isSandboxChunk(f));

  it("existen", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files.map((f) => [f.slice(DIST.length + 1), f]))(
    "%s no usa red ni evalúa código",
    (_name, file) => {
      const code = readFileSync(file, "utf8");
      const hits: string[] = [];
      for (const pattern of FORBIDDEN) {
        for (const match of code.matchAll(pattern)) {
          const start = Math.max(0, match.index - 160);
          const context = code.slice(start, match.index + 80);
          // Los permitidos de 005 terminan con `$`: se comparan con lo que precede a la llamada.
          const before = code.slice(start, match.index);
          if (isExportChunk(file) && code.startsWith("`fetch(${", match.index - 1)) continue;
          if (!ALLOWED.some((allowed) => allowed.test(context) || allowed.test(before)))
            hits.push(context);
        }
      }
      expect(hits).toEqual([]);
    },
  );
});

describe("dependencias de 002 en los bundles (T103)", () => {
  const code = listFiles(DIST)
    .filter((f) => f.endsWith(".js"))
    .map((f) => readFileSync(f, "utf8"))
    .join("\n");

  // Marcas de cada librería: prueban que los bundles revisados arriba las contienen, así que la
  // comprobación de "sin red propia ni eval" las cubre.
  it.each([
    ["json-p3", /JSONPathSyntaxError/],
    ["zustand + immer", /\[Immer\]|immerable/],
    ["@tanstack/react-virtual", /scrollToIndex/],
  ])("%s está empaquetada", (_name, marker) => {
    expect(marker.test(code)).toBe(true);
  });
});

describe("espía de permisos del build de pruebas (005, research X2)", () => {
  it("no existe en el build de producción", () => {
    expect(filesContaining(DIST, "__nahualPermissionsSpy")).toEqual([]);
    expect(filesContaining(DIST, "__nahualDiffWorkerPing")).toEqual([]);
  });

  it("existe en el build de pruebas", () => {
    expect(filesContaining(DIST_TEST, "__nahualPermissionsSpy").length).toBeGreaterThan(0);
  });
});

describe("gancho de lugares reservados del build de pruebas (004, research R13)", () => {
  it("no existe en el build de producción, ni su contenido simulado", () => {
    expect(filesContaining(DIST, "__nahualUiSlots")).toEqual([]);
    expect(filesContaining(DIST, "Slot wide editor")).toEqual([]);
  });

  it("existe en el build de pruebas", () => {
    expect(filesContaining(DIST_TEST, "__nahualUiSlots").length).toBeGreaterThan(0);
  });
});

describe("red propia del repeater (005, research R14)", () => {
  const files = listFiles(DIST).filter((f) => f.endsWith(".js"));
  const code = (f: string) => readFileSync(f, "utf8");
  const swChunk = readFileSync(path.join(DIST, "service-worker-loader.js"), "utf8").match(
    /import '\.\/(assets\/[^']+)'/,
  )?.[1];

  it("hay exactamente dos fetch( en el build: el del contexto limpio y el texto de la plantilla", () => {
    const hits = files
      .filter((f) => !isExportChunk(f))
      .flatMap((f) => [...code(f).matchAll(/\bfetch\(/g)].map(() => f));
    expect(hits).toHaveLength(2);
    expect(new Set(hits).size).toBe(1);
    expect(swChunk && hits[0]?.endsWith(swChunk)).toBe(true);
    const sw = code(hits[0] ?? "");
    expect(sw).toMatch(/request:\(\w+,\w+\)=>fetch\(\w+,\w+\),hasPermission:/);
  });

  it("las plantillas de página llegan íntegras al bundle del SW (mismo texto que revisa su hash)", () => {
    const sw = code(path.join(DIST, swChunk ?? ""));
    expect(sw.includes(PAGE_SEND)).toBe(true);
    expect(sw.includes(PAGE_ABORT)).toBe(true);
  });

  it("007: en el chunk de exportar, todo fetch( es texto de la plantilla de código", () => {
    const exportChunks = files.filter(isExportChunk);
    expect(exportChunks).toHaveLength(1);
    const text = code(exportChunks[0] ?? "");
    const all = [...text.matchAll(/\bfetch\(/g)].length;
    expect(all).toBeGreaterThan(0);
    expect([...text.matchAll(TEMPLATE_FETCH)].length).toBe(all);
  });

  it("el panel no hace red: el contexto limpio solo existe en el SW", () => {
    const panel = files.filter((f) => !f.endsWith(swChunk ?? "-"));
    expect(panel.filter((f) => /request:\(\w+,\w+\)=>fetch/.test(code(f)))).toEqual([]);
  });
});

describe("sandbox de hooks (006, research R2/R17, contracts/manifest.md)", () => {
  const all = listFiles(DIST).filter((f) => f.endsWith(".js"));
  const sandbox = all.filter(isSandboxChunk);
  const sandboxCode = sandbox.map((f) => readFileSync(f, "utf8")).join("\n");

  it("hay un único chunk del sandbox", () => {
    expect(sandbox).toHaveLength(1);
  });

  it("evalúa código en un solo sitio: el runtime del Worker, con el JS del hook", () => {
    expect(sandboxCode.match(/\bFunction\(/g)?.length ?? 0).toBe(
      sandboxCode.match(/\bFunction\(`exports`,`require`,/g)?.length,
    );
    expect(sandboxCode.match(/\bFunction\(`exports`,`require`,/g)).toHaveLength(1);
    // Sucrase lleva como texto el código que genera su transformación de react-hot-loader (que
    // Nahual no usa): es una cadena, no una llamada.
    const withoutHotLoader = sandboxCode.replace(
      "__regenerateByEval(key, code) {this[key] = eval(code);}",
      "",
    );
    expect(withoutHotLoader).not.toMatch(/\beval\(/);
  });

  it("no hace red: solo nombra las APIs que el runtime bloquea", () => {
    expect(sandboxCode).not.toMatch(/\bfetch\(/);
    expect(sandboxCode).not.toMatch(/new (XMLHttpRequest|WebSocket|EventSource)\(/);
    expect(sandboxCode).not.toMatch(/importScripts\(/);
  });

  it("Sucrase va solo en el sandbox y sin su CLI", () => {
    const code = (f: string) => readFileSync(f, "utf8");
    expect(all.filter((f) => code(f).includes("processExportFunction"))).toEqual(sandbox);
    for (const cli of ["commander", "tinyglobby", "pirates", "mz/fs"])
      expect(filesContaining(DIST, cli), cli).toEqual([]);
  });

  it("la sonda de los experimentos y el gancho de hooks no existen en producción", () => {
    expect(filesContaining(DIST, "PROBE_WORKER")).toEqual([]);
    expect(filesContaining(DIST, "where===`warm`")).toEqual([]);
    expect(filesContaining(DIST, "__nahualHooks")).toEqual([]);
    expect(filesContaining(DIST_TEST, "__nahualHooks").length).toBeGreaterThan(0);
  });
});
