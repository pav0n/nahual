import type { RuleDraft } from "./schemas/rule.ts";

export type TemplateId = "errors" | "empty" | "mock503" | "slow3s";

export interface RuleTemplate {
  id: TemplateId;
  /** Clave i18n del nombre; el panel la usa como nombre inicial de la regla. */
  nameKey: string;
  /**
   * Las plantillas de mock y retraso abren el editor con el prefiltro vacío y exigen completarlo,
   * para no afectar a todo el sitio por accidente (FR-018).
   */
  requiresPrefilter: boolean;
  draft: RuleDraft;
}

const base = {
  name: "",
  enabled: true,
  methods: [],
  resourceTypes: ["Fetch", "XHR"],
  conditions: [],
  profileIds: [],
} satisfies Partial<RuleDraft>;

/** Plantillas incluidas (FR-018). Una plantilla solo rellena el editor; nada se guarda solo. */
export const TEMPLATES: readonly RuleTemplate[] = [
  {
    id: "errors",
    nameKey: "template_errors",
    requiresPrefilter: false,
    draft: {
      ...base,
      prefilter: { kind: "glob", pattern: "*" },
      stage: "response",
      conditions: [{ kind: "status", op: "gte", value: 400 }],
      action: { kind: "pause" },
    },
  },
  {
    id: "empty",
    nameKey: "template_empty",
    requiresPrefilter: false,
    draft: {
      ...base,
      prefilter: { kind: "glob", pattern: "*" },
      stage: "response",
      conditions: [{ kind: "jsonPath", path: "$", op: "empty" }],
      action: { kind: "pause" },
    },
  },
  {
    id: "mock503",
    nameKey: "template_mock503",
    requiresPrefilter: true,
    draft: {
      ...base,
      prefilter: { kind: "glob", pattern: "" },
      stage: "request",
      action: {
        kind: "mock",
        status: 503,
        headers: [{ name: "content-type", value: "application/json" }],
        body: JSON.stringify({ error: "Service Unavailable", source: "Nahual" }),
        bodyEncoding: "text",
      },
    },
  },
  {
    id: "slow3s",
    nameKey: "template_slow3s",
    requiresPrefilter: true,
    draft: {
      ...base,
      prefilter: { kind: "glob", pattern: "" },
      stage: "request",
      action: { kind: "delay", ms: 3000 },
    },
  },
];

export const templateById = (id: string) => TEMPLATES.find((t) => t.id === id);
