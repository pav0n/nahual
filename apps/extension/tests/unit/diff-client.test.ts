import type { ComparableResponse, DiffResult } from "@nahual/domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDiffClient, type WorkerLike } from "../../src/panel/repeater/diff-client.ts";

// 005 (research R12, principio I): el panel valida lo que devuelve el worker y solo acepta los
// mensajes de su instancia y de la comparación en curso.

class FakeWorker implements WorkerLike {
  posted: unknown[] = [];
  terminated = false;
  private listeners: ((event: MessageEvent<unknown>) => void)[] = [];
  postMessage(message: unknown) {
    this.posted.push(message);
  }
  terminate() {
    this.terminated = true;
  }
  addEventListener(_type: "message", listener: (event: MessageEvent<unknown>) => void) {
    this.listeners.push(listener);
  }
  reply(data: unknown) {
    for (const l of this.listeners) l({ data } as MessageEvent<unknown>);
  }
}

const side: ComparableResponse = {
  origin: { kind: "original" },
  status: 200,
  headers: [],
  body: { kind: "text", text: "{}", contentType: null },
};
const result: DiffResult = {
  status: null,
  headers: [],
  body: { mode: "equal" },
  ignored: { headers: [], body: [] },
  total: 0,
  notes: [],
};
const revealed = { headers: {}, body: {}, lines: {} };
const none = { paths: [], headers: [] };

let workers: FakeWorker[];
const factory = () => {
  const worker = new FakeWorker();
  workers.push(worker);
  return worker;
};

beforeEach(() => {
  vi.useFakeTimers();
  workers = [];
});
afterEach(() => {
  vi.useRealTimers();
});

describe("cliente del worker del diff", () => {
  it("envía la petición y resuelve con la respuesta válida", async () => {
    const client = createDiffClient(factory);
    const pending = client.compare(side, side, none);
    expect(workers[0]?.posted[0]).toMatchObject({ type: "diff", requestId: 1 });
    workers[0]?.reply({ type: "result", requestId: 1, result, revealed });
    await expect(pending).resolves.toEqual({ ok: true, result, revealed });
  });

  it("una respuesta que no valida ⇒ invalid (se descarta)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const client = createDiffClient(factory);
    const pending = client.compare(side, side, none);
    workers[0]?.reply({ type: "result", requestId: 1, result: { ...result, total: -1 }, revealed });
    await expect(pending).resolves.toEqual({ ok: false, reason: "invalid" });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("ignora una respuesta de otra comparación y las tardías tras cancelar", async () => {
    const client = createDiffClient(factory);
    const first = client.compare(side, side, none);
    client.cancel();
    await expect(first).resolves.toEqual({ ok: false, reason: "cancelled" });
    expect(workers[0]?.terminated).toBe(true);
    // Respuesta tardía del worker terminado.
    workers[0]?.reply({ type: "result", requestId: 1, result, revealed });
    const second = client.compare(side, side, none);
    workers[1]?.reply({ type: "result", requestId: 99, result, revealed });
    workers[1]?.reply({ type: "result", requestId: 2, result: { ...result, total: 3 }, revealed });
    await expect(second).resolves.toMatchObject({ ok: true, result: { total: 3 } });
  });

  it("una comparación nueva cancela la anterior", async () => {
    const client = createDiffClient(factory);
    const first = client.compare(side, side, none);
    const second = client.compare(side, side, none);
    await expect(first).resolves.toEqual({ ok: false, reason: "cancelled" });
    workers[1]?.reply({ type: "result", requestId: 2, result, revealed });
    await expect(second).resolves.toMatchObject({ ok: true });
  });

  it("10 s sin respuesta ⇒ timeout y el worker se descarta", async () => {
    const client = createDiffClient(factory);
    const pending = client.compare(side, side, none);
    vi.advanceTimersByTime(10_000);
    await expect(pending).resolves.toEqual({ ok: false, reason: "timeout" });
    expect(workers[0]?.terminated).toBe(true);
  });
});
