import { describe, expect, it } from "vitest";
import {
  ProfileSchema,
  ProfilesStateSchema,
  type Profile,
  uniqueProfileName,
} from "../src/schemas/profile.ts";
import { SITE } from "./fixtures.ts";

const ID = "0b8f8a52-4a0c-4d0e-9f3a-6c1d2e3f4a5b";
const ID2 = "1c9f8a52-4a0c-4d0e-9f3a-6c1d2e3f4a5b";
const profile = (overrides: Partial<Profile> = {}): Profile => ({
  id: ID,
  site: SITE,
  name: "QA staging",
  createdAt: 1,
  updatedAt: 1,
  ...overrides,
});

describe("Profile (007, data-model, FR-019)", () => {
  it("acepta un perfil válido y recorta el nombre", () => {
    expect(ProfileSchema.parse(profile({ name: "  Bug 1234 " })).name).toBe("Bug 1234");
  });

  it("rechaza nombre vacío o de más de 60, sitio que no es origen e id que no es uuid", () => {
    expect(ProfileSchema.safeParse(profile({ name: "   " })).error?.issues[0]?.message).toBe(
      "profile_error_required",
    );
    expect(
      ProfileSchema.safeParse(profile({ name: "x".repeat(61) })).error?.issues[0]?.message,
    ).toBe("profile_error_too_long");
    expect(ProfileSchema.safeParse(profile({ site: "http://a.test/ruta" })).success).toBe(false);
    expect(ProfileSchema.safeParse(profile({ id: "x" })).success).toBe(false);
    expect(ProfileSchema.safeParse({ ...profile(), extra: 1 }).success).toBe(false);
  });

  it("ProfilesState: versión 1, perfiles y último activo por sitio", () => {
    const state = { version: 1, profiles: [profile()], lastActive: { [SITE]: ID } };
    expect(ProfilesStateSchema.parse(state)).toEqual(state);
    expect(ProfilesStateSchema.safeParse({ ...state, version: 2 }).success).toBe(false);
    expect(ProfilesStateSchema.safeParse({ ...state, lastActive: { [SITE]: "x" } }).success).toBe(
      false,
    );
  });

  it("uniqueProfileName compara sin mayúsculas, solo dentro del sitio y excluye al propio perfil", () => {
    const list = [profile(), profile({ id: ID2, site: "http://otro.test", name: "Bug" })];
    expect(uniqueProfileName(list, SITE, "qa STAGING")).toBe(false);
    expect(uniqueProfileName(list, SITE, "Bug")).toBe(true);
    expect(uniqueProfileName(list, SITE, "QA staging", ID)).toBe(true);
  });
});
