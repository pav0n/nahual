import type { Rule } from "@nahual/domain";
import type { ReactNode } from "react";
import { t } from "../../../shared/i18n.ts";
import { command } from "../../commands.ts";
import { usePanelStore } from "../../store/index.ts";
import { EmptyState } from "../common/EmptyState.tsx";
import { Switch } from "../common/Switch.tsx";

interface Props {
  onEdit(rule: Rule): void;
  onDuplicate(rule: Rule): void;
  onCreate(): void;
  /** Plantillas del estado vacío (historia 3). */
  templates?: ReactNode;
  /** Controles para reordenar (historia 4). */
  reorderControls?(rule: Rule, index: number, siteRules: Rule[]): ReactNode;
}

function summary(rule: Rule) {
  const stage = t(`stage_${rule.stage}`);
  const conditions = rule.conditions.length;
  return t("rule_summary", [stage, rule.prefilter.pattern, String(conditions)]);
}

/**
 * Lista de reglas (FR-014a, FR-015): las del sitio actual primero y, aparte, las de otros sitios
 * con su sitio visible. Eliminar se puede deshacer.
 */
export function RuleList({ onEdit, onDuplicate, onCreate, templates, reorderControls }: Props) {
  const rules = usePanelStore((s) => s.rules);
  const site = usePanelStore((s) => s.session?.site ?? null);
  const pushToast = usePanelStore((s) => s.pushToast);

  const current = rules.filter((r) => r.site === site).sort((a, b) => a.order - b.order);
  const others = rules.filter((r) => r.site !== site);

  const remove = async (rule: Rule) => {
    const reply = await command("deleteRule", { ruleId: rule.id });
    if (reply.ok) {
      pushToast({
        messageKey: "toast_rule_deleted",
        params: [rule.name],
        actionKey: "action_undo",
        onAction: () => void command("restoreRule", { ruleId: rule.id }),
      });
    }
  };

  const item = (rule: Rule, index: number, siteRules: Rule[], showSite: boolean) => (
    <li key={rule.id} className="rule-item" data-rule-id={rule.id}>
      <div className="row">
        <span className="grow">
          <strong>{rule.name}</strong>
          <span className="muted"> · {summary(rule)}</span>
          {showSite ? <span className="muted"> · {t("site_label", rule.site)}</span> : null}
        </span>
        <Switch
          label={t("rule_enabled", rule.name)}
          checked={rule.enabled}
          onChange={(enabled) => void command("setRuleEnabled", { ruleId: rule.id, enabled })}
        />
      </div>
      <div className="row">
        {reorderControls ? reorderControls(rule, index, siteRules) : null}
        <button
          type="button"
          onClick={() => onEdit(rule)}
          aria-label={t("action_edit_rule", rule.name)}
        >
          {t("action_edit")}
        </button>
        <button
          type="button"
          onClick={() => onDuplicate(rule)}
          aria-label={t("action_duplicate_rule", rule.name)}
        >
          {t("action_duplicate")}
        </button>
        <button
          type="button"
          onClick={() => void remove(rule)}
          aria-label={t("action_delete_rule", rule.name)}
        >
          {t("action_delete")}
        </button>
      </div>
    </li>
  );

  return (
    <div className="rules">
      {current.length === 0 ? (
        <EmptyState
          title={t("empty_rules_title")}
          action={
            <>
              <button type="button" className="primary" onClick={onCreate} disabled={site === null}>
                {t("action_create_first_rule")}
              </button>
              {templates}
            </>
          }
        >
          {t(site === null ? "empty_rules_no_site" : "empty_rules_body")}
        </EmptyState>
      ) : (
        <>
          <div className="row">
            <h2 className="grow">{site ? t("rules_for_site", site) : t("tab_rules")}</h2>
            <button type="button" className="primary" onClick={onCreate}>
              {t("action_new_rule")}
            </button>
          </div>
          <ol className="plain rule-list" aria-label={t("rules_priority_label")}>
            {current.map((rule, index) => item(rule, index, current, false))}
          </ol>
        </>
      )}
      {others.length > 0 ? (
        <details className="other-rules">
          <summary>{t("rules_other_sites", String(others.length))}</summary>
          <ul className="plain rule-list">
            {others.map((rule, index) => item(rule, index, others, true))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
