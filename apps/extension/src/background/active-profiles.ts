export interface ActiveProfiles {
  /** El panel se conectó: la pestaña toma el último perfil del sitio (FR-022). */
  onHello(tabId: number, site: string | null): void;
  /** La pestaña cambió de sitio: el que tenía en ese sitio, o el último del sitio. */
  onNavigate(tabId: number, site: string | null): void;
  /** Perfil activo de la pestaña; `null` = "Todas las reglas". */
  get(tabId: number): string | null;
  /** Cambia el de la pestaña y el recuerdo del sitio; `false` si el perfil no es del sitio. */
  set(tabId: number, site: string | null, profileId: string | null): boolean;
  /** Pestañas que tenían ese perfil activo; vuelven a "Todas las reglas". */
  onProfileDeleted(profileId: string): number[];
  forget(tabId: number): void;
}

export interface ActiveProfilesOptions {
  lastActive(): Record<string, string>;
  /** Sitio de un perfil, o `null` si no existe. */
  siteOfProfile(profileId: string): string | null;
  /** Guarda el último perfil activado en el sitio (en `nahual.profiles.v1`). */
  remember(site: string, profileId: string | null): void;
}

/**
 * Perfil activo de cada pestaña, solo en memoria del SW (007, research R13): no sobrevive a la
 * pestaña, y tras un reinicio del SW se recalcula desde el último perfil de cada sitio. Cada
 * pestaña recuerda el que tenía en cada sitio para recuperarlo al volver (Edge Cases).
 */
export function createActiveProfiles(options: ActiveProfilesOptions): ActiveProfiles {
  const tabs = new Map<number, { site: string | null; bySite: Map<string, string | null> }>();

  const fromMemory = (site: string | null) => {
    if (site === null) return null;
    const id = options.lastActive()[site] ?? null;
    return id !== null && options.siteOfProfile(id) === site ? id : null;
  };

  return {
    onHello(tabId, site) {
      const bySite = new Map<string, string | null>();
      if (site !== null) bySite.set(site, fromMemory(site));
      tabs.set(tabId, { site, bySite });
    },

    onNavigate(tabId, site) {
      const tab = tabs.get(tabId) ?? { site: null, bySite: new Map() };
      tab.site = site;
      if (site !== null && !tab.bySite.has(site)) tab.bySite.set(site, fromMemory(site));
      tabs.set(tabId, tab);
    },

    get(tabId) {
      const tab = tabs.get(tabId);
      if (!tab || tab.site === null) return null;
      const id = tab.bySite.get(tab.site) ?? null;
      // Un perfil borrado desde otro sitio o por una escritura externa deja de aplicar.
      return id !== null && options.siteOfProfile(id) === tab.site ? id : null;
    },

    set(tabId, site, profileId) {
      if (site === null) return profileId === null;
      if (profileId !== null && options.siteOfProfile(profileId) !== site) return false;
      const tab = tabs.get(tabId) ?? { site, bySite: new Map() };
      tab.site = site;
      tab.bySite.set(site, profileId);
      tabs.set(tabId, tab);
      options.remember(site, profileId);
      return true;
    },

    onProfileDeleted(profileId) {
      const affected: number[] = [];
      for (const [tabId, tab] of tabs) {
        for (const [site, id] of tab.bySite) {
          if (id !== profileId) continue;
          tab.bySite.set(site, null);
          if (site === tab.site) affected.push(tabId);
        }
      }
      return affected;
    },

    forget(tabId) {
      tabs.delete(tabId);
    },
  };
}
