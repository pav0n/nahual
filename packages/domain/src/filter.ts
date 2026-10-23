import { LIMITS, isCompilableRegex } from "./schemas/limits.ts";

export interface FilterInput {
  /** Subcadena de la URL, sin distinguir mayúsculas. */
  text: string;
  /** Regex sobre la URL. */
  regex: string;
  /** Códigos exactos o clases (`4xx`), separados por comas. */
  status: string;
  /** Tipos de recurso; vacío = todos. */
  types: string[];
  /** Intercambios bloqueados por CORS o relajados por Nahual (003, FR-002). */
  cors?: "all" | "blocked" | "relaxed" | undefined;
}

export interface FilterableExchange {
  url: string;
  status: number | null;
  resourceType: string;
  cors?:
    { diagnosis?: unknown; relaxed?: { errorKey?: string | undefined } | undefined } | undefined;
}

export type CompiledFilter =
  | { ok: true; matches(exchange: FilterableExchange): boolean }
  | { ok: false; field: "regex" | "status" };

type StatusTest = (status: number) => boolean;

function parseStatus(input: string): StatusTest[] | null {
  const parts = input
    .split(",")
    .map((p) => p.trim().toLowerCase())
    .filter((p) => p !== "");
  const tests: StatusTest[] = [];
  for (const part of parts) {
    const klass = /^([1-5])xx$/.exec(part);
    if (klass) {
      const digit = Number(klass[1]);
      tests.push((s) => Math.floor(s / 100) === digit);
    } else if (/^[1-5]\d\d$/.test(part)) {
      const code = Number(part);
      tests.push((s) => s === code);
    } else {
      return null;
    }
  }
  return tests;
}

/**
 * Compila los filtros de la lista de tráfico, combinados con Y (FR-003). Una regex o un status
 * inválidos devuelven `ok: false` para que el panel conserve el último filtro válido.
 */
export function compileFilter(input: FilterInput): CompiledFilter {
  const text = input.text.trim().toLowerCase();
  const regexSource = input.regex.trim();
  if (
    regexSource !== "" &&
    (regexSource.length > LIMITS.regexMax || !isCompilableRegex(regexSource))
  ) {
    return { ok: false, field: "regex" };
  }
  const regex = regexSource === "" ? null : new RegExp(regexSource);
  const statusTests = parseStatus(input.status);
  if (statusTests === null) return { ok: false, field: "status" };
  const types = new Set(input.types);
  const cors = input.cors ?? "all";

  return {
    ok: true,
    matches(exchange) {
      if (text !== "" && !exchange.url.toLowerCase().includes(text)) return false;
      if (regex && !regex.test(exchange.url.slice(0, LIMITS.evalTextMax))) return false;
      if (statusTests.length > 0) {
        const { status } = exchange;
        if (status === null || !statusTests.some((test) => test(status))) return false;
      }
      if (cors === "blocked" && !exchange.cors?.diagnosis) return false;
      if (cors === "relaxed" && (!exchange.cors?.relaxed || exchange.cors.relaxed.errorKey))
        return false;
      return types.size === 0 || types.has(exchange.resourceType);
    },
  };
}
