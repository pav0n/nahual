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

describe("SettingsStore: CORS de desarrollo (003, research R12)", () => {
  it("lee ajustes de 002 sin los campos nuevos con sus defaults y sin aviso", async () => {
    storage.data.set(SETTINGS_KEY, {
      version: 1,
      settings: {
        pauseTimeoutSeconds: 60,
        globalPaused: false,
        onboardingSeen: true,
        attachConsent: true,
        autoAttach: true,
      },
    });
    const store = await open();
    expect(store.get().corsDefaultDurationMinutes).toBe(480);
    expect(store.get().productionOrigins).toEqual([]);
    expect(store.productionListReadable()).toBe(true);
    expect(notices).toEqual([]);
  });

  it("lista con una entrada corrupta ⇒ aviso y bloqueo hasta guardarla", async () => {
    storage.data.set(SETTINGS_KEY, {
      version: 1,
      settings: { ...DEFAULT_SETTINGS, productionOrigins: ["https://*.empresa.com", "basura"] },
    });
    const store = await open();
    expect(store.get().productionOrigins).toEqual(["https://*.empresa.com"]);
    expect(store.productionListReadable()).toBe(false);
    expect(notices).toEqual(["cors_production_list_invalid"]);
    expect(await store.update({ globalPaused: true })).toEqual({ ok: true });
    expect(store.productionListReadable()).toBe(false);
    // La entrada corrupta sigue en disco: otra escritura no la descarta en silencio.
    expect(
      (storage.data.get(SETTINGS_KEY) as { settings: { productionOrigins: unknown } }).settings
        .productionOrigins,
    ).toEqual(["https://*.empresa.com", "basura"]);
    expect(notices).toEqual(["cors_production_list_invalid"]);
    expect(await store.update({ productionOrigins: ["https://*.empresa.com"] })).toEqual({
      ok: true,
    });
    expect(store.productionListReadable()).toBe(true);
  });

  it("normaliza la lista al guardar y quita duplicados", async () => {
    const store = await open();
    expect(
      await store.update({
        productionOrigins: [
          "https://*.Empresa.com/",
          "https://*.empresa.com",
          "HTTP://LOCALHOST:8080",
        ],
      }),
    ).toEqual({ ok: true });
    expect(store.get().productionOrigins).toEqual([
      "https://*.empresa.com",
      "http://localhost:8080",
    ]);
  });

  it("una entrada inválida ⇒ settings_invalid con el índice y sin escribir", async () => {
    const store = await open();
    const result = await store.update({
      productionOrigins: ["https://*.empresa.com", "no es un origen"],
    });
    expect(result).toEqual({
      ok: false,
      code: "settings_invalid",
      issues: [{ path: "productionOrigins.1", messageKey: "cors_error_production_entry" }],
    });
    expect(storage.data.has(SETTINGS_KEY)).toBe(false);
  });

  it("duración por defecto solo 15/60/240/480", async () => {
    const store = await open();
    expect(await store.update({ corsDefaultDurationMinutes: 60 })).toEqual({ ok: true });
    expect(await store.update({ corsDefaultDurationMinutes: 30 as unknown as 60 })).toMatchObject({
      ok: false,
      code: "settings_invalid",
    });
  });
});
