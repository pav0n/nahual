import type { DiffResult, JsonChange, PathSegment } from "../schemas/diff.ts";
import type { PathPattern } from "../schemas/repeater.ts";

export interface Ignores {
  paths: PathPattern[];
  headers: string[];
}

const segmentMatches = (pattern: PathPattern[number], segment: PathSegment) => {
  if ("any" in pattern) return !("key" in segment);
  if ("key" in pattern) return "key" in segment && segment.key === pattern.key;
  if ("index" in pattern) return "index" in segment && segment.index === pattern.index;
  return "idField" in segment && segment.idField === pattern.idField && segment.id === pattern.id;
};

/** El patrón es la ruta del cambio o un antecesor suyo: ignorar `$.meta` ignora lo de dentro. */
const matches = (pattern: PathPattern, path: PathSegment[]) =>
  pattern.length <= path.length &&
  pattern.every((p, i) => segmentMatches(p, path[i] as PathSegment));

/**
 * Separa los cambios ignorados (005, FR-028, research R10): rutas de JSON (con `[*]` para
 * cualquier elemento de un array) y nombres de header sin distinguir mayúsculas. Los ignorados
 * salen del total y quedan aparte para mostrarlos a pedido.
 */
export function applyIgnores(result: DiffResult, ignores: Ignores): DiffResult {
  if (ignores.paths.length === 0 && ignores.headers.length === 0) return result;
  const names = new Set(ignores.headers.map((h) => h.toLowerCase()));
  const headers = result.headers.filter((h) => !names.has(h.name));
  const ignoredHeaders = result.headers.filter((h) => names.has(h.name));
  let body = result.body;
  let ignoredBody: JsonChange[] = [];
  if (body.mode === "json") {
    const ignored = (c: JsonChange) => ignores.paths.some((p) => matches(p, c.path));
    ignoredBody = body.changes.filter(ignored);
    const changes = body.changes.filter((c) => !ignored(c));
    body = changes.length === 0 && !body.truncated ? { mode: "equal" } : { ...body, changes };
  }
  const removed = ignoredHeaders.length + ignoredBody.length;
  return {
    ...result,
    headers,
    body,
    ignored: {
      headers: [...result.ignored.headers, ...ignoredHeaders],
      body: [...result.ignored.body, ...ignoredBody],
    },
    total: result.total - removed,
  };
}
