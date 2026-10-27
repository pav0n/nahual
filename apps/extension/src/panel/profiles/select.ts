import type { Profile, Rule } from "@nahual/domain";

/** Perfiles de un sitio, por nombre (Ajustes ⇒ Perfiles, menú del perfil). */
export const profilesOfSite = (profiles: readonly Profile[], site: string | null): Profile[] =>
  site === null
    ? []
    : profiles
        .filter((p) => p.site === site)
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

/** Reglas que actúan en la pestaña: activas, del sitio y del perfil activo si hay uno (FR-024). */
export const rulesThatApply = (
  rules: readonly Rule[],
  site: string | null,
  activeProfileId: string | null,
): Rule[] =>
  rules.filter(
    (r) =>
      r.enabled &&
      r.site === site &&
      (activeProfileId === null || r.profileIds.includes(activeProfileId)),
  );

export const activeProfileName = (profiles: readonly Profile[], id: string | null) =>
  id === null ? null : (profiles.find((p) => p.id === id)?.name ?? null);
