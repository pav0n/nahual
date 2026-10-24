import {
  TEMPLATES,
  type Rule,
  type RuleDraft,
  type RuleTemplate,
  type TemplateId,
} from "@nahual/domain";
import { useCallback, useEffect, useRef, useState } from "react";
import { t } from "../../../shared/i18n.ts";
import { usePanelStore } from "../../store/index.ts";
import { ConfirmDialog } from "../common/ConfirmDialog.tsx";
import { SplitPane } from "../common/SplitPane.tsx";
import { ActionEditor } from "./ActionEditor.tsx";
import { RuleEditor } from "./RuleEditor.tsx";
import { ReorderControls } from "./ReorderControls.tsx";
import { RuleList } from "./RuleList.tsx";
import { emptyRuleForm, toRuleForm, type RuleForm } from "./rule-form.ts";

/** Plantillas que ofrece el estado vacío (FR-018), con la sugerida primero. */
export const OFFERED_TEMPLATES: TemplateId[] = ["errors", "empty", "mock503", "slow3s"];

/** Pestaña de reglas: lista o editor. */
export function RulesView({ templates = OFFERED_TEMPLATES }: { templates?: TemplateId[] }) {
  const [editing, setEditingState] = useState<{
    form: RuleForm;
    focus: "name" | "prefilter";
    seq: number;
  } | null>(null);
  const seq = useRef(0);
  /** Cada apertura monta un editor nuevo, aunque ya hubiera uno abierto al lado de la lista. */
  const setEditing = (next: { form: RuleForm; focus: "name" | "prefilter" } | null) =>
    setEditingState(next ? { ...next, seq: ++seq.current } : null);
  const [pending, setPending] = useState<RuleDraft | null>(null);
  const dirty = useRef(false);
  const onDirtyChange = useCallback((value: boolean) => {
    dirty.current = value;
  }, []);

  const openDraft = useCallback((draft: RuleDraft) => {
    dirty.current = false;
    setEditingState({ form: toRuleForm(draft, false), focus: "name", seq: ++seq.current });
  }, []);

  // "Crear regla desde este request" (004 FR-023): el borrador llega por el store. Si el editor
  // tiene cambios sin guardar, se pide confirmación antes de reemplazarlos.
  useEffect(() => {
    const take = () => {
      const draft = usePanelStore.getState().consumeRuleDraft();
      if (!draft) return;
      if (dirty.current) setPending(draft);
      else openDraft(draft);
    };
    queueMicrotask(take);
    return usePanelStore.subscribe((state, before) => {
      if (state.incomingRuleDraft && state.incomingRuleDraft !== before.incomingRuleDraft) take();
    });
  }, [openDraft]);

  const confirm = (
    <ConfirmDialog
      open={pending !== null}
      title={t("confirm_replace_draft_title")}
      body={t("confirm_replace_draft_body")}
      confirmLabel={t("action_replace")}
      onConfirm={() => {
        if (pending) openDraft(pending);
        setPending(null);
      }}
      onCancel={() => setPending(null)}
    />
  );

  // Una plantilla solo rellena el editor; nada se guarda hasta que el dev confirma.
  const fromTemplate = (template: RuleTemplate) =>
    setEditing({
      form: toRuleForm({ ...template.draft, name: t(template.nameKey) }, false),
      focus: template.requiresPrefilter ? "prefilter" : "name",
    });

  const offered = TEMPLATES.filter((template) => templates.includes(template.id));

  const list = (
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

  // Lista a la izquierda y editor con el ancho restante, con divisor (004 FR-027).
  return (
    <div className="rules-pane">
      <SplitPane
        prefKey="rules"
        label={t("rules_divider")}
        minStart={200}
        minEnd={320}
        start={<div className="pane">{list}</div>}
        end={
          editing ? (
            <div className="pane">
              <RuleEditor
                key={editing.seq}
                initial={editing.form}
                focus={editing.focus}
                actionEditor={(form, setForm, issues) => (
                  <ActionEditor form={form} setForm={setForm} issues={issues} />
                )}
                onDirtyChange={onDirtyChange}
                onClose={() => {
                  dirty.current = false;
                  setEditing(null);
                }}
              />
            </div>
          ) : null
        }
      />
      {confirm}
    </div>
  );
}
