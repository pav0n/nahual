import { DEFAULT_SETTINGS, type Settings } from "@nahual/domain";
import { beforeEach, describe, expect, it } from "vitest";
import { SETTINGS_KEY, createSettingsStore } from "../../src/background/settings-store.ts";
import { FakeStorage } from "../fakes/fake-storage.ts";

let storage: FakeStorage;
let changes: Settings[];
let notices: string[];

const open = async () => {
  const store = createSettingsStore({
    storage,
    onChange: (s) => void changes.push(s),
    onNotice: (key) => void notices.push(key),
  });
  await store.ready;
  return store;
};

beforeEach(() => {
  storage = new FakeStorage();
  changes = [];
  notices = [];
});

describe("SettingsStore (contracts/storage.md)", () => {
  it("sin datos usa los valores por defecto sin avisar", async () => {
    const store = await open();
    expect(store.get()).toEqual(DEFAULT_SETTINGS);
    expect(notices).toEqual([]);
  });

  it("aplica valores por defecto campo a campo y avisa", async () => {
    storage.data.set(SETTINGS_KEY, {
      version: 1,
      settings: { pauseTimeoutSeconds: 999, globalPaused: true },
    });
    const store = await open();
    expect(store.get()).toEqual({ ...DEFAULT_SETTINGS, globalPaused: true });
    expect(notices).toEqual(["notice_settings_reset"]);
  });

  it("una versión desconocida se ignora sin sobrescribir el disco", async () => {
    const stored = { version: 9, settings: { globalPaused: true } };
    storage.data.set(SETTINGS_KEY, stored);
    const store = await open();
    expect(store.get()).toEqual(DEFAULT_SETTINGS);
    expect(notices).toEqual(["notice_settings_reset"]);
    expect(storage.data.get(SETTINGS_KEY)).toEqual(stored);
  });

  it("update valida, persiste con versión y notifica", async () => {
    const store = await open();
    expect(await store.update({ pauseTimeoutSeconds: 30 })).toEqual({ ok: true });
    expect(store.get().pauseTimeoutSeconds).toBe(30);
    expect(storage.data.get(SETTINGS_KEY)).toEqual({
      version: 1,
      settings: { ...DEFAULT_SETTINGS, pauseTimeoutSeconds: 30 },
    });
    expect(changes.at(-1)?.pauseTimeoutSeconds).toBe(30);
  });

  it("update fuera de rango responde settings_invalid sin cambiar nada", async () => {
    const store = await open();
    expect(await store.update({ pauseTimeoutSeconds: 4 })).toEqual({
      ok: false,
      code: "settings_invalid",
    });
    expect(store.get()).toEqual(DEFAULT_SETTINGS);
    expect(storage.data.has(SETTINGS_KEY)).toBe(false);
  });

  it("cuota llena ⇒ storage_quota y la memoria no cambia", async () => {
    const store = await open();
    storage.failWritesWithQuota();
    expect(await store.update({ globalPaused: true })).toEqual({
      ok: false,
      code: "storage_quota",
    });
    expect(store.get().globalPaused).toBe(false);
  });

  it("un cambio externo en storage se vuelve a validar y notifica", async () => {
    const store = await open();
    storage.externalWrite(SETTINGS_KEY, {
      version: 1,
      settings: { ...DEFAULT_SETTINGS, autoAttach: false },
    });
    expect(store.get().autoAttach).toBe(false);
    expect(changes.at(-1)?.autoAttach).toBe(false);
  });
});
