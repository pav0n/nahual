import type { Rule } from "@nahual/domain";
import type { SliceCreator } from "./types.ts";

export interface RulesSlice {
  rules: Rule[];
  setRules(rules: Rule[]): void;
  /** Cambio optimista mientras el SW confirma; el siguiente evento `rules` manda. */
  setRuleEnabledLocal(ruleId: string, enabled: boolean): void;
}

export const createRulesSlice: SliceCreator<RulesSlice> = (set) => ({
  rules: [],
  setRules: (rules) =>
    set((s) => {
      s.rules = rules;
    }),
  setRuleEnabledLocal: (ruleId, enabled) =>
    set((s) => {
      const rule = s.rules.find((r) => r.id === ruleId);
      if (rule) rule.enabled = enabled;
    }),
});
