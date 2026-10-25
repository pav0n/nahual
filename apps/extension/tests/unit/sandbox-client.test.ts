import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSandboxClient,
  type SandboxFrame,
  type WindowMessage,
} from "../../src/panel/hooks/sandbox-client.ts";

// 006 (T025, contracts/sandbox-messaging.md): canal con el sandbox sin `targetOrigin "*"`.

class FakePort {
  posted: unknown[] = [];
  onmessage: ((event: { data: unknown }) => void) | null = null;
  postMessage(message: unknown) {
    this.posted.push(message);
  }
  close() {}
  reply(data: unknown) {
    this.onmessage?.({ data });
  }
}

function fakeFrames() {
  const frames: { window: object; port: FakePort; destroyed: boolean; load(): void }[] = [];
  let onWindow: ((m: WindowMessage) => void) | null = null;
  const factory: SandboxFrame = {
    create(onLoad) {
      const frame = { window: {}, port: new FakePort(), destroyed: false, load: onLoad };
      frames.push(frame);
      return { window: frame.window, destroy: () => (frame.destroyed = true) };
    },
    listen(listener) {
      onWindow = listener;
      return () => (onWindow = null);
    },
  };
  /** El sandbox abre el canal y avisa que está listo. */
  const hello = (i = frames.length - 1, origin = "null", source?: object) => {
    const frame = frames[i];
    if (!frame) throw new Error("sin iframe");
    onWindow?.({
      source: source ?? frame.window,
      origin,
      data: { type: "hello", v: 1 },
      ports: [frame.port as never],
    });
    frame.port.reply({ type: "ready", sucraseMs: 1 });
  };
  return { factory, frames, hello, listening: () => onWindow !== null };
}

const context = {
  stage: "request",
  resourceType: "Fetch",
  site: "http://app.test",
  request: {
    method: "GET",
    url: "http://api.test/x",
    headers: {},
    body: { kind: "none", contentType: null, size: null },
    graphql: null,
  },
  response: null,
} as const;

const runOf = (execId: string, codeHash = "ab", source: string | null = "x") => ({
  execId,
  ruleId: "r1",
  codeHash,
  source: source ?? "x",
  context,
  state: {},
  timeoutMs: 2000,
});

const ok = (execId: string) => ({
  type: "result",
  execId,
  outcome: {
    kind: "ok",
    context,
    respond: null,
    stateChanged: false,
    state: {},
    logs: [],
    durationMs: 1,
  },
});

describe("createSandboxClient", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("acepta solo el primer hello de su iframe con origen null y deja de escuchar la ventana", async () => {
    const f = fakeFrames();
    const client = createSandboxClient(f.factory);
    const ready = client.warm();
    f.hello(0, "chrome-extension://x"); // otro origen: ignorado
    f.hello(0, "null", {}); // otra ventana: ignorado
    expect(client.isReady()).toBe(false);
    f.hello(0);
    await ready;
    expect(client.isReady()).toBe(true);
    expect(f.listening()).toBe(false);
  });

  it("run espera a ready, manda el código una sola vez por hash y resuelve con el resultado validado", async () => {
    const f = fakeFrames();
    const client = createSandboxClient(f.factory);
    const first = client.run(runOf("e1"));
    f.hello();
    await vi.advanceTimersByTimeAsync(0);
    const port = f.frames[0]?.port as FakePort;
    expect(port.posted).toMatchObject([{ type: "run", execId: "e1", source: "x" }]);
    port.reply(ok("e1"));
    await expect(first).resolves.toMatchObject({ kind: "ok" });
    const second = client.run(runOf("e2"));
    await vi.advanceTimersByTimeAsync(0);
    expect(port.posted[1]).toMatchObject({ type: "run", execId: "e2", source: null });
    port.reply(ok("e2"));
    await second;
  });

  it("descarta respuestas inválidas o de ejecuciones desconocidas; vence por tiempo", async () => {
    const f = fakeFrames();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const client = createSandboxClient(f.factory);
    const run = client.run(runOf("e1"));
    f.hello();
    await vi.advanceTimersByTimeAsync(0);
    const port = f.frames[0]?.port as FakePort;
    port.reply(ok("inventado"));
    port.reply({ type: "result", execId: "e1", outcome: { kind: "ok" } });
    expect(warn).toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(3_100);
    await expect(run).resolves.toMatchObject({ kind: "error", type: "timeout" });
  });

  it("un iframe que vuelve a cargar (navegó) se destruye, falla lo pendiente y se recrea", async () => {
    const f = fakeFrames();
    const client = createSandboxClient(f.factory);
    const run = client.run(runOf("e1"));
    f.hello();
    await vi.advanceTimersByTimeAsync(0);
    f.frames[0]?.load(); // primer load: normal
    f.frames[0]?.load(); // segundo load: navegó
    await expect(run).resolves.toMatchObject({ kind: "error", type: "access_denied" });
    expect(f.frames[0]?.destroyed).toBe(true);
    const again = client.run(runOf("e2"));
    expect(f.frames).toHaveLength(2);
    f.hello(1);
    await vi.advanceTimersByTimeAsync(0);
    expect((f.frames[1]?.port as FakePort).posted[0]).toMatchObject({ source: "x" });
    (f.frames[1]?.port as FakePort).reply(ok("e2"));
    await again;
  });

  it("dispose avisa al sandbox y destroy cierra el iframe", async () => {
    const f = fakeFrames();
    const client = createSandboxClient(f.factory);
    void client.warm();
    f.hello();
    await vi.advanceTimersByTimeAsync(0);
    client.dispose("r1");
    expect((f.frames[0]?.port as FakePort).posted).toEqual([{ type: "dispose", ruleId: "r1" }]);
    client.destroy();
    expect(f.frames[0]?.destroyed).toBe(true);
  });
});
