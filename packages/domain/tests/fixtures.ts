import type { Rule } from "../src/schemas/rule.ts";

export const RULE_ID = "3f1c2b4a-8d9e-4f60-a1b2-c3d4e5f60718";
export const RULE_ID2 = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
export const SITE = "http://localhost:3000";

/** Regla válida mínima; cada prueba cambia solo lo que le interesa. */
export function rule(overrides: Partial<Rule> = {}): Rule {
  return {
    id: RULE_ID,
    site: SITE,
    name: "Errores de la API",
    enabled: true,
    order: 0,
    prefilter: { kind: "glob", pattern: "*/api/*" },
    methods: [],
    resourceTypes: [],
    stage: "response",
    conditions: [],
    action: { kind: "pause" },
    profileIds: [],
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}
