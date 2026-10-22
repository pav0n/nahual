import type { SessionStorageLike } from "../../src/background/session-registry.ts";

/** `chrome.storage.session` en memoria. */
export class FakeStorage implements SessionStorageLike {
  readonly data = new Map<string, unknown>();

  async get(key: string) {
    return this.data.has(key) ? { [key]: structuredClone(this.data.get(key)) } : {};
  }

  async set(items: Record<string, unknown>) {
    for (const [k, v] of Object.entries(items)) this.data.set(k, structuredClone(v));
  }
}
