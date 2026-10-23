import { LIMITS } from "@nahual/domain";

export interface QueueEntry {
  pausedId: string;
  pausedAt: number;
  expiresAt: number;
}

export interface PauseQueue<T extends QueueEntry> {
  /** `false` si la cola de la pestaña está llena (FR-023). */
  add(tabId: number, item: T, timeoutMs: number): boolean;
  get(tabId: number, pausedId: string): T | undefined;
  /** Saca el item: la primera resolución gana (idempotente). */
  take(tabId: number, pausedId: string): T | undefined;
  takeWhere(tabId: number, predicate: (item: T) => boolean): T[];
  takeAll(tabId: number): T[];
  list(tabId: number): T[];
  size(tabId: number): number;
}

/**
 * Cola de pausados por pestaña (research R8): orden de llegada, tope de 100 y un temporizador por
 * item con el timeout vigente al pausar. Al vencer, el item sale de la cola y se avisa una vez.
 */
export function createPauseQueue<T extends QueueEntry>(options: {
  max?: number;
  onExpire(tabId: number, item: T): void;
}): PauseQueue<T> {
  const max = options.max ?? LIMITS.queueMax;
  const tabs = new Map<number, Map<string, { item: T; timer: ReturnType<typeof setTimeout> }>>();

  const tab = (tabId: number) => {
    let entries = tabs.get(tabId);
    if (!entries) {
      entries = new Map();
      tabs.set(tabId, entries);
    }
    return entries;
  };

  const take = (tabId: number, pausedId: string) => {
    const entries = tabs.get(tabId);
    const entry = entries?.get(pausedId);
    if (!entry || !entries) return undefined;
    entries.delete(pausedId);
    clearTimeout(entry.timer);
    return entry.item;
  };

  return {
    add(tabId, item, timeoutMs) {
      const entries = tab(tabId);
      if (entries.size >= max) return false;
      const pausedAt = Date.now();
      item.pausedAt = pausedAt;
      item.expiresAt = pausedAt + timeoutMs;
      const timer = setTimeout(() => {
        const expired = take(tabId, item.pausedId);
        if (expired) options.onExpire(tabId, expired);
      }, timeoutMs);
      entries.set(item.pausedId, { item, timer });
      return true;
    },
    get: (tabId, pausedId) => tabs.get(tabId)?.get(pausedId)?.item,
    take,
    takeWhere(tabId, predicate) {
      const matched = [...(tabs.get(tabId)?.values() ?? [])].filter((e) => predicate(e.item));
      return matched.flatMap((e) => take(tabId, e.item.pausedId) ?? []);
    },
    takeAll(tabId) {
      return this.takeWhere(tabId, () => true);
    },
    list: (tabId) => [...(tabs.get(tabId)?.values() ?? [])].map((e) => e.item),
    size: (tabId) => tabs.get(tabId)?.size ?? 0,
  };
}
