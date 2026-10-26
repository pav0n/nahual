import { useEffect, useRef } from "react";
import { SHORTCUTS, labelOf, matchesShortcut, type ShortcutId } from "./shortcuts.ts";

export const SHORTCUT_TOGGLE_ATTACH = labelOf("toggleAttach");
export const SHORTCUT_CONTINUE = labelOf("continueSelected");
export const SHORTCUT_CONTINUE_ALL = labelOf("continueAll");
export const SHORTCUT_PAUSE_NAHUAL = labelOf("togglePauseNahual");
/** Apaga todas las relajaciones CORS de la pestaña (003, FR-020). */
export const SHORTCUT_END_RELAXATIONS = labelOf("endRelaxations");

const isEditable = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

/** Atajos de ámbito global, con su acción. */
export type GlobalShortcutHandlers = Record<
  Exclude<
    ShortcutId,
    | "focusSearchSlash"
    | "moveRuleUp"
    | "moveRuleDown"
    | "repeaterSend"
    | "nextChange"
    | "prevChange"
    | "saveRule"
  >,
  () => void
>;

const GLOBAL = SHORTCUTS.filter((s) => s.scope === "global");

/**
 * Atajos globales del panel (principio III), desde el inventario de `shortcuts.ts`. Se ignoran
 * mientras se escribe en un campo de texto.
 */
export function useShortcuts(handlers: GlobalShortcutHandlers) {
  const ref = useRef(handlers);
  useEffect(() => {
    ref.current = handlers;
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const shortcut = GLOBAL.find((s) => matchesShortcut(s, event));
      if (!shortcut || isEditable(event.target)) return;
      event.preventDefault();
      // `/` y `Alt+Shift+F` hacen lo mismo: ir al buscador (research R16 de 002).
      const id = shortcut.id === "focusSearchSlash" ? "focusSearch" : shortcut.id;
      if (shortcut.scope !== "global") return;
      ref.current[id as keyof GlobalShortcutHandlers]();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
