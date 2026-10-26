// Impresor de literales JavaScript de los exportadores (007): determinista, con el ancho de
// línea del proyecto (100) y claves sin comillas cuando son identificadores.

const WIDTH = 100;
const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/** Marcador de un valor redactado que el test Vitest lee de una variable de entorno (R3, R7). */
// Caracteres de uso privado: no aparecen en datos reales y no son de control.
export const envMarker = (name: string) => `\uE000env:${name}\uE001`;
const ENV = /\uE000env:([A-Za-z0-9_]+)\uE001/g;

/** Literal de cadena; con marcadores de entorno, un template literal con `env("NOMBRE")`. */
export function jsString(text: string): string {
  if (!text.includes("\uE000env:")) return JSON.stringify(text);
  const parts = text.split(ENV);
  if (parts.length === 3 && parts[0] === "" && parts[2] === "")
    return `env(${JSON.stringify(parts[1])})`;
  let out = "";
  parts.forEach((part, i) => {
    if (i % 2 === 1) out += `\${env(${JSON.stringify(part)})}`;
    else
      out += part
        .replaceAll("\\", "\\\\")
        .replaceAll("`", "\\`")
        .replaceAll("${", "\\${")
        .replaceAll("\n", "\\n")
        .replaceAll("\r", "\\r");
  });
  return `\`${out}\``;
}

const key = (name: string) => (IDENT.test(name) ? name : JSON.stringify(name));

function inline(value: unknown): string {
  if (typeof value === "string") return jsString(value);
  if (Array.isArray(value)) return `[${value.map(inline).join(", ")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value);
    if (entries.length === 0) return "{}";
    return `{ ${entries.map(([k, v]) => `${key(k)}: ${inline(v)}`).join(", ")} }`;
  }
  return value === undefined ? "undefined" : JSON.stringify(value);
}

/**
 * Literal de un valor JSON. En una línea si cabe en el ancho desde `column` (sangría más lo que
 * va delante en esa línea); si no, un elemento por línea con sangría de 2 y coma final.
 */
export function jsValue(value: unknown, indent = 0, column = indent): string {
  const flat = inline(value);
  if (column + flat.length <= WIDTH || value === null || typeof value !== "object") return flat;
  const pad = " ".repeat(indent + 2);
  const lines = Array.isArray(value)
    ? value.map((item) => `${pad}${jsValue(item, indent + 2)},`)
    : Object.entries(value).map(([k, v]) => {
        const head = `${pad}${key(k)}: `;
        return `${head}${jsValue(v, indent + 2, head.length)},`;
      });
  const [open, close] = Array.isArray(value) ? ["[", "]"] : ["{", "}"];
  return `${open}\n${lines.join("\n")}\n${" ".repeat(indent)}${close}`;
}
