import {
  CONDITIONS_BY_STAGE,
  type Action,
  type Condition,
  type ConditionKind,
  type HttpMethod,
  type ResourceType,
  type Rule,
  type RuleDraft,
  type Stage,
} from "@nahual/domain";

/**
 * Estado del formulario de una regla: textos tal como los escribe el dev. Se convierte a
 * `RuleDraft` al guardar y el SW lo valida (FR-013); los errores vuelven como `issues` por campo.
 */
export interface ConditionForm {
  kind: ConditionKind;
  op: string;
  name: string;
  path: string;
  value: string;
  values: HttpMethod[];
  present: boolean;
  min: string;
  max: string;
  list: string;
}

export interface RuleForm {
  id?: string;
  name: string;
  enabled: boolean;
  prefilterKind: "glob" | "regex";
  prefilterPattern: string;
  methods: HttpMethod[];
  resourceTypes: ResourceType[];
  stage: Stage;
  conditions: ConditionForm[];
  action: Action;
}

const DEFAULT_OPS: Record<ConditionKind, string> = {
  method: "in",
  header: "exists",
  query: "exists",
  jsonPath: "exists",
  graphqlOperation: "equals",
  graphqlErrors: "",
  status: "gte",
};

export function emptyCondition(kind: ConditionKind): ConditionForm {
  return {
    kind,
    op: DEFAULT_OPS[kind],
    name: "",
    path: "$",
    value: kind === "status" ? "400" : "",
    values: [],
    present: true,
    min: "400",
    max: "499",
    list: "",
  };
}

export function emptyRuleForm(): RuleForm {
  return {
    name: "",
    enabled: true,
    prefilterKind: "glob",
    prefilterPattern: "*",
    methods: [],
    resourceTypes: [],
    stage: "response",
    conditions: [],
    action: { kind: "pause" },
  };
}

const optionalValue = (value: string) => (value === "" ? {} : { value });

function toCondition(form: ConditionForm): Record<string, unknown> {
  switch (form.kind) {
    case "method":
      return { kind: "method", values: form.values };
    case "header":
    case "query":
      return { kind: form.kind, name: form.name, op: form.op, ...optionalValue(form.value) };
    case "jsonPath":
      return { kind: "jsonPath", path: form.path, op: form.op, ...optionalValue(form.value) };
    case "graphqlOperation":
      return { kind: "graphqlOperation", op: form.op, value: form.value };
    case "graphqlErrors":
      return { kind: "graphqlErrors", present: form.present };
    case "status":
      if (form.op === "between")
        return { kind: "status", op: "between", range: [Number(form.min), Number(form.max)] };
      if (form.op === "in") {
        return {
          kind: "status",
          op: "in",
          list: form.list
            .split(",")
            .map((v) => v.trim())
            .filter((v) => v !== "")
            .map(Number),
        };
      }
      return { kind: "status", op: form.op, value: Number(form.value) };
  }
}

/** Formulario ⇒ objeto que se envía en `saveRule` (el SW lo valida). */
export function toRulePayload(form: RuleForm): Record<string, unknown> {
  const draft = {
    name: form.name,
    enabled: form.enabled,
    prefilter: { kind: form.prefilterKind, pattern: form.prefilterPattern },
    methods: form.methods,
    resourceTypes: form.resourceTypes,
    stage: form.stage,
    conditions: form.conditions.map(toCondition),
    action: form.action,
  };
  return form.id ? { ...draft, id: form.id } : draft;
}

function fromCondition(condition: Condition): ConditionForm {
  const base = emptyCondition(condition.kind);
  switch (condition.kind) {
    case "method":
      return { ...base, values: [...condition.values] };
    case "header":
    case "query":
      return { ...base, name: condition.name, op: condition.op, value: condition.value ?? "" };
    case "jsonPath":
      return { ...base, path: condition.path, op: condition.op, value: condition.value ?? "" };
    case "graphqlOperation":
      return { ...base, op: condition.op, value: condition.value };
    case "graphqlErrors":
      return { ...base, present: condition.present };
    case "status":
      return {
        ...base,
        op: condition.op,
        value: condition.value === undefined ? "" : String(condition.value),
        min: String(condition.range?.[0] ?? 400),
        max: String(condition.range?.[1] ?? 499),
        list: (condition.list ?? []).join(", "),
      };
  }
}

/** Regla o borrador (plantilla, duplicado) ⇒ formulario. */
export function toRuleForm(source: RuleDraft | Rule, keepId: boolean): RuleForm {
  return {
    ...(keepId && "id" in source ? { id: source.id } : {}),
    name: source.name,
    enabled: source.enabled,
    prefilterKind: source.prefilter.kind,
    prefilterPattern: source.prefilter.pattern,
    methods: [...source.methods],
    resourceTypes: [...source.resourceTypes],
    stage: source.stage,
    conditions: source.conditions.map(fromCondition),
    action: source.action,
  };
}

/** Al cambiar de etapa se quitan las condiciones que dejaron de ser válidas. */
export function conditionKindsFor(stage: Stage): readonly ConditionKind[] {
  return CONDITIONS_BY_STAGE[stage];
}
