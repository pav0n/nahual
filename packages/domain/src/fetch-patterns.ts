import type { Rule } from "./schemas/rule.ts";

/** Patrón de `Fetch.enable` (CDP `Fetch.RequestPattern`). */
export interface FetchPattern {
  urlPattern: string;
  requestStage: "Request" | "Response";
  resourceType?: string;
}

/** Origen de API con una relajación CORS activa (003, research R11). */
export interface RelaxedOrigin {
  origin: string;
  /** Hay preflights que redirigen: se responden en etapa Request (research R1, X5). */
  requestStage?: boolean;
}

/** Por encima de este número de patrones, la etapa se reduce a `*` (research R3). */
export const MAX_FETCH_PATTERNS = 50;

const STAGES = { request: "Request", response: "Response" } as const;

/**
 * Patrones mínimos de `Fetch.enable` para las reglas activas del sitio (principio VI, research
 * R3). Un patrón más amplio nunca cambia el resultado: el RuleEngine vuelve a evaluar el
 * prefiltro exacto; solo cambia el costo.
 */
export function computeFetchPatterns(
  rules: Rule[],
  context: { site: string | null; globalPaused: boolean; relaxedApiOrigins?: RelaxedOrigin[] },
): FetchPattern[] {
  if (context.globalPaused) return [];
  const relaxed = context.relaxedApiOrigins ?? [];
  const result: FetchPattern[] = [];
  for (const stage of ["request", "response"] as const) {
    const requestStage = STAGES[stage];
    const active =
      context.site === null
        ? []
        : rules.filter((r) => r.enabled && r.site === context.site && r.stage === stage);
    const patterns: FetchPattern[] = [];
    for (const rule of active) {
      const urlPattern = rule.prefilter.kind === "glob" ? rule.prefilter.pattern : "*";
      if (rule.resourceTypes.length === 0) patterns.push({ urlPattern, requestStage });
      else
        for (const resourceType of rule.resourceTypes)
          patterns.push({ urlPattern, requestStage, resourceType });
    }
    for (const { origin, requestStage: atRequest } of relaxed)
      if (stage === "response" || atRequest)
        patterns.push({ urlPattern: `${origin}/*`, requestStage });
    if (patterns.length === 0) continue;
    const catchAll = patterns.some((p) => p.urlPattern === "*" && p.resourceType === undefined);
    if (catchAll) {
      result.push({ urlPattern: "*", requestStage });
      continue;
    }
    const allTypes = new Set(
      patterns.filter((p) => p.urlPattern === "*").map((p) => p.resourceType),
    );
    const seen = new Set<string>();
    const reduced = patterns.filter((p) => {
      if (p.urlPattern !== "*" && allTypes.has(p.resourceType)) return false;
      const key = `${p.urlPattern}\u0000${p.resourceType ?? ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (reduced.length > MAX_FETCH_PATTERNS) result.push({ urlPattern: "*", requestStage });
    else result.push(...reduced);
  }
  return result;
}
