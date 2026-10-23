import type { ExchangeUpdate } from "@nahual/domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePanelStore } from "../../src/panel/store/index.ts";

const start = (id: string, seq: number): ExchangeUpdate => ({
  id,
  kind: "start",
  fields: {
    seq,
    method: "GET",
    url: `https://api.test/${id}`,
    urlTruncated: false,
    resourceType: "Fetch",
    isPreflight: false,
    requestHeaders: [],
    responseHeaders: [],
    status: null,
    state: "pending",
    encodedSize: null,
    decodedSize: null,
    startedAt: seq,
    durationMs: null,
    mimeType: null,
    requestBody: { available: false, size: null, reason: "none" },
    responseBody: { available: false, size: null, reason: "pending" },
  },
});

const store = () => usePanelStore.getState();
const ids = () => store().exchanges.map((e) => e.id);

beforeEach(() => {
  vi.useFakeTimers();
  store().resetTraffic();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("historial del panel (FR-005, FR-006)", () => {
  it("aplica un lote: crea entradas y les suma campos", () => {
    store().applyUpdates([
      start("a", 0),
      { id: "a", kind: "response", fields: { status: 200 } },
      { id: "a", kind: "finish", fields: { state: "complete", durationMs: 12 } },
    ]);
    expect(store().exchanges).toHaveLength(1);
    expect(store().exchanges[0]).toMatchObject({
      id: "a",
      status: 200,
      state: "complete",
      durationMs: 12,
    });
  });

  it("los efectos de reglas se acumulan en ruleEffects", () => {
    store().applyUpdates([
      start("a", 0),
      {
        id: "a",
        kind: "effect",
        fields: {},
        effect: {
          stage: "response",
          ruleId: "3f1c2b4a-8d9e-4f60-a1b2-c3d4e5f60718",
          ruleName: "R",
          result: "paused",
        },
      },
    ]);
    expect(store().exchanges[0]?.ruleEffects).toHaveLength(1);
  });

  it("ignora updates de ids desconocidos que no son start", () => {
    store().applyUpdates([{ id: "x", kind: "response", fields: { status: 200 } }]);
    expect(store().exchanges).toEqual([]);
  });

  it("tope de 2,000: descarta el más antiguo y marca atCap", () => {
    store().applyUpdates(Array.from({ length: 2000 }, (_, i) => start(`e${i}`, i)));
    expect(store().atCap).toBe(false);
    store().applyUpdates([start("nuevo", 2000)]);
    expect(store().exchanges).toHaveLength(2000);
    expect(ids()[0]).toBe("e1");
    expect(ids().at(-1)).toBe("nuevo");
    expect(store().atCap).toBe(true);
  });

  it("limpiar y deshacer durante 10 s recupera la lista completa", () => {
    store().applyUpdates([start("a", 0), start("b", 1)]);
    store().clearTraffic();
    expect(store().exchanges).toEqual([]);
    store().applyUpdates([start("c", 2)]);
    vi.advanceTimersByTime(9_999);
    expect(store().undoClearTraffic()).toBe(true);
    expect(ids()).toEqual(["a", "b", "c"]);
  });

  it("tras 10 s ya no se puede deshacer", () => {
    store().applyUpdates([start("a", 0)]);
    store().clearTraffic();
    vi.advanceTimersByTime(10_001);
    expect(store().undoClearTraffic()).toBe(false);
    expect(store().exchanges).toEqual([]);
  });
});
