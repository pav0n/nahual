import { exportSourceFromExchange, type ExportSource } from "../../src/export/source.ts";
import { redactExportSource } from "../../src/sensitive.ts";
import type { ExportFixture } from "../fixtures-export.ts";

export const OPTIONS = { appVersion: "1.0.0" };

export const sourceOf = (f: ExportFixture): ExportSource =>
  exportSourceFromExchange(f.exchange, f.requestBody, f.responseBody);

/** Fuente redactada con el marcador por defecto, como la prepara `exportAs`. */
export const redacted = (f: ExportFixture) => redactExportSource(sourceOf(f));

/** Valores sensibles de los fixtures: ninguno debe aparecer en una salida redactada (SC-004). */
export const SECRETS = [
  "secret-export-token",
  "secret-export-cookie",
  "secret-cookie-value",
  "secret-api-key",
  "secret-query-token",
  "secret-body-password",
  "secret-form",
];

export const leaked = (code: string) => SECRETS.filter((s) => code.includes(s));

/** Elemento `i` de una lista; falla la prueba si no existe (sin aserciones `!`). */
export function nth<T>(list: readonly T[], i: number): T {
  const item = list[i];
  if (item === undefined) throw new Error(`sin elemento ${i}`);
  return item;
}
