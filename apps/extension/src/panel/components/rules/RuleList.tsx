import type { Rule } from "@nahual/domain";
import { useRef, useState, type ReactNode } from "react";
import { t } from "../../../shared/i18n.ts";
import { command } from "../../commands.ts";
import { resumeHook } from "../../hooks/runtime.ts";
import { ImportHookButton } from "../hooks/ImportHookDialog.tsx";
import { setRuleEnabled } from "../../settings-commands.ts";
import { usePanelStore } from "../../store/index.ts";
import { EmptyState } from "../common/EmptyState.tsx";
import { Switch } from "../common/Switch.tsx";
import { moveRule } from "./ReorderControls.tsx";
import { setRuleProfiles } from "../../profiles/commands.ts";
import { activeProfileName, profilesOfSite } from "../../profiles/select.ts";
import { Icon } from "../common/icons.tsx";
import { Menu, anchorOf } from "../common/Menu.tsx";
import type { Anchor } from "../common/menu-logic.ts";

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
/** 006 (FR-016): una regla con un hook con errores no se puede activar. */
const isBlocked = (rule: Rule) => rule.action.kind === "hook" && !rule.action.check.ok;

export function RuleList({ onEdit, onDuplicate, onCreate, templates, reorderControls }: Props) {
  const rules = usePanelStore((s) => s.rules);
  const site = usePanelStore((s) => s.session?.site ?? null);
  const pushToast = usePanelStore((s) => s.pushToast);
  const suspended = usePanelStore((s) => s.hookSuspended);
  const profiles = usePanelStore((s) => s.profiles);
  const activeProfileId = usePanelStore((s) => s.session?.activeProfileId ?? null);
  const activeName = activeProfileName(profiles, activeProfileId);
  /** 007: menú "Asignar perfiles" abierto para una regla. */
  const [assign, setAssign] = useState<{ rule: Rule; anchor: Anchor } | null>(null);
  const assignTrigger = useRef<HTMLButtonElement | null>(null);
  /** 007 (FR-028): reglas importadas que no se activan hasta completar sus valores redactados. */
  const [redacted, setRedacted] = useState<string[]>([]);

  const toggleEnabled = async (rule: Rule, enabled: boolean) => {
    const reply = await setRuleEnabled(rule.id, enabled);
    const blocked =
      !reply.ok && reply.issues.some((i) => i.messageKey === "rule_error_redacted_value");
    setRedacted((list) =>
      blocked ? [...new Set([...list, rule.id])] : list.filter((id) => id !== rule.id),
    );
  };

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
    <li
      key={rule.id}
      className="rule-item"
      data-rule-id={rule.id}
      onKeyDown={(event) => {
        // Alt+Flechas reordena la regla enfocada (FR-015, solo teclado).
        if (!reorderControls || !event.altKey || showSite) return;
        if (event.key === "ArrowUp" || event.key === "ArrowDown") {
          event.preventDefault();
          void moveRule(rule, siteRules, event.key === "ArrowUp" ? -1 : 1);
        }
      }}
    >
      <div className="row">
        <span className="grow">
          <strong>{rule.name}</strong>
          {rule.action.kind === "hook" && rule.action.imported ? (
            <span className="tag">{t("hook_imported")}</span>
          ) : null}
          {rule.importedFrom === "requestly" ? (
            <span className="tag">{t("rule_imported_requestly")}</span>
          ) : null}
          {rule.profileIds.map((id) => {
            const name = profiles.find((p) => p.id === id)?.name;
            return name ? (
              <span key={id} className="tag profile-tag">
                {name}
              </span>
            ) : null;
          })}
          <span className="muted"> · {summary(rule)}</span>
          {showSite ? <span className="muted"> · {t("site_label", rule.site)}</span> : null}
        </span>
        <Switch
          label={t("rule_enabled", rule.name)}
          checked={rule.enabled}
          // 006 (FR-016): un hook con errores no se puede activar; el motivo va debajo.
          disabled={isBlocked(rule) && !rule.enabled}
          onChange={(enabled) => void toggleEnabled(rule, enabled)}
        />
      </div>
      {activeProfileId !== null && !showSite && !rule.profileIds.includes(activeProfileId) ? (
        <p className="muted rule-inactive">
          <Icon name="profile" />
          {t("profile_rule_inactive", activeName ?? "")}
        </p>
      ) : null}
      {redacted.includes(rule.id) ? (
        <p className="field-warning row">
          <span className="grow">{t("rule_error_redacted_value")}</span>
          <button type="button" onClick={() => onEdit(rule)}>
            {t("action_edit")}
          </button>
        </p>
      ) : null}
      {isBlocked(rule) ? <p className="field-warning">{t("hook_error_not_checked")}</p> : null}
      {suspended.includes(rule.id) ? (
        <p className="field-warning row">
          <span className="tag">{t("hook_suspended")}</span>
          <span className="grow">{t("hook_suspended_reason")}</span>
          <button type="button" onClick={() => resumeHook(rule.id)}>
            {t("hook_resume")}
          </button>
        </p>
      ) : null}
      <div className="row">
        {reorderControls && !showSite ? reorderControls(rule, index, siteRules) : null}
        <button
          type="button"
          aria-haspopup="menu"
          aria-label={`${t("profile_rule_assign")}: ${rule.name}`}
          onClick={(event) => {
            assignTrigger.current = event.currentTarget;
            setAssign({ rule, anchor: anchorOf(event.currentTarget) });
          }}
        >
          {t("profile_rule_assign")}
        </button>
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
              <ImportHookButton disabled={site === null} />
            </>
          }
        >
          {t(site === null ? "empty_rules_no_site" : "empty_rules_body")}
        </EmptyState>
      ) : (
        <>
          <div className="row">
            <h2 className="grow">{site ? t("rules_for_site", site) : t("tab_rules")}</h2>
            <ImportHookButton />
            <button type="button" className="primary" onClick={onCreate}>
              {t("action_new_rule")}
            </button>
          </div>
          {activeProfileId !== null &&
          !current.some((r) => r.profileIds.includes(activeProfileId)) ? (
            <EmptyState title={t("profile_active_empty")}>
              {t("profile_empty_add_selected")}
            </EmptyState>
          ) : null}
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
      <Menu
        open={assign !== null}
        anchor={assign?.anchor ?? null}
        label={t("profile_rule_assign")}
        returnFocus={assignTrigger}
        onClose={() => setAssign(null)}
        items={
          assign
            ? [
                ...profilesOfSite(profiles, assign.rule.site).map((profile) => {
                  const on = assign.rule.profileIds.includes(profile.id);
                  return {
                    id: profile.id,
                    label: profile.name,
                    checked: on,
                    onSelect: () =>
                      void setRuleProfiles(
                        assign.rule.id,
                        on
                          ? assign.rule.profileIds.filter((id) => id !== profile.id)
                          : [...assign.rule.profileIds, profile.id],
                      ),
                  };
                }),
                {
                  id: "manage",
                  label: t("profile_menu_manage"),
                  onSelect: () => usePanelStore.getState().openSettings("profiles"),
                },
              ]
            : []
        }
      />
    </div>
  );
}
