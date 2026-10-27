import type { Profile } from "@nahual/domain";
import type { SliceCreator } from "./types.ts";

/** 007: perfiles de todos los sitios y el último activado en cada uno (evento `profiles`). */
export interface ProfilesSlice {
  profiles: Profile[];
  lastActive: Record<string, string>;
  setProfiles(view: { profiles: Profile[]; lastActive: Record<string, string> }): void;
  /** Sube con `Alt+Shift+O`: el selector de la barra abre su menú (FR-021). */
  profileMenuSeq: number;
  requestProfileMenu(): void;
}

export const createProfilesSlice: SliceCreator<ProfilesSlice> = (set) => ({
  profiles: [],
  lastActive: {},
  setProfiles: (view) =>
    set((s) => {
      s.profiles = view.profiles;
      s.lastActive = view.lastActive;
    }),
  profileMenuSeq: 0,
  requestProfileMenu: () =>
    set((s) => {
      s.profileMenuSeq += 1;
    }),
});
