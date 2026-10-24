/**
 * Inventario único de atajos del panel (004, research R12, FR-030). `use-shortcuts.ts`, los
 * `aria-keyshortcuts`, Ajustes ⇒ Atajos y la Ayuda leen de aquí; una prueba unitaria comprueba
 * que no hay combinaciones repetidas ni reservadas por DevTools.
 */
export type ShortcutKeys =
  | { code: string; alt?: boolean; shift?: boolean; ctrl?: boolean; meta?: boolean }
  /** Tecla simple sin modificadores, por `key` (p. ej. `/`). */
  | { key: string };

export type ShortcutId =
  | "toggleAttach"
  | "continueSelected"
  | "continueAll"
  | "togglePauseNahual"
  | "endRelaxations"
  | "focusSearch"
  | "focusSearchSlash"
  | "moveRuleUp"
  | "moveRuleDown";

export interface Shortcut {
  id: ShortcutId;
  keys: ShortcutKeys;
  descriptionKey: string;
  /** `global` se ignora mientras se escribe en un campo; `rules`, sobre una regla enfocada. */
  scope: "global" | "list" | "rules";
}

export const SHORTCUTS: readonly Shortcut[] = [
  {
    id: "toggleAttach",
    keys: { code: "KeyA", alt: true, shift: true },
    descriptionKey: "shortcut_desc_toggle_attach",
    scope: "global",
  },
  {
    id: "continueSelected",
    keys: { code: "KeyC", alt: true, shift: true },
    descriptionKey: "shortcut_desc_continue",
    scope: "global",
  },
  {
    id: "continueAll",
    keys: { code: "KeyK", alt: true, shift: true },
    descriptionKey: "shortcut_desc_continue_all",
    scope: "global",
  },
  {
    id: "togglePauseNahual",
    keys: { code: "KeyP", alt: true, shift: true },
    descriptionKey: "shortcut_desc_pause_nahual",
    scope: "global",
  },
  {
    id: "endRelaxations",
    keys: { code: "KeyR", alt: true, shift: true },
    descriptionKey: "shortcut_desc_end_relaxations",
    scope: "global",
  },
  {
    id: "focusSearch",
    keys: { code: "KeyF", alt: true, shift: true },
    descriptionKey: "shortcut_desc_focus_search",
    scope: "global",
  },
  {
    id: "focusSearchSlash",
    keys: { key: "/" },
    descriptionKey: "shortcut_desc_focus_search",
    scope: "global",
  },
  {
    id: "moveRuleUp",
    keys: { code: "ArrowUp", alt: true },
    descriptionKey: "shortcut_desc_move_rule_up",
    scope: "rules",
  },
  {
    id: "moveRuleDown",
    keys: { code: "ArrowDown", alt: true },
    descriptionKey: "shortcut_desc_move_rule_down",
    scope: "rules",
  },
];

/** Atajos de DevTools que Nahual no puede usar (Ctrl y Cmd se tratan igual). */
export const DEVTOOLS_RESERVED: readonly ShortcutKeys[] = [
  { code: "KeyC", ctrl: true, shift: true },
  { code: "KeyP", ctrl: true, shift: true },
  { code: "KeyP", ctrl: true },
  { code: "BracketLeft", ctrl: true },
  { code: "BracketRight", ctrl: true },
  { code: "KeyF", ctrl: true },
  { code: "F8" },
  { code: "F10" },
  { code: "F11" },
];

const KEY_NAMES: Record<string, string> = { ArrowUp: "↑", ArrowDown: "↓" };
const ARIA_NAMES: Record<string, string> = { ArrowUp: "ArrowUp", ArrowDown: "ArrowDown" };

const keyName = (code: string, names: Record<string, string>) =>
  names[code] ?? code.replace(/^Key|^Digit/, "");

function parts(keys: ShortcutKeys, names: Record<string, string>): string {
  if ("key" in keys) return keys.key;
  return [
    keys.ctrl ? "Ctrl" : "",
    keys.meta ? "Meta" : "",
    keys.alt ? "Alt" : "",
    keys.shift ? "Shift" : "",
    keyName(keys.code, names),
  ]
    .filter(Boolean)
    .join("+");
}

/** Texto visible del atajo, p. ej. "Alt+Shift+A" o "Alt+↑". */
export const shortcutLabel = (shortcut: Shortcut) => parts(shortcut.keys, KEY_NAMES);

/** Valor para `aria-keyshortcuts`, p. ej. "Alt+Shift+A" o "Alt+ArrowUp". */
export const shortcutAria = (shortcut: Shortcut) => parts(shortcut.keys, ARIA_NAMES);

export function shortcutById(id: ShortcutId): Shortcut {
  const shortcut = SHORTCUTS.find((s) => s.id === id);
  if (!shortcut) throw new Error(`atajo desconocido: ${id}`);
  return shortcut;
}

/** Texto visible de un atajo por id. */
export const labelOf = (id: ShortcutId) => shortcutLabel(shortcutById(id));

/** Valor de `aria-keyshortcuts` de un atajo por id. */
export const ariaOf = (id: ShortcutId) => shortcutAria(shortcutById(id));

export interface KeyLike {
  code: string;
  key: string;
  altKey: boolean;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
}

/**
 * ¿El evento es este atajo? Se compara `code` y no `key`: con Alt+Shift, `key` cambia según la
 * distribución del teclado. Las teclas simples (`/`) se comparan por `key` y sin Alt, Ctrl ni Cmd.
 */
export function matchesShortcut(shortcut: Shortcut, event: KeyLike): boolean {
  const { keys } = shortcut;
  if ("key" in keys)
    return event.key === keys.key && !event.altKey && !event.ctrlKey && !event.metaKey;
  return (
    event.code === keys.code &&
    event.altKey === Boolean(keys.alt) &&
    event.shiftKey === Boolean(keys.shift) &&
    event.ctrlKey === Boolean(keys.ctrl) &&
    event.metaKey === Boolean(keys.meta)
  );
}
