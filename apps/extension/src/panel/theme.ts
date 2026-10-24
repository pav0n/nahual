const apply = (dark: boolean) => {
  document.documentElement.dataset.theme = dark ? "dark" : "light";
};

/**
 * Tema del panel según DevTools (`themeName` es "dark" o "default"), también cuando cambia con el
 * panel abierto (004, research R2, FR-004): solo cambia `data-theme`, sin volver a montar React, así
 * que no se pierde la selección ni lo escrito. Fuera de DevTools (build de pruebas) se sigue la
 * preferencia del sistema y su evento `change`.
 */
export function applyTheme(): () => void {
  const panels = chrome.devtools?.panels;
  if (panels?.themeName !== undefined) {
    apply(panels.themeName === "dark");
    panels.setThemeChangeHandler?.((themeName) => apply(themeName === "dark"));
    return () => panels.setThemeChangeHandler?.();
  }
  const query = matchMedia("(prefers-color-scheme: dark)");
  apply(query.matches);
  const onChange = (event: MediaQueryListEvent) => apply(event.matches);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
