import { ID_FIELDS, type IdField, type JsonChange, type PathSegment } from "../schemas/diff.ts";
import { LIMITS } from "../schemas/limits.ts";

export interface DiffJsonResult {
  changes: JsonChange[];
  /** Criterio con el que se comparó cada array no vacío (FR-025a). */
  arrays: { path: PathSegment[]; criterion: IdField | "index" }[];
  truncated: boolean;
}

/** Más allá de esta profundidad se compara el subárbol entero (la ruta queda acotada). */
const MAX_DEPTH = 200;

type Kind = "null" | "array" | "object" | "string" | "number" | "boolean";

const kindOf = (value: unknown): Kind =>
  value === null
    ? "null"
    : Array.isArray(value)
      ? "array"
      : (typeof value as "object" | "string" | "number" | "boolean");

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  kindOf(value) === "object";

/** Igualdad profunda sin recursión: los JSON muy anidados no desbordan la pila. */
function deepEqual(a: unknown, b: unknown): boolean {
  const stack: [unknown, unknown][] = [[a, b]];
  while (stack.length > 0) {
    const [x, y] = stack.pop() as [unknown, unknown];
    const kind = kindOf(x);
    if (kind !== kindOf(y)) return false;
    if (kind === "array") {
      const left = x as unknown[];
      const right = y as unknown[];
      if (left.length !== right.length) return false;
      for (let i = 0; i < left.length; i++) stack.push([left[i], right[i]]);
    } else if (kind === "object") {
      const left = x as Record<string, unknown>;
      const right = y as Record<string, unknown>;
      const keys = Object.keys(left);
      if (keys.length !== Object.keys(right).length) return false;
      for (const key of keys) {
        if (!Object.hasOwn(right, key)) return false;
        stack.push([left[key], right[key]]);
      }
    } else if (x !== y) return false;
  }
  return true;
}

/** Primer campo de `ID_FIELDS` que todos los elementos tienen con valor único en cada lado. */
function idFieldOf(before: unknown[], after: unknown[]): IdField | null {
  if (before.length + after.length === 0) return null;
  const all = [...before, ...after];
  if (!all.every(isPlainObject)) return null;
  for (const field of ID_FIELDS) {
    const valid = (list: Record<string, unknown>[]) => {
      const seen = new Set<unknown>();
      for (const item of list) {
        const id = item[field];
        if (typeof id !== "string" && typeof id !== "number") return false;
        if (seen.has(id)) return false;
        seen.add(id);
      }
      return true;
    };
    if (valid(before as Record<string, unknown>[]) && valid(after as Record<string, unknown>[]))
      return field;
  }
  return null;
}

/**
 * Diff estructural de dos valores JSON (005, FR-025, FR-025a, research R7): objetos por clave (el
 * orden no cuenta), arrays por identidad (`id`, `_id`, `uuid` o `key`) o por posición, y un
 * cambio de tipo como un solo `changed`. Corta en `LIMITS.diffChangesMax` cambios.
 */
export function diffJson(before: unknown, after: unknown): DiffJsonResult {
  const changes: JsonChange[] = [];
  const arrays: DiffJsonResult["arrays"] = [];
  let truncated = false;

  const push = (change: Omit<JsonChange, "sensitive">) => {
    if (changes.length >= LIMITS.diffChangesMax) {
      truncated = true;
      return false;
    }
    changes.push({ ...change, sensitive: false });
    return true;
  };

  const walk = (a: unknown, b: unknown, path: PathSegment[]): boolean => {
    if (truncated) return false;
    const kind = kindOf(a);
    if (kind !== kindOf(b)) return push({ kind: "changed", path, before: a, after: b });
    if (kind !== "array" && kind !== "object") {
      return a === b || push({ kind: "changed", path, before: a, after: b });
    }
    if (path.length >= MAX_DEPTH) {
      return deepEqual(a, b) || push({ kind: "changed", path, before: a, after: b });
    }
    if (kind === "object") {
      const left = a as Record<string, unknown>;
      const right = b as Record<string, unknown>;
      for (const key of Object.keys(left)) {
        const next = [...path, { key }];
        if (!Object.hasOwn(right, key)) {
          if (!push({ kind: "removed", path: next, before: left[key] })) return false;
        } else if (!walk(left[key], right[key], next)) return false;
      }
      for (const key of Object.keys(right)) {
        if (
          !Object.hasOwn(left, key) &&
          !push({ kind: "added", path: [...path, { key }], after: right[key] })
        )
          return false;
      }
      return true;
    }
    const left = a as unknown[];
    const right = b as unknown[];
    const field = idFieldOf(left, right);
    if (left.length + right.length > 0) arrays.push({ path, criterion: field ?? "index" });
    if (field) {
      const byId = new Map<unknown, Record<string, unknown>>();
      for (const item of left as Record<string, unknown>[]) byId.set(item[field], item);
      const seen = new Set<unknown>();
      for (const item of right as Record<string, unknown>[]) {
        const id = item[field] as string | number;
        seen.add(id);
        const segment = { idField: field, id };
        const match = byId.get(id);
        if (match === undefined) {
          if (!push({ kind: "added", path: [...path, segment], after: item })) return false;
        } else if (!walk(match, item, [...path, segment])) return false;
      }
      for (const item of left as Record<string, unknown>[]) {
        const id = item[field] as string | number;
        if (
          !seen.has(id) &&
          !push({ kind: "removed", path: [...path, { idField: field, id }], before: item })
        )
          return false;
      }
      return true;
    }
    const common = Math.min(left.length, right.length);
    for (let index = 0; index < common; index++) {
      if (!walk(left[index], right[index], [...path, { index }])) return false;
    }
    for (let index = common; index < right.length; index++) {
      if (!push({ kind: "added", path: [...path, { index }], after: right[index] })) return false;
    }
    for (let index = common; index < left.length; index++) {
      if (!push({ kind: "removed", path: [...path, { index }], before: left[index] })) return false;
    }
    return true;
  };

  walk(before, after, []);
  return { changes, arrays: arrays.slice(0, LIMITS.diffChangesMax), truncated };
}
