/** Parámetro solo del build de pruebas para abrir el panel fuera de DevTools (research D7). */
const TEST_TAB_PARAM = "__nahualTestTabId";

/**
 * Pestaña que inspecciona el panel. En producción viene siempre de DevTools; la rama de pruebas
 * se elimina del build de producción porque `import.meta.env.MODE` se reemplaza al compilar.
 */
export function resolveTabId(): number | null {
  if (import.meta.env.MODE === "test") {
    const raw = new URLSearchParams(location.search).get(TEST_TAB_PARAM);
    if (raw !== null && /^\d+$/.test(raw)) return Number(raw);
  }
  return chrome.devtools?.inspectedWindow?.tabId ?? null;
}
