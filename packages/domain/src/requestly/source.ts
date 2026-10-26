import { HTTP_METHODS, type HttpMethod, type ResourceType } from "../schemas/common.ts";
import { LIMITS, isCompilableRegex } from "../schemas/limits.ts";
import type { Prefilter } from "../schemas/rule.ts";
import type { RequestlySource } from "./schema.ts";

export type SourceMatch = {
  prefilter: Prefilter;
  methods: HttpMethod[];
  resourceTypes: ResourceType[];
  /** Regex con grupos para resolver `$1…$n` del destino de un redirect (Matches, comodín). */
  capture: string | null;
};

const SCHEME = "^[a-z][a-z0-9+.-]*://";
export const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
/** Comodín de Requestly a regex: cada `*` es un grupo, como `$1…$n` en el destino. */
const wildcard = (text: string) => text.split("*").map(escapeRegex).join("(.*?)");

/** `/patrón/` de Requestly ⇒ patrón; sin barras, tal cual. Con flags no se puede reproducir. */
function regexBody(value: string): string | null {
  const literal = /^\/(.*)\/([a-z]*)$/s.exec(value);
  if (!literal) return value;
  return literal[2] ? null : (literal[1] ?? "");
}

const TYPES: Record<string, ResourceType[]> = {
  xmlhttprequest: ["XHR", "Fetch"],
  script: ["Script"],
  stylesheet: ["Stylesheet"],
  image: ["Image"],
  font: ["Font"],
  main_frame: ["Document"],
  sub_frame: ["Document"],
  media: ["Media"],
  ping: ["Ping"],
  csp_report: ["CSPViolationReport"],
  other: ["Other"],
};

type Unsupported = { reasonKey: string };

function filtersOf(
  source: RequestlySource,
): Pick<SourceMatch, "methods" | "resourceTypes"> | Unsupported {
  const filters = source.filters;
  if (filters === undefined || (Array.isArray(filters) && filters.length === 0))
    return { methods: [], resourceTypes: [] };
  if (Array.isArray(filters)) return { reasonKey: "requestly_unsupported_filter" };
  const methods: HttpMethod[] = [];
  const resourceTypes: ResourceType[] = [];
  for (const [key, value] of Object.entries(filters)) {
    if (!Array.isArray(value)) return { reasonKey: "requestly_unsupported_filter" };
    for (const item of value) {
      const text = String(item);
      if (
        key === "requestMethod" &&
        (HTTP_METHODS as readonly string[]).includes(text.toUpperCase())
      )
        methods.push(text.toUpperCase() as HttpMethod);
      else if (key === "resourceType" && TYPES[text]) resourceTypes.push(...(TYPES[text] ?? []));
      else return { reasonKey: "requestly_unsupported_filter" };
    }
  }
  return { methods: [...new Set(methods)], resourceTypes: [...new Set(resourceTypes)] };
}

/**
 * Condición de origen de Requestly ⇒ prefiltro y filtros de una regla de Nahual (007, FR-035,
 * tabla de contracts/requestly-import.md), o el motivo por el que no se puede reproducir.
 */
export function sourceToMatch(source: RequestlySource): SourceMatch | Unsupported {
  const key = source.key.toLowerCase();
  const op = source.operator;
  const value = source.value;
  if (!["url", "host", "path"].includes(key))
    return { reasonKey: "requestly_unsupported_source_key" };
  if (!["Equals", "Contains", "Matches", "Wildcard_Matches"].includes(op))
    return { reasonKey: "requestly_unsupported_source_operator" };
  let inner: string | null = null;
  if (op === "Matches") {
    inner = regexBody(value);
    if (inner === null || !isCompilableRegex(inner))
      return { reasonKey: "requestly_unsupported_regex_invalid" };
  } else if (op === "Wildcard_Matches") inner = wildcard(value);

  let prefilter: Prefilter;
  let capture: string | null = null;
  if (key === "url") {
    if (op === "Equals") prefilter = { kind: "regex", pattern: `^${escapeRegex(value)}$` };
    else if (op === "Contains")
      prefilter = /[*?]/.test(value)
        ? { kind: "regex", pattern: escapeRegex(value) }
        : { kind: "glob", pattern: `*${value}*` };
    else if (op === "Wildcard_Matches") {
      prefilter = { kind: "glob", pattern: value };
      capture = `^${inner ?? ""}$`;
    } else {
      prefilter = { kind: "regex", pattern: inner ?? "" };
      capture = inner;
    }
  } else if (key === "host") {
    const body =
      op === "Equals"
        ? `${escapeRegex(value)}(:[0-9]+)?(/|$)`
        : op === "Contains"
          ? `[^/]*${escapeRegex(value)}`
          : `[^/]*(${inner ?? ""})`;
    prefilter = { kind: "regex", pattern: `${SCHEME}${body}` };
    if (op === "Matches" || op === "Wildcard_Matches") capture = prefilter.pattern;
  } else {
    const body =
      op === "Equals"
        ? `[^/]+${escapeRegex(value)}(\\?|$)`
        : op === "Contains"
          ? `[^/]+[^?]*${escapeRegex(value)}`
          : `[^/]+(${inner ?? ""})`;
    prefilter = { kind: "regex", pattern: `${SCHEME}${body}` };
    if (op === "Matches" || op === "Wildcard_Matches") capture = prefilter.pattern;
  }
  if (prefilter.kind === "regex") {
    if (prefilter.pattern.length > LIMITS.regexMax)
      return { reasonKey: "requestly_unsupported_regex_too_long" };
    if (!isCompilableRegex(prefilter.pattern))
      return { reasonKey: "requestly_unsupported_regex_invalid" };
  } else if (prefilter.pattern.length > LIMITS.globMax)
    return { reasonKey: "requestly_unsupported_regex_too_long" };
  const filters = filtersOf(source);
  if ("reasonKey" in filters) return filters;
  return { prefilter, ...filters, capture };
}
