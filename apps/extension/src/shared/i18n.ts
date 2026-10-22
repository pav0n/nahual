/** Traduce una clave de `_locales`. Si falta, devuelve la clave (visible en la UI) y avisa. */
export function t(key: string, substitutions?: string | string[]): string {
  const message = chrome.i18n.getMessage(key, substitutions);
  if (message === "") {
    console.warn(`[nahual] Falta la clave i18n "${key}"`);
    return key;
  }
  return message;
}
