import { describe, expect, it } from "vitest";
import { cleanupOrphans } from "../../src/background/startup-cleanup.ts";
import { createSessionRegistry } from "../../src/background/session-registry.ts";
import { FakeDebugger, OWN_EXTENSION_ID } from "../fakes/fake-debugger.ts";
import { FakeStorage } from "../fakes/fake-storage.ts";

function setup() {
  const cdp = new FakeDebugger();
  const registry = createSessionRegistry(new FakeStorage());
  const run = () => cleanupOrphans({ debugger: cdp, registry, extensionId: OWN_EXTENSION_ID });
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

  it("ignora targets de otras extensiones o sin pestaña", async () => {
    const { cdp, run } = setup();
    cdp.extraTargets = [
      { tabId: 5, attached: true, extensionId: "otra-extension" },
      { attached: true, extensionId: OWN_EXTENSION_ID },
      { tabId: 6, attached: false },
    ];
    await run();
    expect(cdp.sent).toEqual([]);
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
