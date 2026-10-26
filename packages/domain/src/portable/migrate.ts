/** Versión actual del formato portable (contracts/portable-config.md). */
export const CONFIG_VERSION = 1;

export type Migration = (raw: Record<string, unknown>) => Record<string, unknown>;

/**
 * Migraciones de versión `n` a `n + 1` (FR-033). Vacío en v1; cada versión nueva añade la suya con
 * su prueba. Una versión sin camino hasta la actual se rechaza.
 */
export const MIGRATIONS: Readonly<Record<number, Migration>> = {};

export type MigrateResult =
  | { ok: true; value: Record<string, unknown>; migratedFrom: number | null }
  | { ok: false; errorKey: "config_error_newer_version" | "config_error_invalid"; path: string };

/** Lleva un archivo (ya JSON, `nahual: "config"`) a la versión actual, o dice por qué no puede. */
export function migrateConfig(
  raw: Record<string, unknown>,
  migrations: Readonly<Record<number, Migration>> = MIGRATIONS,
  current = CONFIG_VERSION,
): MigrateResult {
  const version = raw.version;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1)
    return { ok: false, errorKey: "config_error_invalid", path: "version" };
  if (version > current)
    return { ok: false, errorKey: "config_error_newer_version", path: "version" };
  let value = raw;
  for (let v = version; v < current; v++) {
    const step = migrations[v];
    if (!step) return { ok: false, errorKey: "config_error_invalid", path: "version" };
    value = step(value);
  }
  return { ok: true, value, migratedFrom: version === current ? null : version };
}
