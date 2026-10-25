/**
 * Texto que identifica un endpoint para su lista de ignorados (005, research R10): método y URL
 * sin query ni fragmento. El SW guarda solo su SHA-256, nunca este texto.
 */
export function endpointKeyInput(method: string, url: string): string {
  let base: string;
  try {
    const parsed = new URL(url);
    base = `${parsed.origin}${parsed.pathname}`;
  } catch {
    base = url.split(/[?#]/, 1)[0] ?? url;
  }
  return `${method.toUpperCase()} ${base}`;
}
