import {
  GRAPHQL_OPS,
  HTTP_METHODS,
  JSONPATH_OPS,
  STATUS_OPS,
  TEXT_OPS,
  type ConditionKind,
  type Stage,
} from "@nahual/domain";
import type { Issue } from "@nahual/protocol";
import { t } from "../../../shared/i18n.ts";
import { Field, issueAt } from "../common/Field.tsx";
import { conditionKindsFor, emptyCondition, type ConditionForm } from "./rule-form.ts";

interface Props {
  index: number;
  stage: Stage;
  condition: ConditionForm;
  issues: Issue[];
  onChange(next: ConditionForm): void;
  onRemove(): void;
}

const VALUELESS = new Set(["exists", "notExists", "empty", "notEmpty"]);

const OPS: Partial<Record<ConditionKind, readonly string[]>> = {
  header: TEXT_OPS,
  query: TEXT_OPS,
  jsonPath: JSONPATH_OPS,
  graphqlOperation: GRAPHQL_OPS,
  status: STATUS_OPS,
};

/** Una condición de la regla, con los operadores de data-model.md según su tipo. */
export function ConditionEditor({ index, stage, condition, issues, onChange, onRemove }: Props) {
  const at = (field: string) => issueAt(issues, `conditions.${index}.${field}`);
  const set = (patch: Partial<ConditionForm>) => onChange({ ...condition, ...patch });
  const ops = OPS[condition.kind];

  return (
    <fieldset className="condition">
      <legend>{t("condition_label", String(index + 1))}</legend>
      <div className="row">
        <Field label={t("condition_kind")} error={at("kind")} className="grow">
          {(props) => (
            <select
              {...props}
              value={condition.kind}
              onChange={(e) => onChange(emptyCondition(e.target.value as ConditionKind))}
            >
              {conditionKindsFor(stage).map((kind) => (
                <option key={kind} value={kind}>
                  {t(`condition_kind_${kind}`)}
                </option>
              ))}
            </select>
          )}
        </Field>
        {ops ? (
          <Field label={t("condition_op")} error={at("op")} className="grow">
            {(props) => (
              <select {...props} value={condition.op} onChange={(e) => set({ op: e.target.value })}>
                {ops.map((op) => (
                  <option key={op} value={op}>
                    {t(`op_${op}`)}
                  </option>
                ))}
              </select>
            )}
          </Field>
        ) : null}
        <button
          type="button"
          onClick={onRemove}
          aria-label={t("action_remove_condition", String(index + 1))}
        >
          {t("action_remove")}
        </button>
      </div>

      {condition.kind === "header" || condition.kind === "query" ? (
        <Field
          label={t(condition.kind === "header" ? "condition_header_name" : "condition_query_name")}
          error={at("name")}
        >
          {(props) => (
            <input
              {...props}
              className="mono"
              value={condition.name}
              onChange={(e) => set({ name: e.target.value })}
            />
          )}
        </Field>
      ) : null}

      {condition.kind === "jsonPath" ? (
        <Field label={t("condition_path")} error={at("path")} hint={t("condition_path_hint")}>
          {(props) => (
            <input
              {...props}
              className="mono"
              value={condition.path}
              onChange={(e) => set({ path: e.target.value })}
            />
          )}
        </Field>
      ) : null}

      {condition.kind === "method" ? (
        <fieldset className="types">
          <legend>{t("rule_methods")}</legend>
          {HTTP_METHODS.map((method) => (
            <label key={method} className="check">
              <input
                type="checkbox"
                checked={condition.values.includes(method)}
                onChange={(e) =>
                  set({
                    values: e.target.checked
                      ? [...condition.values, method]
                      : condition.values.filter((m) => m !== method),
                  })
                }
              />
              {method}
            </label>
          ))}
          {at("values") ? <span className="field-error">{t(at("values") ?? "")}</span> : null}
        </fieldset>
      ) : null}

      {condition.kind === "graphqlErrors" ? (
        <Field label={t("condition_errors_present")}>
          {(props) => (
            <select
              {...props}
              value={String(condition.present)}
              onChange={(e) => set({ present: e.target.value === "true" })}
            >
              <option value="true">{t("condition_errors_yes")}</option>
              <option value="false">{t("condition_errors_no")}</option>
            </select>
          )}
        </Field>
      ) : null}

      {condition.kind === "status" && condition.op === "between" ? (
        <div className="row">
          <Field label={t("condition_min")} error={at("range")} className="grow">
            {(props) => (
              <input
                {...props}
                inputMode="numeric"
                value={condition.min}
                onChange={(e) => set({ min: e.target.value })}
              />
            )}
          </Field>
          <Field label={t("condition_max")} className="grow">
            {(props) => (
              <input
                {...props}
                inputMode="numeric"
                value={condition.max}
                onChange={(e) => set({ max: e.target.value })}
              />
            )}
          </Field>
        </div>
      ) : null}

      {condition.kind === "status" && condition.op === "in" ? (
        <Field label={t("condition_list")} error={at("list")} hint={t("condition_list_hint")}>
          {(props) => (
            <input
              {...props}
              value={condition.list}
              onChange={(e) => set({ list: e.target.value })}
            />
          )}
        </Field>
      ) : null}

      {ops &&
      !VALUELESS.has(condition.op) &&
      !(condition.kind === "status" && (condition.op === "between" || condition.op === "in")) ? (
        <Field label={t("condition_value")} error={at("value")}>
          {(props) => (
            <input
              {...props}
              className="mono"
              inputMode={condition.kind === "status" ? "numeric" : "text"}
              value={condition.value}
              onChange={(e) => set({ value: e.target.value })}
            />
          )}
        </Field>
      ) : null}
    </fieldset>
  );
}
