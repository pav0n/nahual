import { z } from "zod";

// Sin compilación JIT de schemas: Zod la haría con `new Function`, prohibido por la CSP de MV3 y
// por la constitución (sin código evaluado fuera del sandbox).
z.config({ jitless: true });

const MB = 1024 * 1024;

/** Límites de data-model.md y de la constitución (principio VI). */
export const LIMITS = {
  urlMax: 8192,
  headerNameMax: 256,
  headerValueMax: 8192,
  regexMax: 512,
  globMax: 2048,
  ruleNameMax: 80,
  conditionsMax: 20,
  statusListMax: 50,
  jsonPathMax: 1024,
  jsonValueMax: 65_536,
  graphqlNameMax: 256,
  mockHeadersMax: 100,
  editHeadersMax: 100,
  savedMockBodyBytes: MB,
  bodyBytes: 5 * MB,
  delayMsMax: 60_000,
  rulesMax: 500,
  historyMax: 2000,
  queueMax: 100,
  pauseTimeoutMin: 5,
  pauseTimeoutMax: 300,
  pauseTimeoutDefault: 60,
  /** Texto evaluado por una regex o comparación (research R19). */
  evalTextMax: 8192,
  // CORS de desarrollo (003, data-model).
  originMax: 256,
  relaxationsPerTab: 10,
  productionOriginsMax: 100,
  exposeHeadersMax: 30,
  requestedHeadersMax: 50,
  corsHeaderNameMax: 128,
  redirectingPreflightsMax: 50,
  reportEndpointsMax: 50,
  // Repeater y diff (005, data-model).
  repeaterTabsMax: 20,
  repeaterSendsMax: 50,
  repeaterTabNameMax: 60,
  repeaterHeadersMax: 100,
  ignoreEndpointsMax: 500,
  ignoreEntriesMax: 100,
  diffChangesMax: 50_000,
  /** Myers es O(N·D): con 5,000 ediciones el peor caso queda por debajo de 1 s (research R8). */
  diffLineEditsMax: 5_000,
  // Hooks (006, data-model).
  hookSourceBytesMax: 102_400,
  hookTotalBytesMax: 5 * MB,
  hookTimeoutMs: 2_000,
  hookStateBytesMax: MB,
  /** Intentos en total de una ejecución que choca con otra al guardar `state` (FR-009). */
  hookStateAttempts: 3,
  hookSuspendAfterErrors: 5,
  hookConsoleEntriesMax: 1_000,
  hookLogEntryChars: 10_240,
  hookWorkerIdleMs: 60_000,
  // Exportar, perfiles e importar (007, data-model).
  exportBatchMax: 50,
  /** Body más grande que se incrusta en el código exportado; por encima, se omite (R2). */
  exportInlineBodyBytes: MB,
  zodDepthMax: 10,
  profilesPerSiteMax: 50,
  profileNameMax: 60,
  profilesPerRuleMax: 20,
  importFileBytesMax: 10 * MB,
  importUndoMs: 10_000,
} as const;

/** Token HTTP (RFC 9110, sección 5.6.2). */
export const HTTP_TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

export const utf8Bytes = (text: string) => new TextEncoder().encode(text).length;

/** Las claves `rule_error_*` son claves de `_locales`: el panel las muestra junto al campo. */
export const isCompilableRegex = (pattern: string) => {
  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
};

export const RegexSchema = z
  .string()
  .min(1, { error: "rule_error_required" })
  .max(LIMITS.regexMax, { error: "rule_error_regex_too_long" })
  .refine(isCompilableRegex, { error: "rule_error_regex_invalid" });
