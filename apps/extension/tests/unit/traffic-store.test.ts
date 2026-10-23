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

describe("traffic: información CORS (003)", () => {
  beforeEach(() => store().resetTraffic());

  const diagnosis = {
    cause: "missing_allow_origin" as const,
    browserCode: "MissingAllowOriginHeader",
    failedParameter: null,
    atPreflight: false,
    appOrigin: "http://localhost:3000",
    apiOrigin: "https://api.test",
    method: "GET",
    requestedHeaders: [],
    credentials: "unknown" as const,
    responseStatus: 200,
    preflightStatus: null,
    serverCorsHeaders: [],
    preflightExchangeId: null,
    relaxable: true,
  };

  it("un update cors guarda el diagnóstico y luego lo relajado, sin perder lo anterior", () => {
    store().applyUpdates([start("a", 0)]);
    store().applyUpdates([{ id: "a", kind: "cors", fields: {}, cors: { diagnosis } }]);
    const relaxed = {
      relaxationId: "3f1c2b4a-8d9e-4f60-a1b2-c3d4e5f60718",
      added: [],
      removed: [],
      preflightReplaced: false,
      serverStatus: 200,
      alreadyValid: true,
    };
    store().applyUpdates([{ id: "a", kind: "cors", fields: {}, cors: { relaxed } }]);
    expect(store().exchanges[0]?.cors).toEqual({ diagnosis, relaxed });
  });

  it("un update cors de un intercambio desconocido se ignora", () => {
    store().applyUpdates([{ id: "zz", kind: "cors", fields: {}, cors: { diagnosis } }]);
    expect(store().exchanges).toEqual([]);
  });
});

describe("cors: relajaciones y aviso de reinicio del SW (003, research R10)", () => {
  const view = {
    id: "3f1c2b4a-8d9e-4f60-a1b2-c3d4e5f60718",
    appOrigin: "http://localhost:3000",
    apiOrigin: "https://api.test",
    exposeHeaders: [],
    credentials: false,
    createdAt: 1,
    expiresAt: 2,
    state: "active" as const,
  };

  beforeEach(() => {
    store().setRelaxations([]);
    for (const n of store().notices) store().dismissNotice(n.id);
  });

  it("guarda la lista recibida", () => {
    store().setRelaxations([view]);
    expect(store().relaxations).toEqual([view]);
  });

  it("tras reconectar, si había relajaciones y llega una lista vacía ⇒ aviso de reinicio", () => {
    store().setRelaxations([view]);
    store().beginReconnect();
    store().setRelaxations([]);
    expect(store().notices.map((n) => n.messageKey)).toContain("cors_ended_restart");
  });

  it("sin reconexión, una lista vacía no avisa de reinicio", () => {
    store().setRelaxations([view]);
    store().setRelaxations([]);
    expect(store().notices.map((n) => n.messageKey)).not.toContain("cors_ended_restart");
  });

  it("tras reconectar sin relajaciones previas no avisa", () => {
    store().beginReconnect();
    store().setRelaxations([]);
    expect(store().notices.map((n) => n.messageKey)).not.toContain("cors_ended_restart");
  });
});
