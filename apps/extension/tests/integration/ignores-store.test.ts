import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { IGNORES_KEY, createIgnoresStore } from "../../src/background/repeater/ignores-store.ts";
import { FakeStorage } from "../fakes/fake-storage.ts";

// 005 (FR-028, FR-029, research R10, contracts/storage.md).

const hash = (text: string) => createHash("sha256").update(text).digest("hex");
let storage: FakeStorage;
let notices: string[];
let clock: number;

const store = () =>
  createIgnoresStore({ storage, onNotice: (key) => notices.push(key), now: () => clock });

beforeEach(() => {
  storage = new FakeStorage();
  notices = [];
  clock = 1;
});

const timestamp = [{ key: "meta" }, { key: "timestamp" }];

describe("lista de ignorados por endpoint", () => {
  it("se guarda bajo el hash del endpoint, sin la URL ni valores", async () => {
    const s = store();
    await s.set("get", "https://api.test/items?page=2", { paths: [timestamp], headers: ["Date"] });
    const raw = storage.data.get(IGNORES_KEY) as {
      version: number;
      endpoints: Record<string, unknown>;
    };
    expect(raw.version).toBe(1);
    expect(Object.keys(raw.endpoints)).toEqual([hash("GET https://api.test/items")]);
    expect(JSON.stringify(raw)).not.toContain("api.test");
    await expect(s.get("GET", "https://api.test/items?page=9")).resolves.toEqual({
      paths: [timestamp],
      headers: ["date"],
    });
  });

  it("otro endpoint no tiene ignorados; lista vacía borra la entrada", async () => {
    const s = store();
    await s.set("GET", "https://api.test/a", { paths: [timestamp], headers: [] });
    await expect(s.get("GET", "https://api.test/b")).resolves.toEqual({ paths: [], headers: [] });
    await expect(s.get("POST", "https://api.test/a")).resolves.toEqual({ paths: [], headers: [] });
    await s.set("GET", "https://api.test/a", { paths: [], headers: [] });
    expect(Object.keys((storage.data.get(IGNORES_KEY) as { endpoints: object }).endpoints)).toEqual(
      [],
    );
  });

  it("sin repetidos y recortada a 100 entradas", async () => {
    const s = store();
    const headers = Array.from({ length: 120 }, (_, i) => `h${i % 110}`);
    await s.set("GET", "https://api.test/a", { paths: [timestamp, timestamp], headers });
    const value = await s.get("GET", "https://api.test/a");
    expect(value.paths).toEqual([timestamp]);
    expect(value.headers).toHaveLength(100);
  });

  it("con 500 endpoints descarta el usado hace más tiempo", async () => {
    const s = store();
    for (let i = 0; i < 501; i++) {
      clock = i + 1;
      await s.set("GET", `https://api.test/e${i}`, { paths: [], headers: ["date"] });
    }
    const raw = storage.data.get(IGNORES_KEY) as { endpoints: Record<string, unknown> };
    expect(Object.keys(raw.endpoints)).toHaveLength(500);
    expect(raw.endpoints[hash("GET https://api.test/e0")]).toBeUndefined();
    expect(raw.endpoints[hash("GET https://api.test/e500")]).toBeDefined();
    // 501 escrituras con hash y copia del almacenamiento simulado: holgura con la suite en paralelo.
  }, 20_000);

  it("guardado ilegible ⇒ lista vacía y aviso, sin romper", async () => {
    storage.data.set(IGNORES_KEY, { version: 1, endpoints: { "GET /x": { values: ["secret"] } } });
    const s = store();
    await expect(s.get("GET", "https://api.test/a")).resolves.toEqual({ paths: [], headers: [] });
    expect(notices).toEqual(["repeater_ignores_invalid"]);
    await s.set("GET", "https://api.test/a", { paths: [], headers: ["date"] });
    expect(JSON.stringify(storage.data.get(IGNORES_KEY))).not.toContain("secret");
  });
});
