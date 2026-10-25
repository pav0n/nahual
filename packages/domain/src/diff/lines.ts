import type { Hunk } from "../schemas/diff.ts";
import { LIMITS } from "../schemas/limits.ts";

export interface DiffLinesResult {
  hunks: Hunk[];
  truncated: boolean;
  beforeLines: number;
  afterLines: number;
}

type Op = "=" | "-" | "+";

/** Camino de edición como lista enlazada inmutable: los caminos comparten su prefijo. */
interface Step {
  op: Op;
  count: number;
  prev: Step | null;
}

const CONTEXT = 3;

const step = (prev: Step | null, op: Op, count = 1): Step =>
  prev && prev.op === op ? { op, count: prev.count + count, prev: prev.prev } : { op, count, prev };

function splitLines(text: string): string[] {
  if (text === "") return [];
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  if (lines.at(-1) === "") lines.pop();
  return lines;
}

/**
 * Ediciones mínimas entre dos listas de líneas (Myers, O(ND)); `null` si pasan de `max`. Solo
 * guarda el mejor camino de cada diagonal, así la memoria crece con el resultado y no con D².
 */
function edits(a: string[], b: string[], max: number): Op[] | null {
  const n = a.length;
  const m = b.length;
  const snake = (x: number, k: number, path: Step | null): [number, Step | null] => {
    let y = x - k;
    let run = 0;
    while (x < n && y < m && a[x] === b[y]) {
      x++;
      y++;
      run++;
    }
    return [x, run > 0 ? step(path, "=", run) : path];
  };
  const offset = max + 1;
  const xs = new Int32Array(2 * max + 3).fill(-1);
  const paths: (Step | null)[] = new Array(2 * max + 3).fill(null);
  const [x0, p0] = snake(0, 0, null);
  xs[offset] = x0;
  paths[offset] = p0;
  const flatten = (path: Step | null) => {
    const out: Op[] = [];
    for (let s = path; s; s = s.prev) for (let i = 0; i < s.count; i++) out.push(s.op);
    return out.reverse();
  };
  if (x0 >= n && x0 >= m) return flatten(p0);
  for (let d = 1; d <= max; d++) {
    for (let k = -d; k <= d; k += 2) {
      const down = k === -d || (k !== d && (xs[offset + k - 1] ?? -1) < (xs[offset + k + 1] ?? -1));
      let x: number;
      let path: Step | null;
      if (down) {
        x = xs[offset + k + 1] ?? 0;
        path = step(paths[offset + k + 1] ?? null, "+");
      } else {
        x = (xs[offset + k - 1] ?? 0) + 1;
        path = step(paths[offset + k - 1] ?? null, "-");
      }
      const y = x - k;
      if (x > n || y > m || y < 0) {
        xs[offset + k] = -1;
        paths[offset + k] = null;
        continue;
      }
      [x, path] = snake(x, k, path);
      xs[offset + k] = x;
      paths[offset + k] = path;
      if (x >= n && x - k >= m) return flatten(path);
    }
  }
  return null;
}

/**
 * Diff de texto por líneas (005, FR-026, research R8): hunks con 3 líneas de contexto, `\r\n`
 * normalizado. Si hacen falta más de `LIMITS.diffLineEditsMax` ediciones, `truncated` con el
 * recuento de líneas de cada lado.
 */
export function diffLines(before: string, after: string): DiffLinesResult {
  const a = splitLines(before);
  const b = splitLines(after);
  const result = { beforeLines: a.length, afterLines: b.length };
  // Prefijo y sufijo comunes fuera: el caso típico (pocos cambios en un texto largo) es lineal.
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let end = 0;
  while (
    end < a.length - start &&
    end < b.length - start &&
    a[a.length - 1 - end] === b[b.length - 1 - end]
  )
    end++;
  const middle = edits(
    a.slice(start, a.length - end),
    b.slice(start, b.length - end),
    LIMITS.diffLineEditsMax,
  );
  if (middle === null) return { hunks: [], truncated: true, ...result };
  const ops: Op[] = [...Array<Op>(start).fill("="), ...middle, ...Array<Op>(end).fill("=")];
  if (!ops.some((op) => op !== "=")) return { hunks: [], truncated: false, ...result };

  const hunks: Hunk[] = [];
  let i = 0;
  let x = 0;
  let y = 0;
  const positions = ops.map((op) => {
    const at = { op, x, y };
    if (op !== "+") x++;
    if (op !== "-") y++;
    return at;
  });
  while (i < positions.length) {
    if (positions[i]?.op === "=") {
      i++;
      continue;
    }
    const from = Math.max(0, i - CONTEXT);
    let to = i;
    // Un hunk sigue mientras los cambios estén a menos de 2 × contexto.
    for (;;) {
      while (to < positions.length && positions[to]?.op !== "=") to++;
      let gap = to;
      while (gap < positions.length && positions[gap]?.op === "=") gap++;
      if (gap < positions.length && gap - to <= CONTEXT * 2) {
        to = gap;
        continue;
      }
      to = Math.min(positions.length, to + CONTEXT);
      break;
    }
    const first = positions[from];
    if (!first) break;
    const lines = positions.slice(from, to).map((p) => ({
      op: p.op === "=" ? (" " as const) : p.op,
      text: p.op === "+" ? (b[p.y] ?? "") : (a[p.x] ?? ""),
      sensitive: false,
    }));
    hunks.push({ beforeStart: first.x + 1, afterStart: first.y + 1, lines });
    i = to;
  }
  return { hunks, truncated: false, ...result };
}
