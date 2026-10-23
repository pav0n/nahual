import type { LocalStorageLike, StorageChange } from "../../src/background/storage-port.ts";

/** `chrome.storage.session` o `chrome.storage.local` en memoria. */
export class FakeStorage implements LocalStorageLike {
  readonly data = new Map<string, unknown>();
  private listeners = new Set<(changes: Record<string, StorageChange>) => void>();
  private quotaFull = false;

  /** Hace fallar las escrituras como cuando se llena `QUOTA_BYTES`. */
  failWritesWithQuota(full = true) {
    this.quotaFull = full;
  }

  async get(key: string) {
    return this.data.has(key) ? { [key]: structuredClone(this.data.get(key)) } : {};
  }

  async set(items: Record<string, unknown>) {
    if (this.quotaFull) throw new Error("QUOTA_BYTES quota exceeded");
    const changes: Record<string, StorageChange> = {};
    for (const [k, v] of Object.entries(items)) {
      changes[k] = { oldValue: this.data.get(k), newValue: structuredClone(v) };
      this.data.set(k, structuredClone(v));
    }
    for (const listener of this.listeners) listener(changes);
  }

  /** Simula una escritura externa (otra instancia o manipulación manual del storage). */
  externalWrite(key: string, value: unknown) {
    const oldValue = this.data.get(key);
    this.data.set(key, structuredClone(value));
    for (const listener of this.listeners) listener({ [key]: { oldValue, newValue: value } });
  }

  onChanged(listener: (changes: Record<string, StorageChange>) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
