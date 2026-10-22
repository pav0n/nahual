/** Lo mínimo de `chrome.storage.session` que usa el registro. */
export interface SessionStorageLike {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

export const REGISTRY_KEY = "nahual.sessions";

export interface SessionRegistry {
  add(tabId: number): Promise<void>;
  remove(tabId: number): Promise<void>;
  list(): Promise<number[]>;
  clear(): Promise<void>;
}

/**
 * Pestañas con debugger adjunto, en `chrome.storage.session` para sobrevivir a un reinicio del
 * service worker y poder limpiar sesiones huérfanas al arrancar. Las operaciones se serializan
 * para que dos cambios simultáneos no se pisen.
 */
export function createSessionRegistry(storage: SessionStorageLike): SessionRegistry {
  let chain: Promise<unknown> = Promise.resolve();
  const serial = <T>(fn: () => Promise<T>): Promise<T> => {
    const next = chain.then(fn, fn);
    chain = next.catch(() => {});
    return next;
  };

  const read = async (): Promise<number[]> => {
    const raw = (await storage.get(REGISTRY_KEY))[REGISTRY_KEY];
    if (!Array.isArray(raw)) return [];
    return [...new Set(raw.filter((v): v is number => Number.isInteger(v) && v >= 0))];
  };
  const write = (tabs: number[]) => storage.set({ [REGISTRY_KEY]: tabs });

  return {
    add: (tabId) =>
      serial(async () => {
        const tabs = await read();
        if (!tabs.includes(tabId)) await write([...tabs, tabId]);
      }),
    remove: (tabId) => serial(async () => write((await read()).filter((t) => t !== tabId))),
    list: () => serial(read),
    clear: () => serial(() => write([])),
  };
}
