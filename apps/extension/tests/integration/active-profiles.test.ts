import { describe, expect, it, vi } from "vitest";
import { createActiveProfiles } from "../../src/background/active-profiles.ts";

// 007 T042 (research R13, FR-020, FR-022): perfil activo por pestaña, en memoria.

const A = "http://a.test";
const B = "http://b.test";
const P = "0b8f8a52-4a0c-4d0e-9f3a-6c1d2e3f4a5b";
const Q = "1c9f8a52-4a0c-4d0e-9f3a-6c1d2e3f4a5b";

function setup(lastActive: Record<string, string> = {}) {
  const remembered = new Map(Object.entries(lastActive));
  const sites: Record<string, string> = { [P]: A, [Q]: A };
  const remember = vi.fn((site: string, id: string | null) => {
    if (id === null) remembered.delete(site);
    else remembered.set(site, id);
  });
  const active = createActiveProfiles({
    lastActive: () => Object.fromEntries(remembered),
    siteOfProfile: (id) => sites[id] ?? null,
    remember,
  });
  return { active, remember, remembered };
}

describe("perfil activo por pestaña", () => {
  it("al conectar, toma el último perfil del sitio; sin recuerdo, todas las reglas", () => {
    const { active } = setup({ [A]: P });
    active.onHello(1, A);
    active.onHello(2, B);
    expect(active.get(1)).toBe(P);
    expect(active.get(2)).toBeNull();
    expect(active.get(3)).toBeNull();
  });

  it("cambiarlo en una pestaña no cambia otra abierta del mismo sitio, pero sí el recuerdo", () => {
    const { active, remember } = setup({ [A]: P });
    active.onHello(1, A);
    active.onHello(2, A);
    expect(active.set(1, A, Q)).toBe(true);
    expect(active.get(1)).toBe(Q);
    expect(active.get(2)).toBe(P);
    expect(remember).toHaveBeenLastCalledWith(A, Q);
  });

  it("rechaza un perfil de otro sitio o desconocido", () => {
    const { active } = setup();
    active.onHello(1, B);
    expect(active.set(1, B, P)).toBe(false);
    expect(active.set(1, B, "00000000-0000-4000-8000-000000000000")).toBe(false);
    expect(active.get(1)).toBeNull();
    expect(active.set(1, B, null)).toBe(true);
  });

  it("al navegar a otro sitio toma el de ese sitio y al volver recupera el que tenía", () => {
    const { active } = setup({ [A]: P });
    active.onHello(1, A);
    active.set(1, A, Q);
    active.onNavigate(1, B);
    expect(active.get(1)).toBeNull();
    active.onNavigate(1, A);
    expect(active.get(1)).toBe(Q);
  });

  it("al borrar un perfil, las pestañas que lo tenían vuelven a todas las reglas", () => {
    const { active } = setup({ [A]: P });
    active.onHello(1, A);
    active.onHello(2, A);
    active.set(2, A, Q);
    expect(active.onProfileDeleted(P)).toEqual([1]);
    expect(active.get(1)).toBeNull();
    expect(active.get(2)).toBe(Q);
  });

  it("al cerrar el panel se olvida la pestaña", () => {
    const { active } = setup({ [A]: P });
    active.onHello(1, A);
    active.forget(1);
    expect(active.get(1)).toBeNull();
  });
});
