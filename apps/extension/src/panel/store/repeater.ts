import { LIMITS, type RepeaterMode, type RepeaterRequest, type RepeaterSend } from "@nahual/domain";
import type { SwPayload } from "@nahual/protocol";
import type { RepeaterTab } from "../repeater/types.ts";
import type { SliceCreator } from "./types.ts";

/** Pestaña cerrada que "Deshacer" puede devolver a su lugar (FR-020). */
export interface ClosedRepeaterTab {
  tab: RepeaterTab;
  index: number;
}

/**
 * Repeater (005, research R13): pestañas en memoria del panel; nada se guarda en disco
 * (FR-020a). Límites de FR-021: 20 pestañas y 50 envíos por pestaña.
 */
export interface RepeaterSlice {
  repeaterTabs: RepeaterTab[];
  activeRepeaterTab: string | null;
  recentlyClosedTab: ClosedRepeaterTab | null;
  /** Devuelve el id, o `null` si ya hay 20 pestañas. */
  openRepeaterTab(input: {
    name: string;
    request: RepeaterRequest;
    source: RepeaterTab["source"];
  }): string | null;
  newRepeaterTab(name: string): string | null;
  selectRepeaterTab(id: string): void;
  renameRepeaterTab(id: string, name: string): void;
  duplicateRepeaterTab(id: string, name: string): string | null;
  closeRepeaterTab(id: string): void;
  restoreRepeaterTab(): void;
  setRepeaterDraft(id: string, draft: RepeaterRequest): void;
  setRepeaterMode(id: string, mode: RepeaterMode): void;
  setRepeaterPasted(id: string, pasted: RepeaterTab["pasted"]): void;
  startRepeaterSend(id: string, send: RepeaterSend): void;
  applyRepeaterResult(result: SwPayload<"repeaterResult">): void;
}

const EMPTY_REQUEST: RepeaterRequest = {
  method: "GET",
  url: "",
  headers: [],
  body: { kind: "none" },
};

const tabName = (name: string) => name.trim().slice(0, LIMITS.repeaterTabNameMax).trim();

export const createRepeaterSlice: SliceCreator<RepeaterSlice> = (set, get) => {
  const add = (
    tab: Omit<RepeaterTab, "id" | "site">,
    index?: number,
    site?: string | null,
  ): string | null => {
    if (get().repeaterTabs.length >= LIMITS.repeaterTabsMax) return null;
    const id = crypto.randomUUID();
    const tabSite = site === undefined ? (get().session?.site ?? null) : site;
    set((s) => {
      s.repeaterTabs.splice(index ?? s.repeaterTabs.length, 0, { ...tab, id, site: tabSite });
      s.activeRepeaterTab = id;
    });
    return id;
  };
  const update = (id: string, change: (tab: RepeaterTab) => void) =>
    set((s) => {
      const tab = s.repeaterTabs.find((t) => t.id === id);
      if (tab) change(tab);
    });

  return {
    repeaterTabs: [],
    activeRepeaterTab: null,
    recentlyClosedTab: null,
    openRepeaterTab: ({ name, request, source }) =>
      add({
        name: tabName(name) || request.method,
        mode: "page",
        draft: request,
        source,
        sends: [],
        droppedCount: 0,
        pasted: null,
      }),
    newRepeaterTab: (name) =>
      add({
        name: tabName(name),
        mode: "page",
        draft: EMPTY_REQUEST,
        source: null,
        sends: [],
        droppedCount: 0,
        pasted: null,
      }),
    selectRepeaterTab: (id) =>
      set((s) => {
        if (s.repeaterTabs.some((t) => t.id === id)) s.activeRepeaterTab = id;
      }),
    renameRepeaterTab: (id, name) => {
      const clean = tabName(name);
      if (clean) update(id, (tab) => void (tab.name = clean));
    },
    duplicateRepeaterTab: (id, name) => {
      const tabs = get().repeaterTabs;
      const index = tabs.findIndex((t) => t.id === id);
      const tab = tabs[index];
      if (!tab) return null;
      return add(
        {
          name: tabName(name) || tab.name,
          mode: tab.mode,
          draft: tab.draft,
          source: null,
          sends: [],
          droppedCount: 0,
          pasted: null,
        },
        index + 1,
        tab.site,
      );
    },
    closeRepeaterTab: (id) =>
      set((s) => {
        const index = s.repeaterTabs.findIndex((t) => t.id === id);
        const tab = s.repeaterTabs[index];
        if (!tab) return;
        s.recentlyClosedTab = { tab, index };
        s.repeaterTabs.splice(index, 1);
        if (s.activeRepeaterTab === id)
          s.activeRepeaterTab = (s.repeaterTabs[index] ?? s.repeaterTabs[index - 1])?.id ?? null;
      }),
    restoreRepeaterTab: () =>
      set((s) => {
        const closed = s.recentlyClosedTab;
        if (!closed || s.repeaterTabs.length >= LIMITS.repeaterTabsMax) return;
        s.repeaterTabs.splice(Math.min(closed.index, s.repeaterTabs.length), 0, closed.tab);
        s.activeRepeaterTab = closed.tab.id;
        s.recentlyClosedTab = null;
      }),
    setRepeaterDraft: (id, draft) => update(id, (tab) => void (tab.draft = draft)),
    setRepeaterMode: (id, mode) => update(id, (tab) => void (tab.mode = mode)),
    setRepeaterPasted: (id, pasted) => update(id, (tab) => void (tab.pasted = pasted)),
    startRepeaterSend: (id, send) =>
      update(id, (tab) => {
        tab.sends.unshift(send);
        const extra = tab.sends.length - LIMITS.repeaterSendsMax;
        if (extra > 0) {
          tab.sends.splice(LIMITS.repeaterSendsMax);
          tab.droppedCount += extra;
        }
      }),
    applyRepeaterResult: (result) =>
      set((s) => {
        for (const tab of s.repeaterTabs) {
          const index = tab.sends.findIndex((x) => x.sendId === result.sendId);
          const current = tab.sends[index];
          if (!current) continue;
          tab.sends[index] = {
            ...current,
            ...result,
            request: current.request,
            mode: current.mode,
          };
          return;
        }
      }),
  };
};
