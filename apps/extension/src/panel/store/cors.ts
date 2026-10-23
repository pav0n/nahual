import type { RelaxationView } from "@nahual/domain";
import type { SliceCreator } from "./types.ts";

export interface CorsSlice {
  /** Relajaciones CORS de la pestaña; la fuente de verdad es el SW (research R10). */
  relaxations: RelaxationView[];
  /** El puerto se reabrió: la siguiente lista dice si un SW nuevo perdió las relajaciones. */
  awaitingRelaxationsAfterReconnect: boolean;
  setRelaxations(items: RelaxationView[]): void;
  beginReconnect(): void;
  /** Origen de API del reporte abierto (historia 3), o null. */
  reportApiOrigin: string | null;
  openReport(apiOrigin: string): void;
  closeReport(): void;
}

export const createCorsSlice: SliceCreator<CorsSlice> = (set, get) => ({
  relaxations: [],
  awaitingRelaxationsAfterReconnect: false,
  setRelaxations: (items) => {
    const { relaxations, awaitingRelaxationsAfterReconnect } = get();
    // Un SW reiniciado no tiene relajaciones (FR-016): el panel lo explica (cors_ended_restart).
    const lostOnRestart =
      awaitingRelaxationsAfterReconnect && relaxations.length > 0 && items.length === 0;
    set((s) => {
      s.relaxations = items;
      s.awaitingRelaxationsAfterReconnect = false;
    });
    if (lostOnRestart) get().pushNotice("cors_ended_restart");
  },
  beginReconnect: () =>
    set((s) => {
      s.awaitingRelaxationsAfterReconnect = true;
    }),
  reportApiOrigin: null,
  openReport: (apiOrigin) =>
    set((s) => {
      s.reportApiOrigin = apiOrigin;
    }),
  closeReport: () =>
    set((s) => {
      s.reportApiOrigin = null;
    }),
});
