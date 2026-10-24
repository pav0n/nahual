import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  DEVTOOLS_RESERVED,
  SHORTCUTS,
  matchesShortcut,
  shortcutAria,
  shortcutLabel,
  type ShortcutKeys,
} from "../../src/panel/shortcuts.ts";

const locales = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../public/_locales");
const messages = (lang: string) =>
  JSON.parse(readFileSync(path.join(locales, lang, "messages.json"), "utf8")) as Record<
    string,
    unknown
  >;

/** Combinación normalizada: Ctrl y Cmd cuentan igual para los choques con DevTools. */
const combo = (keys: ShortcutKeys) =>
  "key" in keys
    ? `key:${keys.key}`
    : [
        keys.ctrl || keys.meta || keys.mod ? "mod" : "",
        keys.alt ? "alt" : "",
        keys.shift ? "shift" : "",
        keys.code,
      ]
        .filter(Boolean)
        .join("+");

describe("inventario de atajos (004, research R12, FR-030)", () => {
  it("contiene los atajos de 001–003", () => {
    expect(SHORTCUTS.map(shortcutLabel).sort()).toEqual(
      [
        "Alt+Shift+A",
        "Alt+Shift+C",
        "Alt+Shift+K",
        "Alt+Shift+P",
        "Alt+Shift+R",
        "Alt+Shift+F",
        "/",
        "Alt+↑",
        "Alt+↓",
        // 005 (research R17): repeater y diff.
        "Ctrl/Cmd+Enter",
        "J",
        "K",
      ].sort(),
    );
  });

  it("no repite combinaciones ni ids", () => {
    const combos = SHORTCUTS.map((s) => combo(s.keys));
    expect(new Set(combos).size).toBe(combos.length);
    const ids = SHORTCUTS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("ninguno es un atajo reservado de DevTools", () => {
    const reserved = new Set(DEVTOOLS_RESERVED.map(combo));
    expect(reserved.size).toBeGreaterThanOrEqual(9);
    for (const shortcut of SHORTCUTS) expect(reserved.has(combo(shortcut.keys))).toBe(false);
  });

  it.each(["es", "en"])("cada descripción existe en el locale %s", (lang) => {
    const keys = messages(lang);
    for (const shortcut of SHORTCUTS) expect(keys).toHaveProperty(shortcut.descriptionKey);
  });

  it("compara por `code` y no por `key` (distribuciones de teclado)", () => {
    const attach = SHORTCUTS.find((s) => s.id === "toggleAttach");
    if (!attach) throw new Error("falta toggleAttach");
    const event = {
      code: "KeyA",
      key: "Å",
      altKey: true,
      shiftKey: true,
      ctrlKey: false,
      metaKey: false,
    };
    expect(matchesShortcut(attach, event)).toBe(true);
    expect(matchesShortcut(attach, { ...event, ctrlKey: true })).toBe(false);
    expect(matchesShortcut(attach, { ...event, shiftKey: false })).toBe(false);
  });

  it("Ctrl/Cmd+Enter acepta Ctrl o Cmd, con aria-keyshortcuts para los dos (005)", () => {
    const send = SHORTCUTS.find((s) => s.id === "repeaterSend");
    if (!send) throw new Error("falta repeaterSend");
    const event = {
      code: "Enter",
      key: "Enter",
      altKey: false,
      shiftKey: false,
      ctrlKey: true,
      metaKey: false,
    };
    expect(matchesShortcut(send, event)).toBe(true);
    expect(matchesShortcut(send, { ...event, ctrlKey: false, metaKey: true })).toBe(true);
    expect(matchesShortcut(send, { ...event, ctrlKey: false })).toBe(false);
    expect(matchesShortcut(send, { ...event, shiftKey: true })).toBe(false);
    expect(shortcutAria(send)).toBe("Control+Enter Meta+Enter");
  });

  it("J y K del diff se reconocen sin modificadores y en mayúscula sin Shift no", () => {
    const next = SHORTCUTS.find((s) => s.id === "nextChange");
    if (!next) throw new Error("falta nextChange");
    const event = {
      code: "KeyJ",
      key: "j",
      altKey: false,
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
    };
    expect(matchesShortcut(next, event)).toBe(true);
    expect(matchesShortcut(next, { ...event, ctrlKey: true })).toBe(false);
    expect(next.scope).toBe("diff");
  });

  it("la barra se reconoce por `key`, sin modificadores", () => {
    const slash = SHORTCUTS.find((s) => s.id === "focusSearchSlash");
    if (!slash) throw new Error("falta focusSearchSlash");
    const event = {
      code: "Digit7",
      key: "/",
      altKey: false,
      shiftKey: true,
      ctrlKey: false,
      metaKey: false,
    };
    expect(matchesShortcut(slash, event)).toBe(true);
    expect(matchesShortcut(slash, { ...event, ctrlKey: true })).toBe(false);
  });
});
