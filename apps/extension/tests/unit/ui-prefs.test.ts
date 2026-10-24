import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_UI_PREFS,
  UI_PREFS_KEY,
  createUiPrefsWriter,
  readUiPrefs,
  writeUiPrefs,
} from "../../src/panel/ui-prefs.ts";

/** `localStorage` en memoria (el entorno de Vitest es "node"). */
function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

const throwing = {
  getItem: () => {
    throw new Error("SecurityError");
  },
  setItem: () => {
    throw new Error("SecurityError");
  },
};

const stored = (value: unknown) => memoryStorage({ [UI_PREFS_KEY]: JSON.stringify(value) });

describe("preferencias de interfaz (004, contracts/storage.md, FR-034)", () => {
  it("defaults: split.traffic 0.5, split.rules 0.34, split.paused 0.34, drawerHeight 180", () => {
    expect(DEFAULT_UI_PREFS).toEqual({
      version: 1,
      split: { traffic: 0.5, rules: 0.34, paused: 0.34 },
      drawerHeight: 180,
    });
  });

  it("lee un JSON válido", () => {
    const prefs = {
      version: 1,
      split: { traffic: 0.6, rules: 0.3, paused: 0.4 },
      drawerHeight: 300,
    };
    expect(readUiPrefs(stored(prefs))).toEqual(prefs);
  });

  it("ausente ⇒ defaults", () => {
    expect(readUiPrefs(memoryStorage())).toEqual(DEFAULT_UI_PREFS);
  });

  it("JSON inválido ⇒ defaults", () => {
    expect(readUiPrefs(memoryStorage({ [UI_PREFS_KEY]: "{no es json" }))).toEqual(DEFAULT_UI_PREFS);
  });

  it("versión distinta de 1 ⇒ defaults", () => {
    const prefs = {
      version: 2,
      split: { traffic: 0.6, rules: 0.3, paused: 0.4 },
      drawerHeight: 300,
    };
    expect(readUiPrefs(stored(prefs))).toEqual(DEFAULT_UI_PREFS);
  });

  it('"número 0.2–0.8" fuera de rango ⇒ default de ese campo, el resto se conserva', () => {
    const prefs = {
      version: 1,
      split: { traffic: 0.9, rules: 0.1, paused: 0.4 },
      drawerHeight: 300,
    };
    expect(readUiPrefs(stored(prefs))).toEqual({
      version: 1,
      split: { traffic: 0.5, rules: 0.34, paused: 0.4 },
      drawerHeight: 300,
    });
  });

  it('"entero 120–600" fuera de rango o no entero ⇒ default de ese campo', () => {
    for (const drawerHeight of [100, 700, 150.5, "200"]) {
      const prefs = { version: 1, split: { traffic: 0.6, rules: 0.3, paused: 0.4 }, drawerHeight };
      expect(readUiPrefs(stored(prefs)).drawerHeight).toBe(180);
    }
  });

  it("`localStorage` que lanza ⇒ defaults sin error", () => {
    expect(readUiPrefs(throwing)).toEqual(DEFAULT_UI_PREFS);
    expect(() => writeUiPrefs(DEFAULT_UI_PREFS, throwing)).not.toThrow();
  });

  it("escribe solo los campos de UiPrefs", () => {
    const storage = memoryStorage();
    const extra = {
      ...DEFAULT_UI_PREFS,
      url: "https://api.test/secret",
    } as typeof DEFAULT_UI_PREFS;
    writeUiPrefs(extra, storage);
    expect(JSON.parse(storage.data.get(UI_PREFS_KEY) ?? "{}")).toEqual(DEFAULT_UI_PREFS);
  });

  describe("escritura con debounce de 250 ms", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("agrupa los cambios del arrastre en una escritura", () => {
      const storage = memoryStorage();
      const setItem = vi.spyOn(storage, "setItem");
      const writer = createUiPrefsWriter(storage);
      writer.update({ split: { ...DEFAULT_UI_PREFS.split, traffic: 0.55 } });
      vi.advanceTimersByTime(100);
      writer.update({ split: { ...DEFAULT_UI_PREFS.split, traffic: 0.6 } });
      vi.advanceTimersByTime(249);
      expect(setItem).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(setItem).toHaveBeenCalledTimes(1);
      expect(readUiPrefs(storage).split.traffic).toBe(0.6);
      expect(writer.get().split.traffic).toBe(0.6);
    });
  });
});
