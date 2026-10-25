import type { DiffResult, HeaderChange, JsonChange } from "../schemas/diff.ts";
import { MASK, isSensitiveHeader, isSensitiveName } from "../sensitive.ts";

/** Valores reales de lo redactado, para "Mostrar valores sensibles" en ese diff (FR-030). */
export interface RevealedValues {
  headers: Record<number, { before?: string; after?: string }>;
  body: Record<number, { before?: unknown; after?: unknown }>;
  /** `"<hunk>:<línea>"` ⇒ texto real de la línea. */
  lines: Record<string, string>;
}

/** Parámetros de query sensibles dentro de un texto (`?token=…`, `&api_key=…`). */
const QUERY = /([?&])([^=&#\s"']+)=([^&#\s"']*)/g;
/** Pares `"clave": valor` de JSON dentro de una línea. */
const PAIR = /("((?:[^"\\]|\\.)*)"\s*:\s*)("(?:[^"\\]|\\.)*"|[^,}\]\s]+)/g;
/** Línea con forma de header (`Authorization: Bearer …`). */
const HEADER_LINE = /^(\s*)([A-Za-z0-9_-]+)(\s*:\s*)(.+)$/;

function redactText(text: string): string {
  let out = text.replace(QUERY, (all, sep: string, name: string) =>
    isSensitiveName(decodeName(name)) ? `${sep}${name}=${MASK}` : all,
  );
  out = out.replace(PAIR, (all, head: string, key: string) =>
    isSensitiveName(key) ? `${head}"${MASK}"` : all,
  );
  const header = HEADER_LINE.exec(out);
  if (header && (isSensitiveHeader(header[2] ?? "") || isSensitiveName(header[2] ?? "")))
    out = `${header[1]}${header[2]}${header[3]}${MASK}`;
  return out;
}

function decodeName(name: string) {
  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
}

/** Copia del valor con lo que cuelga de claves sensibles (o URLs con query sensible) redactado. */
function redactValue(value: unknown): { value: unknown; changed: boolean } {
  if (typeof value === "string") {
    const text = value.replace(QUERY, (all, sep: string, name: string) =>
      isSensitiveName(decodeName(name)) ? `${sep}${name}=${MASK}` : all,
    );
    return { value: text, changed: text !== value };
  }
  if (Array.isArray(value)) {
    let changed = false;
    const items = value.map((item) => {
      const r = redactValue(item);
      changed ||= r.changed;
      return r.value;
    });
    return { value: items, changed };
  }
  if (value !== null && typeof value === "object") {
    let changed = false;
    const entries = Object.entries(value).map(([key, item]) => {
      if (isSensitiveName(key)) {
        changed = true;
        return [key, MASK];
      }
      const r = redactValue(item);
      changed ||= r.changed;
      return [key, r.value];
    });
    return { value: Object.fromEntries(entries), changed };
  }
  return { value, changed: false };
}

function redactHeader(change: HeaderChange): { change: HeaderChange; sensitive: boolean } {
  if (isSensitiveHeader(change.name)) {
    return {
      change: {
        ...change,
        ...(change.before !== undefined ? { before: MASK } : {}),
        ...(change.after !== undefined ? { after: MASK } : {}),
        sensitive: true,
      },
      sensitive: true,
    };
  }
  const before = change.before === undefined ? undefined : redactText(change.before);
  const after = change.after === undefined ? undefined : redactText(change.after);
  const sensitive = before !== change.before || after !== change.after;
  return {
    change: {
      ...change,
      ...(before !== undefined ? { before } : {}),
      ...(after !== undefined ? { after } : {}),
      sensitive,
    },
    sensitive,
  };
}

function redactChange(change: JsonChange): { change: JsonChange; sensitive: boolean } {
  // Bajo una clave sensible, todo el subárbol lo es (p. ej. `session.id`).
  const underSensitive = change.path.some((s) => "key" in s && isSensitiveName(s.key));
  const side = (value: unknown) => {
    if (value === undefined) return { value, changed: false };
    if (underSensitive) return { value: MASK, changed: true };
    return redactValue(value);
  };
  const before = side(change.before);
  const after = side(change.after);
  const sensitive = before.changed || after.changed;
  return {
    change: {
      ...change,
      ...("before" in change ? { before: before.value } : {}),
      ...("after" in change ? { after: after.value } : {}),
      sensitive,
    },
    sensitive,
  };
}

/**
 * Redacta un diff (005, FR-030, research R11): headers sensibles, campos JSON y parámetros de
 * query con nombre sensible a cualquier profundidad, y lo mismo dentro de cada línea de un diff
 * de texto. El resultado conserva qué cambió sin mostrar ningún fragmento del valor; los valores
 * reales vuelven aparte y solo se muestran con una acción explícita.
 */
export function redactDiff(result: DiffResult): { result: DiffResult; revealed: RevealedValues } {
  const revealed: RevealedValues = { headers: {}, body: {}, lines: {} };
  const headers = result.headers.map((change, index) => {
    const r = redactHeader(change);
    if (r.sensitive)
      revealed.headers[index] = {
        ...(change.before !== undefined ? { before: change.before } : {}),
        ...(change.after !== undefined ? { after: change.after } : {}),
      };
    return r.change;
  });
  const ignoredHeaders = result.ignored.headers.map((change) => redactHeader(change).change);
  const ignoredBody = result.ignored.body.map((change) => redactChange(change).change);
  let body = result.body;
  if (body.mode === "json") {
    body = {
      ...body,
      changes: body.changes.map((change, index) => {
        const r = redactChange(change);
        if (r.sensitive) revealed.body[index] = { before: change.before, after: change.after };
        return r.change;
      }),
    };
  } else if (body.mode === "lines") {
    body = {
      ...body,
      hunks: body.hunks.map((hunk, h) => ({
        ...hunk,
        lines: hunk.lines.map((line, i) => {
          const text = redactText(line.text);
          if (text === line.text) return line;
          revealed.lines[`${h}:${i}`] = line.text;
          return { ...line, text, sensitive: true };
        }),
      })),
    };
  }
  return {
    result: { ...result, headers, body, ignored: { headers: ignoredHeaders, body: ignoredBody } },
    revealed,
  };
}
