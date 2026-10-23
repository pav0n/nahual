import type { Rule, RuleDraft } from "@nahual/domain";

export const SITE = "http://localhost:3000";
export const RULE_ID = "3f1c2b4a-8d9e-4f60-a1b2-c3d4e5f60718";
export const RULE_ID2 = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";

export function draft(overrides: Partial<RuleDraft> = {}): RuleDraft {
  return {
    name: "Errores de la API",
    enabled: true,
    prefilter: { kind: "glob", pattern: "*/api/*" },
    methods: [],
    resourceTypes: [],
    stage: "response",
    conditions: [{ kind: "status", op: "gte", value: 500 }],
    action: { kind: "pause" },
    ...overrides,
  };
}

export function rule(overrides: Partial<Rule> = {}): Rule {
  return {
    id: RULE_ID,
    site: SITE,
    order: 0,
    createdAt: 1,
    updatedAt: 1,
    ...draft(),
    ...overrides,
  };
}
