import type { Stage } from "../schemas/common.ts";
import type { RequestlyModification, RequestlySource } from "./schema.ts";
import { sourceToMatch } from "./source.ts";

// Hooks que reproducen reglas de Requestly (007, FR-035, FR-038): plantillas fijas y legibles; todo
// valor que viene del archivo entra con `JSON.stringify`, nunca concatenado, así que no puede
// inyectar código (contracts/requestly-import.md).

const q = JSON.stringify;
const origin = (kind: string, name: string, source: RequestlySource, stage?: Stage) =>
  `// Imported from Requestly · ${kind} ${q(name)}${stage ? ` (${stage})` : ""} · ${source.key} ${source.operator} ${q(source.value)}`;

/** Redirect a una URL: con comodín o regex, `$1…$n` del destino se resuelven con `replace`. */
export function redirectHook(name: string, source: RequestlySource, destination: string): string {
  const match = sourceToMatch(source);
  const capture = "capture" in match ? match.capture : null;
  const body =
    capture === null
      ? [`  ctx.request.url = ${q(destination)};`]
      : [
          `  const pattern = new RegExp(${q(capture)});`,
          `  ctx.request.url = ctx.request.url.replace(pattern, ${q(destination)});`,
        ];
  return [
    origin("Redirect", name, source),
    "export default (ctx: HookContext) => {",
    ...body,
    "  return ctx;",
    "};",
    "",
  ].join("\n");
}

/** Fija, cambia o quita headers en la etapa (request o response). */
export function headersHook(
  name: string,
  source: RequestlySource,
  stage: Stage,
  modifications: readonly RequestlyModification[],
): string {
  const lines = modifications.map((m) =>
    m.type === "Remove"
      ? `  ctx.removeHeader(${q(m.header.toLowerCase())});`
      : `  ctx.setHeader(${q(m.header.toLowerCase())}, ${q(m.value ?? "")});`,
  );
  return [
    origin("Headers", name, source, stage),
    "export default (ctx: HookContext) => {",
    ...(stage === "response" ? ["  if (!ctx.response) return;"] : []),
    ...lines,
    "  return ctx;",
    "};",
    "",
  ].join("\n");
}
