import type { PathSegment } from "../schemas/diff.ts";

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/**
 * Ruta legible de un cambio (005): `$.a.b[2]`, `$.items[id=42].price`; las claves que no son
 * identificadores van entre corchetes y comillas, como en JSONPath.
 */
export function formatPath(path: readonly PathSegment[]): string {
  let text = "$";
  for (const segment of path) {
    if ("key" in segment) {
      text += IDENTIFIER.test(segment.key) ? `.${segment.key}` : `[${JSON.stringify(segment.key)}]`;
    } else if ("index" in segment) {
      text += `[${segment.index}]`;
    } else {
      const id = typeof segment.id === "number" ? String(segment.id) : JSON.stringify(segment.id);
      text += `[${segment.idField}=${id}]`;
    }
  }
  return text;
}
