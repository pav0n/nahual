import {
  LIMITS,
  ProfileSchema,
  SiteSchema,
  uniqueProfileName,
  type Profile,
  type Rule,
} from "@nahual/domain";
import type { CommandResult } from "./panel-port.ts";
import type { RuleStore } from "./rule-store.ts";
import type { LocalStorageLike } from "./storage-port.ts";

export const PROFILES_KEY = "nahual.profiles.v1";
const VERSION = 1;

export interface ProfilesView {
  profiles: Profile[];
  lastActive: Record<string, string>;
}

export interface ProfileStore {
  ready: Promise<void>;
  all(): Profile[];
  idsOf(site: string): ReadonlySet<string>;
  lastActive(): Record<string, string>;
  view(): ProfilesView;
  /** Crea (sin `id`, en el sitio dado) o renombra (con `id`). */
  save(
    input: { id?: string | undefined; name: string },
    site: string | null,
  ): Promise<CommandResult>;
  /** Perfil nuevo con la misma pertenencia de reglas que `id` (FR-023). */
  duplicate(id: string, name: string): Promise<CommandResult>;
  /** Quita el perfil y su pertenencia; no borra reglas. Deshacer 10 s (clarificación). */
  remove(id: string): Promise<CommandResult>;
  restore(id: string): Promise<CommandResult>;
  setLastActive(site: string, profileId: string | null): Promise<CommandResult>;
  /** 007 (research R10): valor de `nahual.profiles.v1` para una escritura conjunta. */
  stage(view: ProfilesView): unknown;
}

export interface ProfileStoreOptions {
  storage: LocalStorageLike;
  /** Las escrituras que tocan reglas van por su transacción: una sola escritura (research R13). */
  rules: RuleStore;
  onChange(view: ProfilesView): void;
  onNotice(messageKey: string): void;
}

const invalid = (messageKey: string): CommandResult => ({
  ok: false,
  code: "profile_invalid",
  issues: [{ path: "name", messageKey }],
});

/**
 * Perfiles de reglas en `chrome.storage.local` (007, contracts/storage.md, research R13). La
 * pertenencia vive en cada regla (`profileIds`); aquí, los perfiles y el último activado por
 * sitio. Solo el SW escribe.
 */
export function createProfileStore(options: ProfileStoreOptions): ProfileStore {
  const { storage, rules } = options;
  let profiles: Profile[] = [];
  let lastActive: Record<string, string> = {};
  const deleted = new Map<string, { profile: Profile; ruleIds: string[]; until: number }>();

  const load = (raw: unknown) => {
    profiles = [];
    lastActive = {};
    if (raw === undefined) return;
    const root = raw as { version?: unknown; profiles?: unknown; lastActive?: unknown } | null;
    if (typeof root !== "object" || root === null || root.version !== VERSION) {
      options.onNotice("notice_profiles_version");
      return;
    }
    for (const entry of Array.isArray(root.profiles) ? root.profiles : []) {
      const parsed = ProfileSchema.safeParse(entry);
      if (parsed.success) profiles.push(parsed.data);
    }
    const ids = new Set(profiles.map((p) => p.id));
    const remembered =
      typeof root.lastActive === "object" && root.lastActive ? root.lastActive : {};
    for (const [site, id] of Object.entries(remembered)) {
      if (SiteSchema.safeParse(site).success && typeof id === "string" && ids.has(id))
        lastActive[site] = id;
    }
  };

  const view = (): ProfilesView => ({ profiles, lastActive });

  // Un cambio que llega antes que la lectura inicial es más nuevo que ella: no se pisa.
  let changedBeforeRead = false;
  const ready = storage.get(PROFILES_KEY).then((items) => {
    if (!changedBeforeRead) load(items[PROFILES_KEY]);
  });
  storage.onChanged((changes) => {
    const change = changes[PROFILES_KEY];
    if (!change) return;
    changedBeforeRead = true;
    load(change.newValue);
    options.onChange(view());
  });

  /** Escribe el estado nuevo (y reglas, si cambian) en una sola llamada y lo adopta. */
  const commit = (
    next: { profiles: Profile[]; lastActive: Record<string, string> },
    nextRules?: (current: Rule[]) => Rule[],
  ) =>
    rules.transaction((current) => ({
      ...(nextRules ? { rules: nextRules(current) } : {}),
      extra: { [PROFILES_KEY]: { version: VERSION, ...next } },
      after: () => {
        profiles = next.profiles;
        lastActive = next.lastActive;
        options.onChange(view());
      },
    }));

  const withoutMemory = (id: string) =>
    Object.fromEntries(Object.entries(lastActive).filter(([, value]) => value !== id));

  const validName = (site: string, name: string, exceptId?: string): CommandResult | null => {
    const parsed = ProfileSchema.shape.name.safeParse(name);
    if (!parsed.success)
      return invalid(parsed.error.issues[0]?.message ?? "profile_error_required");
    if (!uniqueProfileName(profiles, site, parsed.data, exceptId))
      return invalid("profile_error_duplicate");
    return null;
  };

  const create = (site: string, name: string): Profile | CommandResult => {
    const error = validName(site, name);
    if (error) return error;
    if (profiles.filter((p) => p.site === site).length >= LIMITS.profilesPerSiteMax)
      return invalid("profile_error_limit");
    const now = Date.now();
    return { id: crypto.randomUUID(), site, name: name.trim(), createdAt: now, updatedAt: now };
  };

  return {
    ready,
    all: () => profiles,
    idsOf: (site) => new Set(profiles.filter((p) => p.site === site).map((p) => p.id)),
    lastActive: () => lastActive,
    view,

    save({ id, name }, site) {
      if (id !== undefined) {
        const existing = profiles.find((p) => p.id === id);
        if (!existing) return Promise.resolve({ ok: false, code: "profile_not_found" });
        const error = validName(existing.site, name, id);
        if (error) return Promise.resolve(error);
        const renamed = { ...existing, name: name.trim(), updatedAt: Date.now() };
        return commit({ profiles: profiles.map((p) => (p.id === id ? renamed : p)), lastActive });
      }
      if (site === null) return Promise.resolve({ ok: false, code: "no_site" });
      const created = create(site, name);
      if ("ok" in created) return Promise.resolve(created);
      return commit({ profiles: [...profiles, created], lastActive });
    },

    duplicate(id, name) {
      const source = profiles.find((p) => p.id === id);
      if (!source) return Promise.resolve({ ok: false, code: "profile_not_found" });
      const created = create(source.site, name);
      if ("ok" in created) return Promise.resolve(created);
      return commit({ profiles: [...profiles, created], lastActive }, (current) =>
        current.map((r) =>
          r.profileIds.includes(id) && r.profileIds.length < LIMITS.profilesPerRuleMax
            ? { ...r, profileIds: [...r.profileIds, created.id] }
            : r,
        ),
      );
    },

    remove(id) {
      const profile = profiles.find((p) => p.id === id);
      if (!profile) return Promise.resolve({ ok: false, code: "profile_not_found" });
      const ruleIds = rules
        .all()
        .filter((r) => r.profileIds.includes(id))
        .map((r) => r.id);
      deleted.set(id, { profile, ruleIds, until: Date.now() + LIMITS.importUndoMs });
      return commit(
        { profiles: profiles.filter((p) => p.id !== id), lastActive: withoutMemory(id) },
        (current) =>
          current.map((r) =>
            r.profileIds.includes(id)
              ? { ...r, profileIds: r.profileIds.filter((x) => x !== id) }
              : r,
          ),
      );
    },

    restore(id) {
      const entry = deleted.get(id);
      deleted.delete(id);
      if (!entry || Date.now() > entry.until)
        return Promise.resolve({ ok: false, code: "undo_expired" });
      if (profiles.some((p) => p.id === id)) return Promise.resolve({ ok: true });
      const back = new Set(entry.ruleIds);
      // Deshacer recupera el perfil y su pertenencia, no la selección de las pestañas (Edge Cases).
      return commit({ profiles: [...profiles, entry.profile], lastActive }, (current) =>
        current.map((r) =>
          back.has(r.id) && !r.profileIds.includes(id)
            ? { ...r, profileIds: [...r.profileIds, id] }
            : r,
        ),
      );
    },

    stage: (next) => ({ version: VERSION, ...next }),

    setLastActive(site, profileId) {
      if ((lastActive[site] ?? null) === profileId) return Promise.resolve({ ok: true });
      const others = Object.entries(lastActive).filter(([key]) => key !== site);
      const next = Object.fromEntries(profileId === null ? others : [...others, [site, profileId]]);
      return commit({ profiles, lastActive: next });
    },
  };
}
