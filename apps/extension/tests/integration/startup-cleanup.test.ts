import { describe, expect, it } from "vitest";
import { cleanupOrphans } from "../../src/background/startup-cleanup.ts";
import { createSessionRegistry } from "../../src/background/session-registry.ts";
import { FakeDebugger } from "../fakes/fake-debugger.ts";
import { FakeStorage } from "../fakes/fake-storage.ts";

function setup() {
  const cdp = new FakeDebugger();
  const registry = createSessionRegistry(new FakeStorage());
  const run = () => cleanupOrphans({ debugger: cdp, registry });
  return { cdp, registry, run };
}

describe("cleanupOrphans", () => {
  it("suelta los targets adjuntos por esta extensión", async () => {
    const { cdp, run } = setup();
    await cdp.attach(1);
    await cdp.attach(2);
    await run();
    expect(cdp.attached.size).toBe(0);
  });

  it("intenta soltar toda pestaña adjunta: detach solo afecta a la sesión propia", async () => {
    // getTargets no dice qué cliente está adjunto (research D6): se intenta en todas y el
    // detach de una pestaña ajena falla con not_attached sin tocar la sesión del otro cliente.
    const { cdp, run } = setup();
    await cdp.attach(1);
    cdp.extraTargets = [
      { tabId: 5, attached: true },
      { attached: true },
      { tabId: 6, attached: false },
    ];
    const detached: number[] = [];
    const original = cdp.detach.bind(cdp);
    cdp.detach = async (tabId) => {
      detached.push(tabId);
      return original(tabId);
    };
    await run();
    expect(detached.sort()).toEqual([1, 5]);
    expect(cdp.attached.size).toBe(0);
  });

  it("suelta las pestañas del registro y lo vacía", async () => {
    const { cdp, registry, run } = setup();
    await cdp.attach(3);
    await registry.add(3);
    await registry.add(4); // ya no está adjunta: el detach falla y se tolera
    await run();
    expect(cdp.attached.size).toBe(0);
    expect(await registry.list()).toEqual([]);
  });

  it("no lanza si getTargets o detach fallan", async () => {
    const { cdp, registry, run } = setup();
    await cdp.attach(1);
    await registry.add(1);
    cdp.failNextDetach("cdp_error");
    cdp.getTargets = async () => {
      throw new Error("boom");
    };
    await expect(run()).resolves.toBeUndefined();
    expect(await registry.list()).toEqual([]);
  });
});
