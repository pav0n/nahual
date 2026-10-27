import type { Profile } from "@nahual/domain";
import { beforeEach, describe, expect, it } from "vitest";
import {
  activeProfileName,
  profilesOfSite,
  rulesThatApply,
} from "../../src/panel/profiles/select.ts";
import { dispatchSwEvent } from "../../src/panel/store/dispatch.ts";
import { usePanelStore } from "../../src/panel/store/index.ts";
import { SITE, rule } from "../fakes/rules.ts";

// 007 T045: perfiles en el store del panel (FR-020, FR-024).

const P = "0b8f8a52-4a0c-4d0e-9f3a-6c1d2e3f4a5b";
const profile = (overrides: Partial<Profile> = {}): Profile => ({
  id: P,
  site: SITE,
  name: "QA staging",
  createdAt: 1,
  updatedAt: 1,
  ...overrides,
});
const event = <T extends string>(type: T, payload: unknown) =>
  ({ v: 6, id: crypto.randomUUID(), type, payload }) as never;

beforeEach(() => {
  usePanelStore.setState({ profiles: [], lastActive: {}, rules: [], session: null });
});

describe("perfiles en el panel", () => {
  it("el evento profiles llena el store", () => {
    dispatchSwEvent(event("profiles", { profiles: [profile()], lastActive: { [SITE]: P } }));
    expect(usePanelStore.getState().profiles).toEqual([profile()]);
    expect(usePanelStore.getState().lastActive).toEqual({ [SITE]: P });
  });

  it("perfiles del sitio, ordenados por nombre", () => {
    const list = [
      profile({ id: "b", name: "Zeta" }),
      profile({ id: "a", name: "alfa" }),
      profile({ id: "c", site: "https://otro.test", name: "Otro" }),
    ];
    expect(profilesOfSite(list, SITE).map((p) => p.name)).toEqual(["alfa", "Zeta"]);
    expect(profilesOfSite(list, null)).toEqual([]);
  });

  it("reglas que actúan: activas, del sitio y del perfil activo si hay uno", () => {
    const rules = [
      rule({ id: "1", profileIds: [P] }),
      rule({ id: "2" }),
      rule({ id: "3", enabled: false, profileIds: [P] }),
      rule({ id: "4", site: "https://otro.test" }),
    ];
    expect(rulesThatApply(rules, SITE, null).map((r) => r.id)).toEqual(["1", "2"]);
    expect(rulesThatApply(rules, SITE, P).map((r) => r.id)).toEqual(["1"]);
  });

  it("nombre del perfil activo, o null si no hay o ya no existe", () => {
    expect(activeProfileName([profile()], P)).toBe("QA staging");
    expect(activeProfileName([profile()], null)).toBeNull();
    expect(activeProfileName([], P)).toBeNull();
  });
});

describe("aviso de perfil activo eliminado (T050, FR-004)", () => {
  it("llega a la franja de indicadores como un aviso que se puede cerrar", async () => {
    const { stripItems } = await import("../../src/panel/shell/strip.ts");
    usePanelStore.setState({ notices: [] });
    dispatchSwEvent(event("notice", { messageKey: "notice_profile_deleted_active" }));
    const { notices } = usePanelStore.getState();
    expect(notices.map((n) => n.messageKey)).toEqual(["notice_profile_deleted_active"]);
    expect(
      stripItems({ globalPaused: false, relaxationCount: 0, notices, lastError: null }),
    ).toEqual([
      {
        kind: "notice",
        notice: expect.objectContaining({ messageKey: "notice_profile_deleted_active" }),
      },
    ]);
  });
});
