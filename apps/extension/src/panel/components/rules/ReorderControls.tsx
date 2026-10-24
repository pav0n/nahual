import type { Rule } from "@nahual/domain";
import { t } from "../../../shared/i18n.ts";
import { command } from "../../commands.ts";
import { usePanelStore } from "../../store/index.ts";
import { ariaOf } from "../../shortcuts.ts";

/** Mueve una regla dentro de la lista de su sitio y anuncia la nueva posición (FR-015, FR-016). */
export async function moveRule(rule: Rule, siteRules: Rule[], delta: -1 | 1) {
  const index = siteRules.findIndex((r) => r.id === rule.id);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= siteRules.length) return;
  const ids = siteRules.map((r) => r.id);
  [ids[index], ids[target]] = [ids[target] as string, ids[index] as string];
  const reply = await command("reorderRules", { site: rule.site, ruleIds: ids });
  if (reply.ok) {
    usePanelStore.getState().pushToast({
      messageKey: "toast_rule_moved",
      params: [rule.name, String(target + 1), String(siteRules.length)],
    });
    // El foco sigue a la regla en su nueva posición.
    requestAnimationFrame(() =>
      document
        .querySelector<HTMLElement>(
          `[data-rule-id="${rule.id}"] [data-move="${delta < 0 ? "up" : "down"}"]`,
        )
        ?.focus(),
    );
  }
}

export function ReorderControls({
  rule,
  index,
  siteRules,
}: {
  rule: Rule;
  index: number;
  siteRules: Rule[];
}) {
  return (
    <>
      <button
        type="button"
        data-move="up"
        disabled={index === 0}
        aria-keyshortcuts={ariaOf("moveRuleUp")}
        aria-label={t("action_move_up_rule", rule.name)}
        onClick={() => void moveRule(rule, siteRules, -1)}
      >
        ↑ {t("action_move_up")}
      </button>
      <button
        type="button"
        data-move="down"
        disabled={index === siteRules.length - 1}
        aria-keyshortcuts={ariaOf("moveRuleDown")}
        aria-label={t("action_move_down_rule", rule.name)}
        onClick={() => void moveRule(rule, siteRules, 1)}
      >
        ↓ {t("action_move_down")}
      </button>
    </>
  );
}
