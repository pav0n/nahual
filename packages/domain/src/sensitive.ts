import type { ExportBody, ExportHeader, ExportSource } from "./export/source.ts";

/** Máscara visible en el panel y en los registros. */
export const MASK = "••••••";

const EXACT = new Set(["authorization", "proxy-authorization", "cookie", "set-cookie"]);
const PARTS = ["token", "secret", "session", "api-key", "apikey"];

/** Headers cuyo valor se enmascara por defecto (FR-004a) y nunca se registra (FR-036). */
export function isSensitiveHeader(name: string): boolean {
  const lower = name.toLowerCase();
  return EXACT.has(lower) || PARTS.some((part) => lower.includes(part));
}

/**
 * Nombres de campo JSON y de parámetro de query cuyo valor se redacta en el diff (005, FR-030):
 * el criterio de los headers más `password`; `_` cuenta como `-` (`api_key`).
 */
export function isSensitiveName(name: string): boolean {
  const normalized = name.toLowerCase().replaceAll("_", "-");
  return isSensitiveHeader(normalized) || normalized.includes("password");
}

type HeaderList = { name: string; value: string }[];

/** Copia con los valores sensibles reemplazados por la máscara. */
export function redactHeaders<T extends HeaderList | Record<string, string>>(headers: T): T {
  if (Array.isArray(headers)) {
    return headers.map((h) => (isSensitiveHeader(h.name) ? { ...h, value: MASK } : h)) as T;
  }
  return Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [name, isSensitiveHeader(name) ? MASK : value]),
  ) as T;
}

/** Parámetros de query dentro de un texto (`?token=…`, `&api_key=…`). */
const QUERY = /([?&])([^=&#\s"']+)=([^&#\s"']*)/g;

function decodeName(name: string) {
  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
}

/**
 * Reemplaza el valor de los parámetros de query con nombre sensible (005, FR-030), sin tocar el
 * resto del texto. `mark` recibe el nombre decodificado y devuelve el marcador (007, R3).
 */
export function redactUrlQuery(text: string, mark: (name: string) => string): string {
  return text.replace(QUERY, (all, sep: string, name: string) => {
    const decoded = decodeName(name);
    return isSensitiveName(decoded) ? `${sep}${name}=${mark(decoded)}` : all;
  });
}

/**
 * Copia de un valor JSON con lo que cuelga de claves sensibles redactado a cualquier profundidad
 * (subárbol entero) y la query sensible de las cadenas. `mark` recibe la ruta del valor (claves e
 * índices) y devuelve el marcador; por defecto, `MASK`. Una sola implementación para el diff
 * (005), la consola de hooks (006) y los exportadores (007).
 */
export function redactValue(
  value: unknown,
  mark: (path: string[]) => string = () => MASK,
  path: string[] = [],
): { value: unknown; changed: boolean } {
  if (typeof value === "string") {
    const text = redactUrlQuery(value, (name) => mark([...path, name]));
    return { value: text, changed: text !== value };
  }
  if (value !== null && typeof value === "object") {
    let changed = false;
    const entries = Object.entries(value).map(([key, item]) => {
      if (isSensitiveName(key)) {
        changed = true;
        return [key, mark([...path, key])] as const;
      }
      const r = redactValue(item, mark, [...path, key]);
      changed ||= r.changed;
      return [key, r.value] as const;
    });
    if (Array.isArray(value)) return { value: entries.map(([, item]) => item), changed };
    return { value: Object.fromEntries(entries), changed };
  }
  return { value, changed: false };
}

/** Marcador de los exportadores de código (cURL, fetch, MSW): nunca contiene parte del valor. */
export const REDACTED = "<redacted>";

/** Un valor sensible que un exportador redactó (007, data-model "Redacción"). */
export interface RedactedSite {
  side: "request" | "response";
  where: "header" | "query" | "body";
  /** Nombre del header, del parámetro o del campo (el último segmento de la ruta). */
  name: string;
  /** Variable de entorno del test Vitest (`NAHUAL_AUTHORIZATION`, `NAHUAL_QUERY_TOKEN`…). */
  envVar: string;
  /** Variable de colección de Postman (`nahual_authorization`…). */
  postmanVar: string;
}

const ident = (parts: string[]) =>
  parts
    .join("_")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();

/**
 * Fuente de exportación con sus valores sensibles redactados (007, FR-010): headers de request y
 * de response, parámetros de query, campos de un body JSON a cualquier profundidad y campos de un
 * formulario o de partes multipart de texto. Un body de texto que no es JSON no se toca (Edge
 * Cases). `mark` decide el marcador de cada sitio; por defecto, `REDACTED`.
 */
export function redactExportSource(
  source: ExportSource,
  mark: (site: RedactedSite) => string = () => REDACTED,
): { source: ExportSource; redacted: RedactedSite[] } {
  const redacted: RedactedSite[] = [];
  const used = new Map<string, number>();
  const site = (side: RedactedSite["side"], where: RedactedSite["where"], parts: string[]) => {
    const prefix = where === "header" ? [] : [where === "query" ? "query" : "body"];
    const base = ident([...prefix, ...parts]) || "VALUE";
    const n = (used.get(base) ?? 0) + 1;
    used.set(base, n);
    const suffix = n > 1 ? `_${n}` : "";
    const entry: RedactedSite = {
      side,
      where,
      name: parts[parts.length - 1] ?? "",
      envVar: `NAHUAL_${base}${suffix}`,
      postmanVar: `nahual_${base.toLowerCase()}${suffix}`,
    };
    redacted.push(entry);
    return mark(entry);
  };
  const headers = (side: RedactedSite["side"], list: ExportHeader[]) =>
    list.map((h) =>
      isSensitiveHeader(h.name) ? { ...h, value: site(side, "header", [h.name]) } : h,
    );
  const body = (side: RedactedSite["side"], b: ExportBody): ExportBody => {
    if (b.kind === "text") {
      let parsed: unknown;
      try {
        parsed = JSON.parse(b.text);
      } catch {
        return b;
      }
      const r = redactValue(parsed, (path) => site(side, "body", path));
      return r.changed ? { ...b, text: JSON.stringify(r.value) } : b;
    }
    if (b.kind === "form")
      return {
        kind: "form",
        fields: b.fields.map((f) =>
          isSensitiveName(f.name) ? { ...f, value: site(side, "body", [f.name]) } : f,
        ),
      };
    if (b.kind === "multipart")
      return {
        kind: "multipart",
        parts: b.parts.map((p) =>
          p.kind === "field" && isSensitiveName(p.name)
            ? { ...p, value: site(side, "body", [p.name]) }
            : p,
        ),
      };
    return b;
  };
  const requestHeaders = headers("request", source.request.headers);
  const url = redactUrlQuery(source.request.url, (name) => site("request", "query", [name]));
  const requestBody = body("request", source.request.body);
  const response = source.response && {
    ...source.response,
    headers: headers("response", source.response.headers),
    body: body("response", source.response.body),
  };
  return {
    source: {
      ...source,
      request: { ...source.request, url, headers: requestHeaders, body: requestBody },
      response,
    },
    redacted,
  };
}
