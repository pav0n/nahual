import type { Prefilter } from "../schemas/rule.ts";
import { globToRegExp } from "./glob.ts";
import { bounded, cachedRegex } from "./text.ts";

const globCache = new Map<string, RegExp>();

/** Prefiltro de URL exacto (el patrón de Fetch puede ser más amplio: research R3). */
export function matchPrefilter(prefilter: Prefilter, url: string): boolean {
  if (prefilter.kind === "regex") return cachedRegex(prefilter.pattern).test(bounded(url));
  let regex = globCache.get(prefilter.pattern);
  if (!regex) {
    regex = globToRegExp(prefilter.pattern);
    if (globCache.size > 500) globCache.clear();
    globCache.set(prefilter.pattern, regex);
  }
  return regex.test(url);
}
