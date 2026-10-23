import type { SessionStorageLike } from "./session-registry.ts";

/** Cambio de una clave, como lo entrega `chrome.storage.onChanged`. */
export interface StorageChange {
  oldValue?: unknown;
  newValue?: unknown;
}

/**
 * Lo mínimo de `chrome.storage.local` que usan los stores (principio V). Las pruebas usan
 * `tests/fakes/fake-storage.ts`.
 */
export interface LocalStorageLike extends SessionStorageLike {
  /** Devuelve una función para dejar de escuchar. */
  onChanged(listener: (changes: Record<string, StorageChange>) => void): () => void;
}

/** Error de escritura por cuota llena (`QUOTA_BYTES`). */
export function isQuotaError(error: unknown): boolean {
  return error instanceof Error && /quota/i.test(error.message);
}

export function createChromeLocalStorage(): LocalStorageLike {
  const area = chrome.storage.local;
  return {
    get: (key) => area.get(key),
    set: (items) => area.set(items),
    onChanged(listener) {
      const wrapped = (changes: Record<string, chrome.storage.StorageChange>) => listener(changes);
      area.onChanged.addListener(wrapped);
      return () => area.onChanged.removeListener(wrapped);
    },
  };
}
