import type { CapturedExchange } from "./schemas/exchange.ts";
import {
  HTTP_METHODS,
  RESOURCE_TYPES,
  type HttpMethod,
  type ResourceType,
  type Stage,
} from "./schemas/common.ts";
import { LIMITS } from "./schemas/limits.ts";
import type { RuleDraft } from "./schemas/rule.ts";

/** Caracteres especiales del glob de 002 (research R3): se escapan con `\`. */
const GLOB_SPECIAL = /[*?\\]/;

/** URL sin query ni fragmento, tal como la reportó Chrome (sin normalizarla otra vez). */
const withoutQuery = (url: string) => url.split(/[?#]/, 1)[0] ?? url;

/** Ruta para el nombre: la de la URL si es http(s); si no, la URL sin query. */
export function pathOf(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") return parsed.pathname;
  } catch {
    // Se usa la URL tal cual.
  }
  return withoutQuery(url);
}

/**
 * Prefiltro glob que coincide con el request y con cualquier query: la URL sin query, escapada, y un
 * `*` final. Si no cabe en `LIMITS.globMax`, se recorta la ruta (nunca a mitad de un escape).
 */
function globFor(url: string): string {
  let pattern = "";
  for (const char of withoutQuery(url)) {
    const piece = GLOB_SPECIAL.test(char) ? `\\${char}` : char;
    if (pattern.length + piece.length > LIMITS.globMax - 1) break;
    pattern += piece;
  }
  return `${pattern}*`;
}

/**
 * Etapa del borrador: la response si el request no lleva body y tuvo respuesta (en un GET no hay
 * nada más que editar); la de request si lleva body o nunca hubo respuesta.
 */
function stageFor(exchange: CapturedExchange): Stage {
  const { requestBody } = exchange;
  const hasBody = requestBody.available || (requestBody.reason ?? "none") !== "none";
  return hasBody || exchange.status === null ? "request" : "response";
}

/**
 * Borrador de regla a partir de un request capturado (004, research R7): pausa ese request en la
 * etapa que tiene algo que editar (`stageFor`). Solo prellena el editor; la regla se valida y se guarda por el camino de 002
 * cuando el dev la confirma (FR-023). El resultado pasa `RuleDraftSchema` para cualquier
 * intercambio válido y su prefiltro coincide con la URL de origen.
 */
export function ruleDraftFromExchange(exchange: CapturedExchange): RuleDraft {
  const method = exchange.isPreflight ? "OPTIONS" : exchange.method.toUpperCase();
  const methods: HttpMethod[] = (HTTP_METHODS as readonly string[]).includes(method)
    ? [method as HttpMethod]
    : [];
  const resourceTypes: ResourceType[] = (RESOURCE_TYPES as readonly string[]).includes(
    exchange.resourceType,
  )
    ? [exchange.resourceType as ResourceType]
    : [];
  return {
    name: `${method} ${pathOf(exchange.url)}`.slice(0, LIMITS.ruleNameMax).trim(),
    enabled: true,
    prefilter: { kind: "glob", pattern: globFor(exchange.url) },
    methods,
    resourceTypes,
    stage: stageFor(exchange),
    conditions: [],
    action: { kind: "pause" },
  };
}
