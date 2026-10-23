import type { Rule } from "@nahual/domain";
import { useState } from "react";
import { RuleEditor } from "./RuleEditor.tsx";
import { RuleList } from "./RuleList.tsx";
import { emptyRuleForm, toRuleForm, type RuleForm } from "./rule-form.ts";

/** Pestaña de reglas: lista o editor. */
export function RulesView() {
  const [editing, setEditing] = useState<{ form: RuleForm; focus: "name" | "prefilter" } | null>(
    null,
  );

  if (editing) {
    return (
      <RuleEditor initial={editing.form} focus={editing.focus} onClose={() => setEditing(null)} />
    );
  }
  return (
    <RuleList
      onCreate={() => setEditing({ form: emptyRuleForm(), focus: "name" })}
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
