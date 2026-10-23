import type { Rule } from "@nahual/domain";
import type { SliceCreator } from "./types.ts";

export interface RulesSlice {
  rules: Rule[];
  setRules(rules: Rule[]): void;
}

export const createRulesSlice: SliceCreator<RulesSlice> = (set) => ({
  rules: [],
  setRules: (rules) =>
    set((s) => {
      s.rules = rules;
    }),
});
