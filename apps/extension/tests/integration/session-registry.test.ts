import { describe, expect, it } from "vitest";
import { createSessionRegistry, REGISTRY_KEY } from "../../src/background/session-registry.ts";
import { FakeStorage } from "../fakes/fake-storage.ts";

describe("session-registry", () => {
  it(`guarda las pestañas en ${REGISTRY_KEY} sin duplicados`, async () => {
    const storage = new FakeStorage();
    const registry = createSessionRegistry(storage);
    await registry.add(3);
    await registry.add(3);
    await registry.add(7);
    expect(await registry.list()).toEqual([3, 7]);
    expect(storage.data.get(REGISTRY_KEY)).toEqual([3, 7]);
  });

  it("remove y clear", async () => {
    const registry = createSessionRegistry(new FakeStorage());
    await Promise.all([registry.add(1), registry.add(2), registry.add(3)]);
    await registry.remove(2);
    await registry.remove(99);
    expect(await registry.list()).toEqual([1, 3]);
    await registry.clear();
    expect(await registry.list()).toEqual([]);
  });

  it("ignora contenido corrupto en storage", async () => {
    const storage = new FakeStorage();
    storage.data.set(REGISTRY_KEY, ["x", 4, -1, 2.5, 4]);
    expect(await createSessionRegistry(storage).list()).toEqual([4]);
  });
});
