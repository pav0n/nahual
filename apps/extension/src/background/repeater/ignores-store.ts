import {
  IgnoreListSchema,
  LIMITS,
  endpointKeyInput,
  type IgnoreList,
  type PathPattern,
} from "@nahual/domain";
import type { LocalStorageLike } from "../storage-port.ts";

export const IGNORES_KEY = "nahual.repeater.ignores.v1";

export interface IgnoreValue {
  paths: PathPattern[];
  headers: string[];
}

export interface IgnoresStore {
  get(method: string, url: string): Promise<IgnoreValue>;
  set(method: string, url: string, value: IgnoreValue): Promise<IgnoreValue>;
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const unique = <T>(items: T[], key: (item: T) => string) => {
  const seen = new Set<string>();
  return items.filter((item) => {
    const k = key(item);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};

/**
 * Rutas y headers ignorados por endpoint (005, FR-029, research R10) en `chrome.storage.local`.
 * La clave es el SHA-256 de `MÉTODO origen+ruta`: la URL nunca se guarda (una ruta puede llevar
 * ids o tokens) y el valor solo tiene rutas y nombres de header. Solo el SW escribe.
 */
export function createIgnoresStore(options: {
  storage: LocalStorageLike;
  onNotice(messageKey: string): void;
  now?(): number;
}): IgnoresStore {
  const now = options.now ?? (() => Date.now());
  let writes = Promise.resolve();
  let warned = false;
  /** Solo el SW escribe esta clave: tras la primera lectura, la copia en memoria es la vigente. */
  let cache: IgnoreList | null = null;

  const read = async (): Promise<IgnoreList> => {
    if (cache) return cache;
    const raw = (await options.storage.get(IGNORES_KEY))[IGNORES_KEY];
    const parsed = raw === undefined ? null : IgnoreListSchema.safeParse(raw);
    if (parsed && !parsed.success && !warned) {
      warned = true;
      options.onNotice("repeater_ignores_invalid");
    }
    cache = parsed?.success ? parsed.data : { version: 1, endpoints: {} };
    return cache;
  };

  const clean = (value: IgnoreValue): IgnoreValue => ({
    paths: unique(value.paths, (p) => JSON.stringify(p)).slice(0, LIMITS.ignoreEntriesMax),
    headers: unique(
      value.headers.map((h) => h.toLowerCase()),
      (h) => h,
    ).slice(0, LIMITS.ignoreEntriesMax),
  });

  return {
    async get(method, url) {
      const key = await sha256(endpointKeyInput(method, url));
      const entry = (await read()).endpoints[key];
      return entry ? { paths: entry.paths, headers: entry.headers } : { paths: [], headers: [] };
    },

    async set(method, url, value) {
      const key = await sha256(endpointKeyInput(method, url));
      const next = clean(value);
      const write = writes.then(async () => {
        const list = await read();
        const empty = next.paths.length === 0 && next.headers.length === 0;
        const endpoints = Object.fromEntries(
          Object.entries(list.endpoints).filter(([k]) => k !== key),
        );
        if (!empty) endpoints[key] = { ...next, usedAt: now() };
        // Tope de endpoints: se descarta el usado hace más tiempo.
        const keys = Object.keys(endpoints).sort(
          (a, b) => (endpoints[a]?.usedAt ?? 0) - (endpoints[b]?.usedAt ?? 0),
        );
        const kept = new Set(keys.slice(Math.max(0, keys.length - LIMITS.ignoreEndpointsMax)));
        const value: IgnoreList = {
          version: 1,
          endpoints: Object.fromEntries(Object.entries(endpoints).filter(([k]) => kept.has(k))),
        };
        await options.storage.set({ [IGNORES_KEY]: value });
        cache = value;
      });
      writes = write.catch(() => undefined);
      await write;
      return next;
    },
  };
}
