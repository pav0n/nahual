import { TEMPLATES, type Rule, type RuleTemplate, type TemplateId } from "@nahual/domain";
import { useState } from "react";
import { t } from "../../../shared/i18n.ts";
import { ActionEditor } from "./ActionEditor.tsx";
import { RuleEditor } from "./RuleEditor.tsx";
import { ReorderControls } from "./ReorderControls.tsx";
import { RuleList } from "./RuleList.tsx";
import { emptyRuleForm, toRuleForm, type RuleForm } from "./rule-form.ts";

/** Plantillas que ofrece el estado vacío (FR-018), con la sugerida primero. */
export const OFFERED_TEMPLATES: TemplateId[] = ["errors", "empty", "mock503", "slow3s"];

/** Pestaña de reglas: lista o editor. */
export function RulesView({ templates = OFFERED_TEMPLATES }: { templates?: TemplateId[] }) {
  const [editing, setEditing] = useState<{ form: RuleForm; focus: "name" | "prefilter" } | null>(
    null,
  );

  // Una plantilla solo rellena el editor; nada se guarda hasta que el dev confirma.
  const fromTemplate = (template: RuleTemplate) =>
    setEditing({
      form: toRuleForm({ ...template.draft, name: t(template.nameKey) }, false),
      focus: template.requiresPrefilter ? "prefilter" : "name",
    });

  const offered = TEMPLATES.filter((template) => templates.includes(template.id));

  if (editing) {
    return (
      <RuleEditor
        initial={editing.form}
        focus={editing.focus}
        actionEditor={(form, setForm, issues) => (
          <ActionEditor form={form} setForm={setForm} issues={issues} />
        )}
        onClose={() => setEditing(null)}
      />
    );
  }
  return (
    <RuleList
      onCreate={() => setEditing({ form: emptyRuleForm(), focus: "name" })}
      templates={
        <div className="templates" role="group" aria-label={t("templates_label")}>
          {offered.map((template, index) => (
            <button
              key={template.id}
              type="button"
              className={index === 0 ? "template suggested" : "template"}
              onClick={() => fromTemplate(template)}
            >
              {t(template.nameKey)}
              {index === 0 ? <span className="tag">{t("template_suggested")}</span> : null}
            </button>
          ))}
        </div>
      }
      reorderControls={(rule, index, siteRules) => (
        <ReorderControls rule={rule} index={index} siteRules={siteRules} />
      )}
      onEdit={(rule: Rule) => setEditing({ form: toRuleForm(rule, true), focus: "name" })}
      onDuplicate={(rule: Rule) =>
        setEditing({
          form: { ...toRuleForm(rule, false), name: `${rule.name} (2)`.slice(0, 80) },
          focus: "name",
        })
      }
    />
  );
}
