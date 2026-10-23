import { HTTP_METHODS, type HttpMethod, type ResourceType } from "@nahual/domain";
import type { Issue } from "@nahual/protocol";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { t } from "../../../shared/i18n.ts";
import { command } from "../../commands.ts";
import { Field, issueAt } from "../common/Field.tsx";
import { ConditionEditor } from "./ConditionEditor.tsx";
import { conditionKindsFor, emptyCondition, toRulePayload, type RuleForm } from "./rule-form.ts";

const TYPES: ResourceType[] = [
  "Fetch",
  "XHR",
  "Document",
  "Script",
  "Stylesheet",
  "Image",
  "Font",
  "Media",
  "Other",
];

interface Props {
  initial: RuleForm;
  /** Campo que recibe el foco al abrir (p. ej. el prefiltro de una plantilla). */
  focus?: "name" | "prefilter";
  /** Editor de la acción (historia 4); por defecto, Pausar. */
  actionEditor?(form: RuleForm, set: (form: RuleForm) => void, issues: Issue[]): ReactNode;
  onClose(): void;
}

function toggle<T>(list: T[], item: T, on: boolean): T[] {
  return on ? [...list, item] : list.filter((x) => x !== item);
}

/** Editor de reglas (FR-008 a FR-013). Valida el SW y los errores se muestran junto a cada campo. */
export function RuleEditor({ initial, focus = "name", actionEditor, onClose }: Props) {
  const [form, setForm] = useState<RuleForm>(initial);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [saving, setSaving] = useState(false);
  /** Cambia tras un guardado fallido: el foco va al primer campo con error. */
  const [failedSaves, setFailedSaves] = useState(0);
  const rootRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (failedSaves === 0) return;
    rootRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [failedSaves]);

  useEffect(() => {
    rootRef.current?.querySelector<HTMLElement>(`[data-focus="${focus}"]`)?.focus();
  }, [focus]);

  const set = (patch: Partial<RuleForm>) => setForm((current) => ({ ...current, ...patch }));

  const save = async () => {
    setSaving(true);
    const reply = await command("saveRule", { rule: toRulePayload(form) });
    setSaving(false);
    if (reply.ok) {
      onClose();
      return;
    }
    setIssues(reply.issues);
    // El foco va al primer campo con error para corregirlo con teclado.
    setFailedSaves((n) => n + 1);
  };

  return (
    <section ref={rootRef} className="editor" aria-labelledby="rule-editor-title">
      <h2 id="rule-editor-title">{t(form.id ? "rule_editor_edit" : "rule_editor_new")}</h2>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose();
        }}
      >
        <Field label={t("rule_name")} error={issueAt(issues, "name")}>
          {(props) => (
            <input
              {...props}
              data-focus="name"
              value={form.name}
              onChange={(e) => set({ name: e.target.value })}
            />
          )}
        </Field>

        <div className="row">
          <Field label={t("rule_prefilter_kind")} className="">
            {(props) => (
              <select
                {...props}
                value={form.prefilterKind}
                onChange={(e) =>
                  set({ prefilterKind: e.target.value as RuleForm["prefilterKind"] })
                }
              >
                <option value="glob">{t("rule_prefilter_glob")}</option>
                <option value="regex">{t("rule_prefilter_regex")}</option>
              </select>
            )}
          </Field>
          <Field
            label={t("rule_prefilter")}
            error={issueAt(issues, "prefilter.pattern")}
            hint={t(
              form.prefilterKind === "glob"
                ? "rule_prefilter_glob_hint"
                : "rule_prefilter_regex_hint",
            )}
            className="grow"
          >
            {(props) => (
              <input
                {...props}
                data-focus="prefilter"
                className="mono"
                value={form.prefilterPattern}
                onChange={(e) => set({ prefilterPattern: e.target.value })}
              />
            )}
          </Field>
        </div>

        <fieldset className="types">
          <legend>{t("rule_methods_all_hint")}</legend>
          {HTTP_METHODS.map((method: HttpMethod) => (
            <label key={method} className="check">
              <input
                type="checkbox"
                checked={form.methods.includes(method)}
                onChange={(e) => set({ methods: toggle(form.methods, method, e.target.checked) })}
              />
              {method}
            </label>
          ))}
        </fieldset>

        <fieldset className="types">
          <legend>{t("rule_types_all_hint")}</legend>
          {TYPES.map((type) => (
            <label key={type} className="check">
              <input
                type="checkbox"
                checked={form.resourceTypes.includes(type)}
                onChange={(e) =>
                  set({ resourceTypes: toggle(form.resourceTypes, type, e.target.checked) })
                }
              />
              {type}
            </label>
          ))}
        </fieldset>

        <Field label={t("rule_stage")} hint={t(`rule_stage_${form.stage}_hint`)}>
          {(props) => (
            <select
              {...props}
              value={form.stage}
              onChange={(e) => {
                const stage = e.target.value as RuleForm["stage"];
                const allowed: readonly string[] = conditionKindsFor(stage);
                set({ stage, conditions: form.conditions.filter((c) => allowed.includes(c.kind)) });
              }}
            >
              <option value="request">{t("stage_request")}</option>
              <option value="response">{t("stage_response")}</option>
            </select>
          )}
        </Field>

        <div className="conditions">
          <h3>{t("rule_conditions")}</h3>
          {form.conditions.length === 0 ? (
            <p className="muted">{t("rule_conditions_none")}</p>
          ) : null}
          {form.conditions.map((condition, index) => (
            <ConditionEditor
              key={index}
              index={index}
              stage={form.stage}
              condition={condition}
              issues={issues}
              onChange={(next) =>
                set({ conditions: form.conditions.map((c, i) => (i === index ? next : c)) })
              }
              onRemove={() => set({ conditions: form.conditions.filter((_, i) => i !== index) })}
            />
          ))}
          <button
            type="button"
            onClick={() =>
              set({
                conditions: [
                  ...form.conditions,
                  emptyCondition(form.stage === "response" ? "status" : "header"),
                ],
              })
            }
          >
            {t("action_add_condition")}
          </button>
        </div>

        {actionEditor ? (
          actionEditor(form, setForm, issues)
        ) : (
          <p>
            <strong>{t("rule_action")}:</strong> {t("action_kind_pause")}
          </p>
        )}

        {issues.length > 0 ? (
          <p role="alert" className="alert">
            {t("error_rule_invalid")}
          </p>
        ) : null}

        <div className="row">
          <button type="submit" className="primary" disabled={saving}>
            {t("action_save_rule")}
          </button>
          <button type="button" onClick={onClose}>
            {t("action_cancel")}
          </button>
        </div>
      </form>
    </section>
  );
}
