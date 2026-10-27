import { commentText, endpointOf, parseJson, pathname, type ExportOptions } from "./common.ts";
import { LIMITS } from "../schemas/limits.ts";
import type { ExportSource } from "./source.ts";

// Inferencia del schema Zod de una o varias respuestas JSON (007, research R6, FR-015). Primero un
// árbol de tipos que se fusiona muestra a muestra; después el código, con el ancho del proyecto.

type Variant =
  | { kind: "object"; fields: Map<string, Field> }
  | { kind: "array"; items: InferredType | null }
  | { kind: "string"; datetime: boolean }
  | { kind: "number"; int: boolean }
  | { kind: "boolean" }
  | { kind: "unknown" };

interface Field {
  type: InferredType;
  optional: boolean;
}

export interface InferredType {
  nullable: boolean;
  /** Ordenadas por `kind`: la fusión no depende del orden de las muestras. */
  variants: Variant[];
}

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const ORDER = ["array", "boolean", "number", "object", "string", "unknown"];
const byKind = (a: Variant, b: Variant) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind);

export function inferType(value: unknown, depth = 0): InferredType {
  if (value === null) return { nullable: true, variants: [] };
  if (depth >= LIMITS.zodDepthMax && typeof value === "object")
    return { nullable: false, variants: [{ kind: "unknown" }] };
  if (Array.isArray(value)) {
    const items = value.map((item) => inferType(item, depth + 1));
    return {
      nullable: false,
      variants: [{ kind: "array", items: items.length ? items.reduce(mergeTypes) : null }],
    };
  }
  switch (typeof value) {
    case "string":
      return { nullable: false, variants: [{ kind: "string", datetime: ISO.test(value) }] };
    case "number":
      return { nullable: false, variants: [{ kind: "number", int: Number.isInteger(value) }] };
    case "boolean":
      return { nullable: false, variants: [{ kind: "boolean" }] };
    case "object": {
      const fields = new Map<string, Field>();
      for (const [key, item] of Object.entries(value))
        fields.set(key, { type: inferType(item, depth + 1), optional: false });
      return { nullable: false, variants: [{ kind: "object", fields }] };
    }
    default:
      return { nullable: false, variants: [{ kind: "unknown" }] };
  }
}

function mergeVariant(a: Variant, b: Variant): Variant {
  if (a.kind === "object" && b.kind === "object") {
    const fields = new Map<string, Field>();
    // Orden de primera aparición (research R6): las claves de `a` y después las nuevas de `b`. El
    // tipo resultante es el mismo en cualquier orden; solo cambia el orden en que se escriben.
    for (const [key, fa] of a.fields) {
      const fb = b.fields.get(key);
      fields.set(
        key,
        fb
          ? { type: mergeTypes(fa.type, fb.type), optional: fa.optional || fb.optional }
          : { ...fa, optional: true },
      );
    }
    for (const [key, fb] of b.fields)
      if (!a.fields.has(key)) fields.set(key, { ...fb, optional: true });
    return { kind: "object", fields };
  }
  if (a.kind === "array" && b.kind === "array") {
    const items = a.items && b.items ? mergeTypes(a.items, b.items) : (a.items ?? b.items);
    return { kind: "array", items };
  }
  if (a.kind === "string" && b.kind === "string")
    return { kind: "string", datetime: a.datetime && b.datetime };
  if (a.kind === "number" && b.kind === "number") return { kind: "number", int: a.int && b.int };
  return a;
}

/** Fusión de dos tipos inferidos: conmutativa y asociativa salvo el orden de las claves. */
export function mergeTypes(a: InferredType, b: InferredType): InferredType {
  const variants = [...a.variants];
  for (const vb of b.variants) {
    const i = variants.findIndex((va) => va.kind === vb.kind);
    if (i < 0) variants.push(vb);
    else variants[i] = mergeVariant(variants[i] as Variant, vb);
  }
  return { nullable: a.nullable || b.nullable, variants: variants.sort(byKind) };
}

const WIDTH = 100;
const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const keyOf = (name: string) => (IDENT.test(name) ? name : JSON.stringify(name));

/** Código de un tipo; `indent` y `column` deciden si cabe en una línea (como `jsValue`). */
function render(type: InferredType, indent: number, column: number): string {
  const flat = renderFlat(type);
  if (column + flat.length <= WIDTH) return flat;
  return withNullable(type, renderBase(type, indent, column));
}

const withNullable = (type: InferredType, base: string) =>
  type.nullable && type.variants.length > 0 ? `${base}.nullable()` : base;

function renderFlat(type: InferredType): string {
  return withNullable(type, renderBase(type, 0, -Infinity));
}

function renderBase(type: InferredType, indent: number, column: number): string {
  if (type.variants.length === 0) return type.nullable ? "z.null()" : "z.unknown()";
  if (type.variants.length === 1) return renderVariant(type.variants[0] as Variant, indent, column);
  const members = type.variants.map((v) => renderVariant(v, indent, -Infinity)).sort();
  return `z.union([${members.join(", ")}])`;
}

function renderVariant(variant: Variant, indent: number, column: number): string {
  switch (variant.kind) {
    case "string":
      return variant.datetime ? "z.iso.datetime()" : "z.string()";
    case "number":
      return variant.int ? "z.number().int()" : "z.number()";
    case "boolean":
      return "z.boolean()";
    case "unknown":
      return `z.unknown() /* deeper than ${LIMITS.zodDepthMax} levels */`;
    case "array": {
      if (!variant.items) return "z.array(z.unknown())";
      const flat = `z.array(${renderFlat(variant.items)})`;
      if (column + flat.length <= WIDTH) return flat;
      const pad = " ".repeat(indent + 2);
      return `z.array(\n${pad}${render(variant.items, indent + 2, indent + 2)},\n${" ".repeat(indent)})`;
    }
    case "object": {
      const entries = [...variant.fields].map(([name, field]) => {
        const optional = field.optional ? ".optional()" : "";
        return { name: keyOf(name), field, optional };
      });
      if (entries.length === 0) return "z.object({})";
      const flat = `z.object({ ${entries
        .map((e) => `${e.name}: ${renderFlat(e.field.type)}${e.optional}`)
        .join(", ")} })`;
      if (column + flat.length <= WIDTH) return flat;
      const pad = " ".repeat(indent + 2);
      const lines = entries.map((e) => {
        const head = `${pad}${e.name}: `;
        return `${head}${render(e.field.type, indent + 2, head.length)}${e.optional},`;
      });
      return `z.object({\n${lines.join("\n")}\n${" ".repeat(indent)}})`;
    }
  }
}

/** Nombre del schema desde la ruta: segmentos no numéricos en camelCase; `root` si no queda nada. */
export function schemaName(path: string): string {
  const words = path
    .split("/")
    .filter((s) => s && !/^\d+$/.test(s))
    .flatMap((s) => s.split(/[^A-Za-z0-9]+/))
    .filter(Boolean)
    .map((w) => w.toLowerCase());
  const name = words.map((w, i) => (i === 0 ? w : w[0]?.toUpperCase() + w.slice(1))).join("");
  if (!name) return "root";
  return /^\d/.test(name) ? `r${name}` : name;
}

/** Tipo inferido de las respuestas JSON de `sources` (las que no lo son cuentan como `null`). */
export function inferResponses(sources: readonly ExportSource[]): InferredType {
  return sources
    .map((s) => {
      const body = s.response?.body;
      const parsed = body?.kind === "text" ? parseJson(body.text) : { ok: false as const };
      return inferType(parsed.ok ? parsed.value : null);
    })
    .reduce(mergeTypes);
}

/** Expresión Zod de un tipo inferido, empezando en `column` con sangría `indent`. */
export const zodExpression = (type: InferredType, indent: number, column: number) =>
  render(type, indent, column);

/**
 * Schema Zod (código) inferido de las respuestas JSON de uno o varios requests del mismo endpoint
 * (FR-015, FR-016a). Quien llama garantiza que todas tienen body JSON (`FORMATS.zod`).
 */
export function zodSchema(sources: readonly ExportSource[], options: ExportOptions): string {
  const type = inferResponses(sources);
  const first = sources[0];
  const endpoint = first ? endpointOf(first) : "";
  const name = `${schemaName(first ? pathname(first.request.url) : "/")}Response`;
  const typeName = name[0]?.toUpperCase() + name.slice(1);
  const count = `${sources.length} response${sources.length === 1 ? "" : "s"}`;
  const head = `export const ${name} = `;
  return [
    commentText(
      `// Generated by Nahual ${options.appVersion} · zod 4 · inferred from ${count} of ${endpoint}`,
    ),
    'import { z } from "zod";',
    "",
    `${head}${render(type, 0, head.length)};`,
    `export type ${typeName} = z.infer<typeof ${name}>;`,
    "",
  ].join("\n");
}
