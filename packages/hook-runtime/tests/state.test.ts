import { LIMITS } from "@nahual/domain";
import { describe, expect, it } from "vitest";
import { createHookState } from "../src/state.ts";

describe("createHookState (R7, FR-008, FR-009)", () => {
  it("guarda si la versión coincide y la incrementa", () => {
    const state = createHookState();
    const snap = state.snapshot();
    expect(snap).toEqual({ value: {}, version: 0 });
    expect(state.commit(0, { n: 1 })).toBe("saved");
    expect(state.snapshot()).toEqual({ value: { n: 1 }, version: 1 });
    expect(state.commit(0, { n: 2 })).toBe("conflict");
  });

  it("devuelve copias: cambiar lo leído no cambia lo guardado", () => {
    const state = createHookState();
    state.commit(0, { list: [1] });
    const snap = state.snapshot();
    (snap.value.list as number[]).push(2);
    expect(state.snapshot().value).toEqual({ list: [1] });
  });

  it("rechaza más de 1 MB de JSON", () => {
    const state = createHookState();
    expect(state.commit(0, { big: "x".repeat(LIMITS.hookStateBytesMax) })).toBe("too_large");
    expect(state.snapshot().version).toBe(0);
  });

  it("vaciar devuelve la copia anterior y restore la recupera (Deshacer)", () => {
    const state = createHookState();
    state.commit(0, { n: 5 });
    const previous = state.clear();
    expect(state.snapshot().value).toEqual({});
    state.restore(previous);
    expect(state.snapshot().value).toEqual({ n: 5 });
  });

  it("20 ejecuciones simultáneas con hasta 3 intentos cada una dejan el contador en 20 (SC-012)", async () => {
    const state = createHookState();
    // Primeros intentos en paralelo; los que chocan se repiten de uno en uno (R7).
    const attempt = () => {
      const { value, version } = state.snapshot();
      return { version, value: { n: ((value.n as number) ?? 0) + 1 } };
    };
    const first = Array.from({ length: 20 }, attempt);
    const retries = first.filter((a) => state.commit(a.version, a.value) === "conflict");
    for (let r = 0; r < retries.length; r++) {
      let saved = false;
      for (let i = 1; i < LIMITS.hookStateAttempts && !saved; i++) {
        const next = attempt();
        saved = state.commit(next.version, next.value) === "saved";
      }
      expect(saved).toBe(true);
    }
    expect(state.snapshot().value).toEqual({ n: 20 });
  });
});
