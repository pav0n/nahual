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
