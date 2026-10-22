import { beforeEach, describe, expect, it } from "vitest";
import {
  createDebuggerManager,
  type DebuggerManager,
  type SessionSnapshot,
} from "../../src/background/debugger-manager.ts";
import {
  createSessionRegistry,
  type SessionRegistry,
} from "../../src/background/session-registry.ts";
import { FakeDebugger } from "../fakes/fake-debugger.ts";
import { FakeStorage } from "../fakes/fake-storage.ts";

let cdp: FakeDebugger;
let registry: SessionRegistry;
let manager: DebuggerManager;
let changes: { tabId: number; snapshot: SessionSnapshot }[];
let ended: number[];
let clock: number;

beforeEach(() => {
  cdp = new FakeDebugger();
  registry = createSessionRegistry(new FakeStorage());
  changes = [];
  ended = [];
  clock = 1_000;
  manager = createDebuggerManager({
    debugger: cdp,
    registry,
    now: () => clock,
    onStateChange: (tabId, snapshot) => void changes.push({ tabId, snapshot }),
    onSessionEnded: (tabId) => void ended.push(tabId),
  });
});

const statuses = (tabId = 1) =>
  changes.filter((c) => c.tabId === tabId).map((c) => c.snapshot.status);

describe("DebuggerManager: transiciones (data-model.md)", () => {
  it("una pestaña nueva está detached sin causa", () => {
    expect(manager.get(1)).toEqual({ status: "detached", cause: null, attachedAt: null });
  });

  it("detached ──attach──▶ attaching ──ok──▶ attached con attachedAt", async () => {
    expect(await manager.attach(1)).toEqual({ ok: true });
    expect(statuses()).toEqual(["attaching", "attached"]);
    expect(manager.get(1)).toEqual({ status: "attached", cause: null, attachedAt: 1_000 });
    expect(cdp.attached.has(1)).toBe(true);
    expect(await registry.list()).toEqual([1]);
  });

  it("attach con otro cliente adjunto ⇒ conflict (already_attached)", async () => {
    cdp.failNextAttach("already_attached");
    expect(await manager.attach(1)).toEqual({ ok: false, code: "already_attached" });
    expect(manager.get(1)).toMatchObject({ status: "conflict", cause: "already_attached" });
    expect(await registry.list()).toEqual([]);
  });

  it("attach en página restringida ⇒ detached con cause restricted_page", async () => {
    cdp.failNextAttach("restricted_page");
    expect(await manager.attach(1)).toEqual({ ok: false, code: "restricted_page" });
    expect(manager.get(1)).toMatchObject({ status: "detached", cause: "restricted_page" });
  });

  it("otro error de attach ⇒ detached con cause unknown y cdp_error", async () => {
    cdp.failNextAttach("cdp_error");
    expect(await manager.attach(1)).toEqual({ ok: false, code: "cdp_error" });
    expect(manager.get(1)).toMatchObject({ status: "detached", cause: "unknown" });
  });

  it("attach estando adjunto es idempotente", async () => {
    await manager.attach(1);
    changes = [];
    expect(await manager.attach(1)).toEqual({ ok: true });
    expect(changes).toEqual([]);
  });

  it("detach del usuario ⇒ detached con cause user", async () => {
    await manager.attach(1);
    expect(await manager.detach(1, "user")).toEqual({ ok: true });
    expect(manager.get(1)).toEqual({ status: "detached", cause: "user", attachedAt: null });
    expect(cdp.attached.has(1)).toBe(false);
    expect(await registry.list()).toEqual([]);
    expect(ended).toEqual([1]);
  });

  it("panel cerrado ⇒ detached con cause panel_closed", async () => {
    await manager.attach(1);
    await manager.detach(1, "panel_closed");
    expect(manager.get(1)).toMatchObject({ status: "detached", cause: "panel_closed" });
  });

  it("detach tolera que Chrome ya lo haya soltado", async () => {
    await manager.attach(1);
    cdp.failNextDetach("not_attached");
    expect(await manager.detach(1, "user")).toEqual({ ok: true });
    expect(manager.get(1).status).toBe("detached");
  });

  it("detach sin sesión no llama a CDP", async () => {
    expect(await manager.detach(1, "user")).toEqual({ ok: true });
    expect(ended).toEqual([]);
  });

  it.each(["canceled_by_user", "target_closed"] as const)(
    "onDetach %s ⇒ detached con esa causa y evento state",
    async (reason) => {
      await manager.attach(1);
      changes = [];
      cdp.externalDetach(1, reason);
      await Promise.resolve();
      expect(manager.get(1)).toEqual({ status: "detached", cause: reason, attachedAt: null });
      expect(statuses()).toEqual(["detached"]);
      expect(ended).toEqual([1]);
      expect(await registry.list()).toEqual([]);
    },
  );

  it("onDetach con razón desconocida ⇒ cause unknown", async () => {
    await manager.attach(1);
    cdp.externalDetach(1, "something_new");
    expect(manager.get(1)).toMatchObject({ status: "detached", cause: "unknown" });
  });

  it("tras un detach externo no hay reintento automático", async () => {
    await manager.attach(1);
    cdp.externalDetach(1, "canceled_by_user");
    await new Promise((r) => setTimeout(r, 10));
    expect(cdp.attached.has(1)).toBe(false);
    expect(manager.get(1).status).toBe("detached");
  });

  it("reconnect desde detached o conflict ⇒ attaching ⇒ attached", async () => {
    cdp.failNextAttach("already_attached");
    await manager.attach(1);
    changes = [];
    expect(await manager.reconnect(1)).toEqual({ ok: true });
    expect(statuses()).toEqual(["attaching", "attached"]);

    cdp.externalDetach(1, "target_closed");
    changes = [];
    await manager.reconnect(1);
    expect(statuses()).toEqual(["attaching", "attached"]);
  });

  it("dos pestañas son independientes", async () => {
    await manager.attach(1);
    await manager.attach(2);
    cdp.externalDetach(1, "target_closed");
    expect(manager.get(1).status).toBe("detached");
    expect(manager.get(2).status).toBe("attached");
    expect(await registry.list()).toEqual([2]);
  });

  it("isAttached refleja el estado", async () => {
    expect(manager.isAttached(1)).toBe(false);
    await manager.attach(1);
    expect(manager.isAttached(1)).toBe(true);
  });
});
