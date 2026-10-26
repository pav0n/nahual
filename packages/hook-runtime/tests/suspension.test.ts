import { describe, expect, it } from "vitest";
import { createSuspensions } from "../src/suspension.ts";

// T044 (FR-022, research R9).

describe("suspensión tras 5 errores seguidos", () => {
  it("el quinto error seguido suspende; una ejecución correcta pone la cuenta a cero", () => {
    const s = createSuspensions();
    for (let i = 0; i < 4; i++) expect(s.record("r", true)).toBe(false);
    s.record("r", false);
    for (let i = 0; i < 4; i++) s.record("r", true);
    expect(s.isSuspended("r")).toBe(false);
    expect(s.record("r", true)).toBe(true); // quinto seguido
    expect(s.isSuspended("r")).toBe(true);
    expect(s.suspended()).toEqual(["r"]);
  });

  it("reanudar o cambiar el código la quita y empieza de cero", () => {
    const s = createSuspensions();
    for (let i = 0; i < 5; i++) s.record("a", true);
    for (let i = 0; i < 5; i++) s.record("b", true);
    s.resume("a");
    s.sourceChanged("b");
    expect(s.isSuspended("a")).toBe(false);
    expect(s.isSuspended("b")).toBe(false);
    expect(s.record("a", true)).toBe(false);
  });

  it("cuenta por regla", () => {
    const s = createSuspensions();
    for (let i = 0; i < 5; i++) s.record("a", true);
    expect(s.isSuspended("b")).toBe(false);
  });
});
