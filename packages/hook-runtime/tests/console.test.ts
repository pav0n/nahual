import { LIMITS } from "@nahual/domain";
import { describe, expect, it } from "vitest";
import { createHookConsole, type ConsoleInput } from "../src/console.ts";

// T045 (FR-026, FR-027, FR-030).

const entry = (overrides: Partial<ConsoleInput> = {}): ConsoleInput => ({
  level: "log",
  text: "hola",
  ruleId: "r1",
  ruleName: "Regla",
  request: { method: "GET", url: "http://api.test/x" },
  exchangeId: "net-1",
  at: 1,
  ...overrides,
});

describe("consola de hooks", () => {
  it("guarda como mucho 1,000 entradas: las más antiguas salen", () => {
    const c = createHookConsole();
    for (let i = 0; i < LIMITS.hookConsoleEntriesMax + 5; i++) c.add(entry({ text: `n${i}` }));
    expect(c.entries()).toHaveLength(LIMITS.hookConsoleEntriesMax);
    expect(c.entries()[0]?.text).toBe("n5");
  });

  it("agrupa errores consecutivos del mismo hook con el mismo mensaje, como Console", () => {
    const c = createHookConsole();
    c.add(entry({ level: "error", text: "boom" }));
    c.add(entry({ level: "error", text: "boom" }));
    c.add(entry({ level: "error", text: "boom", ruleId: "r2" }));
    c.add(entry({ level: "error", text: "boom" }));
    expect(c.entries().map((e) => [e.ruleId, e.count])).toEqual([
      ["r1", 2],
      ["r2", 1],
      ["r1", 1],
    ]);
  });

  it("recorta a 10,240 caracteres", () => {
    const c = createHookConsole();
    c.add(entry({ text: "x".repeat(LIMITS.hookLogEntryChars + 50) }));
    expect(c.entries()[0]?.text).toHaveLength(LIMITS.hookLogEntryChars);
  });

  it("redacta por nombre y guarda aparte el texto real (FR-030)", () => {
    const c = createHookConsole();
    c.add(entry({ text: 'token {"access_token":"abc"}' }));
    const [first] = c.entries();
    expect(first?.text).toBe('token {"access_token":"••••••"}');
    expect(first?.revealed).toBe('token {"access_token":"abc"}');
    c.add(entry({ text: "sin secretos" }));
    expect(c.entries()[1]?.revealed).toBeUndefined();
  });

  it("filtra por nivel, regla y texto", () => {
    const c = createHookConsole();
    c.add(entry({ text: "uno" }));
    c.add(entry({ level: "error", text: "dos", ruleId: "r2" }));
    expect(c.filter({ levels: ["error"] }).map((e) => e.text)).toEqual(["dos"]);
    expect(c.filter({ ruleId: "r1" }).map((e) => e.text)).toEqual(["uno"]);
    expect(c.filter({ text: "DO" }).map((e) => e.text)).toEqual(["dos"]);
  });

  it("errores sin leer, marcar leídos, vaciar y deshacer", () => {
    const c = createHookConsole();
    c.add(entry({ level: "error", text: "a" }));
    c.add(entry({ level: "error", text: "a" }));
    c.add(entry({ level: "log", text: "b" }));
    expect(c.unreadErrors()).toBe(2);
    c.markRead();
    expect(c.unreadErrors()).toBe(0);
    const cleared = c.clear();
    expect(c.entries()).toEqual([]);
    c.restore(cleared);
    expect(c.entries()).toHaveLength(2);
  });
});
