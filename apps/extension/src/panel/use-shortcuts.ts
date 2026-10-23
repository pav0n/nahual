import { useEffect, useRef } from "react";

export const SHORTCUT_TOGGLE_ATTACH = "Alt+Shift+A";
export const SHORTCUT_CONTINUE = "Alt+Shift+C";
export const SHORTCUT_CONTINUE_ALL = "Alt+Shift+K";
export const SHORTCUT_PAUSE_NAHUAL = "Alt+Shift+P";

const isEditable = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

/**
 * Atajos del panel (principio III). Se ignoran mientras se escribe en un campo de texto.
 * Se compara `code` y no `key`: con Alt+Shift, `key` cambia según la distribución del teclado.
 */
export function useShortcuts(handlers: {
  toggleAttach(): void;
  continueSelected(): void;
  continueAll(): void;
  togglePauseNahual(): void;
  focusSearch(): void;
}) {
  const ref = useRef(handlers);
  useEffect(() => {
    ref.current = handlers;
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // `/` va al buscador, salvo mientras se escribe (research R16).
      if (event.key === "/" && !event.altKey && !event.ctrlKey && !event.metaKey) {
        if (isEditable(event.target)) return;
        event.preventDefault();
        ref.current.focusSearch();
        return;
      }
      if (!event.altKey || !event.shiftKey || event.ctrlKey || event.metaKey) return;
      if (isEditable(event.target)) return;
      if (event.code === "KeyA") {
        event.preventDefault();
        ref.current.toggleAttach();
      } else if (event.code === "KeyC") {
        event.preventDefault();
        ref.current.continueSelected();
      } else if (event.code === "KeyP") {
        event.preventDefault();
        ref.current.togglePauseNahual();
      } else if (event.code === "KeyK") {
        event.preventDefault();
        ref.current.continueAll();
      } else if (event.code === "KeyF") {
        event.preventDefault();
        ref.current.focusSearch();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
