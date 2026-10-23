import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createPauseQueue,
  type PauseQueue,
  type QueueEntry,
} from "../../src/background/pause-queue.ts";

interface Item extends QueueEntry {
  label: string;
}

let queue: PauseQueue<Item>;
let expired: { tabId: number; item: Item }[];

const item = (pausedId: string, label = pausedId): Item => ({
  pausedId,
  label,
  pausedAt: 0,
  expiresAt: 0,
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000);
  expired = [];
  queue = createPauseQueue<Item>({
    onExpire: (tabId, entry) => void expired.push({ tabId, item: entry }),
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("PauseQueue (research R8, FR-022, FR-023)", () => {
  it("orden de llegada y vencimiento con el timeout vigente al pausar", () => {
    queue.add(1, item("a"), 60_000);
    vi.setSystemTime(2_000);
    queue.add(1, item("b"), 5_000);
    expect(queue.list(1).map((i) => [i.pausedId, i.pausedAt, i.expiresAt])).toEqual([
      ["a", 1_000, 61_000],
      ["b", 2_000, 7_000],
    ]);
  });

  it("al vencer se saca de la cola y se avisa una sola vez", () => {
    queue.add(1, item("a"), 5_000);
    vi.advanceTimersByTime(4_999);
    expect(expired).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(expired.map((e) => e.item.pausedId)).toEqual(["a"]);
    expect(queue.size(1)).toBe(0);
  });

  it("resolución idempotente: lo primero gana y cancela el temporizador", () => {
    queue.add(1, item("a"), 5_000);
    expect(queue.take(1, "a")?.pausedId).toBe("a");
    expect(queue.take(1, "a")).toBeUndefined();
    vi.advanceTimersByTime(10_000);
    expect(expired).toEqual([]);
  });

  it("se resuelven en cualquier orden sin afectar a los demás", () => {
    for (const id of ["a", "b", "c"]) queue.add(1, item(id), 60_000);
    queue.take(1, "b");
    expect(queue.list(1).map((i) => i.pausedId)).toEqual(["a", "c"]);
    expect(queue.list(1).every((i) => i.expiresAt === 61_000)).toBe(true);
  });

  it("≤ 100 por pestaña: el 101 se rechaza", () => {
    for (let i = 0; i < 100; i++) expect(queue.add(1, item(`p${i}`), 60_000)).toBe(true);
    expect(queue.add(1, item("p100"), 60_000)).toBe(false);
    expect(queue.add(2, item("otra-pestaña"), 60_000)).toBe(true);
  });

  it("takeWhere (navegación) y takeAll (detach) vacían sin disparar vencimientos", () => {
    queue.add(1, item("viejo"), 60_000);
    vi.setSystemTime(5_000);
    queue.add(1, item("nuevo"), 60_000);
    expect(queue.takeWhere(1, (i) => i.pausedAt < 3_000).map((i) => i.pausedId)).toEqual(["viejo"]);
    expect(queue.takeAll(1).map((i) => i.pausedId)).toEqual(["nuevo"]);
    vi.advanceTimersByTime(120_000);
    expect(expired).toEqual([]);
    expect(queue.size(1)).toBe(0);
  });

  it("get no saca el item", () => {
    queue.add(1, item("a"), 60_000);
    expect(queue.get(1, "a")?.label).toBe("a");
    expect(queue.size(1)).toBe(1);
  });
});
