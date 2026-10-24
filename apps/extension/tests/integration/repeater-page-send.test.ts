import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { createPageSender } from "../../src/background/repeater/page-send.ts";
import {
  PAGE_ABORT,
  PAGE_SEND,
  REPEATER_SOURCE_URL,
} from "../../src/background/repeater/page-template.ts";
import { FakeDebugger } from "../fakes/fake-debugger.ts";

// 005 (research R1, R4; SC-004): la declaración que se ejecuta en la página es siempre la
// constante revisada; lo que escribe el dev viaja solo en `arguments`.

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");
/** Hash de las plantillas revisadas: cambiarlas exige revisar este archivo. */
const PAGE_SEND_SHA256 = "d7d59893f94240a3a9af299d832b7ee9e12a38b70e03dfebd1f12d072c03ecb2";
const PAGE_ABORT_SHA256 = "39348b6aa96c032e6ad2cb5ee866c790543eee9bbf23688f303eb67882da1954";

const INJECTIONS = [
  '"); globalThis.__pwned=1; ("',
  "</script><script>globalThis.__pwned=1</script>",
  "${globalThis.__pwned=1}",
  "`; globalThis.__pwned=1; `",
  "\n//# sourceURL=x\n})(); globalThis.__pwned=1; (function(){",
];

let cdp: FakeDebugger;

beforeEach(async () => {
  cdp = new FakeDebugger();
  await cdp.attach(1);
  cdp.respond("Page.getFrameTree", () => ({ frameTree: { frame: { id: "main" } } }));
  cdp.respond("Page.createIsolatedWorld", () => ({ executionContextId: 7 }));
  cdp.respond("Runtime.callFunctionOn", () => ({ result: { value: { ok: true, status: 200 } } }));
});

const argument = (overrides: Record<string, unknown> = {}) => ({
  sendId: "3f1c2b4a-8d9e-4f60-a1b2-c3d4e5f60718",
  method: "POST",
  url: "https://api.test/echo",
  headers: [["x-a", "1"]] as [string, string][],
  body: { kind: "text" as const, text: "{}" },
  ...overrides,
});

describe("plantillas fijas", () => {
  it("tienen el hash revisado y terminan con el sourceURL constante seguido de salto de línea", () => {
    expect(sha256(PAGE_SEND)).toBe(PAGE_SEND_SHA256);
    expect(sha256(PAGE_ABORT)).toBe(PAGE_ABORT_SHA256);
    expect(PAGE_SEND.endsWith(`//# sourceURL=${REPEATER_SOURCE_URL}\n`)).toBe(true);
    expect(PAGE_SEND).not.toMatch(/\beval\(|\bFunction\(|innerHTML/);
  });
});

describe("createPageSender (contexto de página)", () => {
  it("crea el mundo aislado una vez sobre el marco principal y llama a la plantilla", async () => {
    const sender = createPageSender({ debugger: cdp });
    await expect(sender.send(1, argument())).resolves.toEqual({ ok: true, status: 200 });
    await sender.send(1, argument());
    expect(cdp.calls("Page.createIsolatedWorld")).toEqual([
      { frameId: "main", worldName: "nahual-repeater" },
    ]);
    const calls = cdp.calls("Runtime.callFunctionOn");
    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual({
      executionContextId: 7,
      functionDeclaration: PAGE_SEND,
      arguments: [{ value: argument() }],
      awaitPromise: true,
      returnByValue: true,
    });
  });

  it.each(INJECTIONS)("los datos con %j van solo en arguments", async (payload) => {
    const sender = createPageSender({ debugger: cdp });
    await sender.send(
      1,
      argument({
        url: `https://api.test/echo?q=${encodeURIComponent(payload)}#${payload}`,
        method: "POST",
        headers: [[`x-${payload.length}`, payload]],
        body: { kind: "text", text: payload },
      }),
    );
    const [call] = cdp.calls<{ functionDeclaration: string; arguments: unknown[] }>(
      "Runtime.callFunctionOn",
    );
    expect(sha256(call?.functionDeclaration ?? "")).toBe(PAGE_SEND_SHA256);
    expect(JSON.stringify(call?.arguments)).toContain(JSON.stringify(payload).slice(1, -1));
    expect(cdp.calls("Runtime.evaluate")).toEqual([]);
  });

  it("si el contexto ya no existe, recrea el mundo y reintenta una vez", async () => {
    const sender = createPageSender({ debugger: cdp });
    await sender.send(1, argument());
    let failed = false;
    cdp.respond("Runtime.callFunctionOn", () => {
      if (!failed) {
        failed = true;
        throw new Error("Cannot find context with specified id");
      }
      return { result: { value: { ok: true, status: 200 } } };
    });
    await expect(sender.send(1, argument())).resolves.toEqual({ ok: true, status: 200 });
    expect(cdp.calls("Page.createIsolatedWorld")).toHaveLength(2);
  });

  it("si el contexto se destruye a mitad del envío no reintenta (el request pudo salir)", async () => {
    const sender = createPageSender({ debugger: cdp });
    cdp.respond("Runtime.callFunctionOn", () => {
      throw new Error("Execution context was destroyed.");
    });
    await expect(sender.send(1, argument())).resolves.toMatchObject({
      ok: false,
      errorName: "ContextLost",
    });
    expect(cdp.calls("Runtime.callFunctionOn")).toHaveLength(1);
  });

  it("invalidate (navegación) obliga a crear un mundo nuevo", async () => {
    const sender = createPageSender({ debugger: cdp });
    await sender.send(1, argument());
    sender.invalidate(1);
    await sender.send(1, argument());
    expect(cdp.calls("Page.createIsolatedWorld")).toHaveLength(2);
  });

  it("abort llama a PAGE_ABORT con el sendId como argumento", async () => {
    const sender = createPageSender({ debugger: cdp });
    await sender.send(1, argument());
    await sender.abort(1, "3f1c2b4a-8d9e-4f60-a1b2-c3d4e5f60718");
    const calls = cdp.calls<{ functionDeclaration: string; arguments: unknown[] }>(
      "Runtime.callFunctionOn",
    );
    expect(calls.at(-1)?.functionDeclaration).toBe(PAGE_ABORT);
    expect(calls.at(-1)?.arguments).toEqual([{ value: "3f1c2b4a-8d9e-4f60-a1b2-c3d4e5f60718" }]);
  });

  it("un fallo de CDP sin recuperación devuelve un error de contexto", async () => {
    const sender = createPageSender({ debugger: cdp });
    cdp.failSend("Runtime.callFunctionOn", "cdp_error", "cdp_error");
    await expect(sender.send(1, argument())).resolves.toEqual({
      ok: false,
      errorName: "ContextLost",
      message: expect.any(String),
    });
  });
});
