import { LIMITS, RuleSchema, compileJsonPath, validateRuleDraft, type Rule } from "@nahual/domain";
import type { CommandResult } from "./panel-port.ts";
import { isQuotaError, type LocalStorageLike } from "./storage-port.ts";

export const RULES_KEY = "nahual.rules.v1";
const VERSION = 1;
/** Tiempo para deshacer una eliminación (FR-015). */
export const RESTORE_MS = 10_000;

export interface RuleStore {
  ready: Promise<void>;
  all(): Rule[];
  /** Reglas del sitio, por prioridad. */
  forSite(site: string | null): Rule[];
  /** Reglas leídas del disco que no pasaron la validación, agrupadas por causa. */
  discarded(): { count: number; reasonKey: string }[];
  /** Crea (sin `id`, al final del sitio) o reemplaza (con `id`). Valida con FR-013. */
  save(input: Record<string, unknown>, site: string | null): Promise<CommandResult>;
  remove(ruleId: string): Promise<CommandResult>;
  restore(ruleId: string): Promise<CommandResult>;
  setEnabled(ruleId: string, enabled: boolean): Promise<CommandResult>;
  /** Nuevo orden completo de las reglas de un sitio (FR-016). */
  reorder(site: string, ruleIds: string[]): Promise<CommandResult>;
}

export interface RuleStoreOptions {
  storage: LocalStorageLike;
  onChange(rules: Rule[]): void;
  onNotice(messageKey: string): void;
}

/** Valida una regla leída del disco: schema y rutas JSONPath compilables. */
function readRule(raw: unknown): Rule | null {
  const parsed = RuleSchema.safeParse(raw);
  if (!parsed.success) return null;
  const jsonPathOk = parsed.data.conditions.every(
    (c) => c.kind !== "jsonPath" || compileJsonPath(c.path).ok,
  );
  return jsonPathOk ? parsed.data : null;
}

const byOrder = (a: Rule, b: Rule) => a.order - b.order;

/** Renumera `order` 0..n-1 dentro de cada sitio, respetando el orden actual. */
function renumber(rules: Rule[]): Rule[] {
  const sites = new Map<string, Rule[]>();
  for (const rule of rules) sites.set(rule.site, [...(sites.get(rule.site) ?? []), rule]);
  return [...sites.values()].flatMap((list) =>
    list.sort(byOrder).map((rule, order) => (rule.order === order ? rule : { ...rule, order })),
  );
}

/**
 * Reglas en `chrome.storage.local` (contracts/storage.md). El SW es el único escritor: valida al
 * guardar y al leer; las reglas inválidas del disco no se usan pero tampoco se borran.
 */
export function createRuleStore(options: RuleStoreOptions): RuleStore {
  const { storage } = options;
  let rules: Rule[] = [];
  /** Entradas del disco que no pasaron la validación: se conservan al reescribir. */
  let invalidRaw: unknown[] = [];
  let discardedCount = 0;
  const deleted = new Map<string, { rule: Rule; until: number }>();
  let writes = Promise.resolve();

  const load = (raw: unknown) => {
    rules = [];
    invalidRaw = [];
    discardedCount = 0;
    if (raw === undefined) return;
    const root = raw as { version?: unknown; rules?: unknown } | null;
    if (typeof root !== "object" || root === null || root.version !== VERSION) {
      options.onNotice("notice_rules_version");
      return;
    }
    const list = Array.isArray(root.rules) ? root.rules : [];
    for (const entry of list) {
      const rule = readRule(entry);
      if (rule) rules.push(rule);
      else invalidRaw.push(entry);
    }
    discardedCount = invalidRaw.length;
    rules = renumber(rules);
  };

  const ready = storage.get(RULES_KEY).then((items) => load(items[RULES_KEY]));

  storage.onChanged((changes) => {
    const change = changes[RULES_KEY];
    if (!change) return;
    load(change.newValue);
    options.onChange(rules);
  });

  /** Escritura serializada: calcula el estado nuevo, lo persiste y solo entonces lo adopta. */
  const mutate = (change: (current: Rule[]) => Rule[] | CommandResult): Promise<CommandResult> => {
    const result = writes.then(async (): Promise<CommandResult> => {
      const next = change(rules);
      if (!Array.isArray(next)) return next;
      const ordered = renumber(next);
      try {
        await storage.set({
          [RULES_KEY]: { version: VERSION, rules: [...ordered, ...invalidRaw] },
        });
      } catch (error) {
        return { ok: false, code: isQuotaError(error) ? "storage_quota" : "cdp_error" };
      }
      rules = ordered;
      options.onChange(rules);
      return { ok: true };
    });
    writes = result.then(() => {});
    return result;
  };

  const find = (id: string) => rules.find((r) => r.id === id);

  return {
    ready,
    all: () => rules,
    forSite: (site) => (site === null ? [] : rules.filter((r) => r.site === site).sort(byOrder)),
    discarded: () =>
      discardedCount > 0 ? [{ count: discardedCount, reasonKey: "notice_rules_invalid" }] : [],

    save(input, site) {
      const { id, ...draftInput } = input;
      const validation = validateRuleDraft(draftInput);
      if (!validation.ok)
        return Promise.resolve({ ok: false, code: "rule_invalid", issues: validation.issues });
      const draft = validation.value;
      const now = Date.now();
      return mutate((current) => {
        if (typeof id === "string") {
          const existing = current.find((r) => r.id === id);
          if (!existing) return { ok: false, code: "unknown_rule" };
          return current.map((r) =>
            r.id === id
              ? {
                  ...draft,
                  id,
                  site: r.site,
                  order: r.order,
                  createdAt: r.createdAt,
                  updatedAt: now,
                }
              : r,
          );
        }
        if (site === null) return { ok: false, code: "no_site" };
        if (current.length >= LIMITS.rulesMax) {
          return {
            ok: false,
            code: "rule_invalid",
            issues: [{ path: "", messageKey: "rule_error_too_many_rules" }],
          };
        }
        const order = current.filter((r) => r.site === site).length;
        return [
          ...current,
          { ...draft, id: crypto.randomUUID(), site, order, createdAt: now, updatedAt: now },
        ];
      });
    },

    remove(ruleId) {
      return mutate((current) => {
        const rule = current.find((r) => r.id === ruleId);
        if (!rule) return { ok: false, code: "unknown_rule" };
        deleted.set(ruleId, { rule, until: Date.now() + RESTORE_MS });
        return current.filter((r) => r.id !== ruleId);
      });
    },

    restore(ruleId) {
      const entry = deleted.get(ruleId);
      deleted.delete(ruleId);
      if (!entry || Date.now() > entry.until)
        return Promise.resolve({ ok: false, code: "unknown_rule" });
      return mutate((current) => {
        if (current.some((r) => r.id === ruleId)) return current;
        // Vuelve a su posición: las reglas del sitio desde esa posición bajan un lugar.
        const shifted = current.map((r) =>
          r.site === entry.rule.site && r.order >= entry.rule.order
            ? { ...r, order: r.order + 1 }
            : r,
        );
        return [...shifted, entry.rule];
      });
    },

    setEnabled(ruleId, enabled) {
      if (!find(ruleId)) return Promise.resolve({ ok: false, code: "unknown_rule" });
      return mutate((current) =>
        current.map((r) => (r.id === ruleId ? { ...r, enabled, updatedAt: Date.now() } : r)),
      );
    },

    reorder(site, ruleIds) {
      return mutate((current) => {
        const siteRules = current.filter((r) => r.site === site);
        const ids = new Set(ruleIds);
        if (ids.size !== siteRules.length || siteRules.some((r) => !ids.has(r.id))) {
          return { ok: false, code: "unknown_rule" };
        }
        const position = new Map(ruleIds.map((id, index) => [id, index]));
        return current.map((r) =>
          r.site === site ? { ...r, order: position.get(r.id) ?? r.order } : r,
        );
      });
    },
  };
}
