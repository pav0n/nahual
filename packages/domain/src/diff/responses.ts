import type { BodyDiff, ComparableResponse, DiffResult, HeaderChange } from "../schemas/diff.ts";
import { utf8Bytes } from "../schemas/limits.ts";
import { diffJson } from "./json.ts";
import { diffLines } from "./lines.ts";

type Header = { name: string; value: string };

/** Valores por nombre en minúsculas, en orden; los repetidos se comparan como lista. */
function grouped(headers: Header[]) {
  const map = new Map<string, string[]>();
  for (const { name, value } of headers) {
    const key = name.toLowerCase();
    map.set(key, [...(map.get(key) ?? []), value]);
  }
  return map;
}

function diffHeaders(before: Header[], after: Header[]): HeaderChange[] {
  const left = grouped(before);
  const right = grouped(after);
  const changes: HeaderChange[] = [];
  for (const [name, values] of left) {
    const other = right.get(name);
    if (!other)
      changes.push({ kind: "removed", name, before: values.join(", "), sensitive: false });
    else if (values.join("\u0000") !== other.join("\u0000"))
      changes.push({
        kind: "changed",
        name,
        before: values.join(", "),
        after: other.join(", "),
        sensitive: false,
      });
  }
  for (const [name, values] of right)
    if (!left.has(name))
      changes.push({ kind: "added", name, after: values.join(", "), sensitive: false });
  return changes;
}

const parse = (text: string): { ok: true; value: unknown } | { ok: false } => {
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false };
  }
};

const saysJson = (contentType: string | null) => /json/i.test(contentType ?? "");

/**
 * Diff de dos respuestas (005, FR-024 a FR-027, research R9): status, headers por nombre en
 * minúsculas y body estructural si los dos son JSON válido, por líneas si no, o solo metadatos si
 * alguno no es texto. La respuesta pegada solo tiene body (FR-022a). Sin ignorados ni redacción:
 * los aplican `applyIgnores` y `redactDiff`.
 */
export function diffResponses(before: ComparableResponse, after: ComparableResponse): DiffResult {
  const notes: DiffResult["notes"] = [];
  const status =
    before.status !== null && after.status !== null && before.status !== after.status
      ? { before: before.status, after: after.status }
      : null;
  const headers = before.headers && after.headers ? diffHeaders(before.headers, after.headers) : [];

  let body: BodyDiff;
  let bodyChanges = 0;
  if (before.body.kind !== "text" || after.body.kind !== "text") {
    const side = (b: ComparableResponse["body"]) =>
      b.kind === "text"
        ? { size: utf8Bytes(b.text), reason: "text" as const }
        : { size: b.size, reason: b.reason };
    body = { mode: "metadata", before: side(before.body), after: side(after.body) };
    notes.push("body_not_compared");
  } else {
    const a = parse(before.body.text);
    const b = parse(after.body.text);
    if (a.ok && b.ok) {
      const { changes, arrays, truncated } = diffJson(a.value, b.value);
      if (truncated) notes.push("truncated");
      bodyChanges = changes.length;
      body =
        changes.length === 0 ? { mode: "equal" } : { mode: "json", changes, arrays, truncated };
    } else {
      if (saysJson(before.body.contentType) || saysJson(after.body.contentType))
        notes.push("json_expected");
      const lines = diffLines(before.body.text, after.body.text);
      if (lines.truncated) notes.push("truncated");
      bodyChanges = lines.hunks.reduce(
        (count, hunk) => count + hunk.lines.filter((l) => l.op !== " ").length,
        0,
      );
      body =
        lines.hunks.length === 0 && !lines.truncated
          ? { mode: "equal" }
          : {
              mode: "lines",
              hunks: lines.hunks,
              truncated: lines.truncated,
              beforeLines: lines.beforeLines,
              afterLines: lines.afterLines,
            };
    }
  }
  return {
    status,
    headers,
    body,
    ignored: { headers: [], body: [] },
    total: (status ? 1 : 0) + headers.length + bodyChanges,
    notes,
  };
}
