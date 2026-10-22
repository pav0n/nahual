/**
 * Tema del panel según DevTools (`themeName` es "dark" o "default"). Fuera de DevTools (build de
 * pruebas) se usa la preferencia del sistema.
 */
export function applyTheme(): void {
  const themeName = chrome.devtools?.panels?.themeName;
  const dark =
    themeName === undefined
      ? matchMedia("(prefers-color-scheme: dark)").matches
      : themeName === "dark";
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}
