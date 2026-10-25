/** Máscara visible en el panel y en los registros. */
export const MASK = "••••••";

const EXACT = new Set(["authorization", "proxy-authorization", "cookie", "set-cookie"]);
const PARTS = ["token", "secret", "session", "api-key", "apikey"];

/** Headers cuyo valor se enmascara por defecto (FR-004a) y nunca se registra (FR-036). */
export function isSensitiveHeader(name: string): boolean {
  const lower = name.toLowerCase();
  return EXACT.has(lower) || PARTS.some((part) => lower.includes(part));
}

/**
 * Nombres de campo JSON y de parámetro de query cuyo valor se redacta en el diff (005, FR-030):
 * el criterio de los headers más `password`; `_` cuenta como `-` (`api_key`).
 */
export function isSensitiveName(name: string): boolean {
  const normalized = name.toLowerCase().replaceAll("_", "-");
  return isSensitiveHeader(normalized) || normalized.includes("password");
}

type HeaderList = { name: string; value: string }[];

/** Copia con los valores sensibles reemplazados por la máscara. */
export function redactHeaders<T extends HeaderList | Record<string, string>>(headers: T): T {
  if (Array.isArray(headers)) {
    return headers.map((h) => (isSensitiveHeader(h.name) ? { ...h, value: MASK } : h)) as T;
  }
  return Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [name, isSensitiveHeader(name) ? MASK : value]),
  ) as T;
}
