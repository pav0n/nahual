import { z } from "zod";

/**
 * Preferencias de interfaz del panel (004, research R3, contracts/storage.md): solo disposición,
 * nunca datos de tráfico. Se leen campo por campo: un valor inválido vuelve a su default (FR-034).
 */
export const UI_PREFS_KEY = "nahual.ui.v1";

export interface UiPrefs {
  version: 1;
  /** Fracción del ancho para el panel izquierdo (la lista) de cada vista. */
  split: { traffic: number; rules: number; paused: number };
  /** Alto en px del cajón inferior. */
  drawerHeight: number;
}

export type SplitKey = keyof UiPrefs["split"];

export const DEFAULT_UI_PREFS: UiPrefs = {
  version: 1,
  split: { traffic: 0.5, rules: 0.34, paused: 0.34 },
  drawerHeight: 180,
};

const fraction = (fallback: number) => z.number().min(0.2).max(0.8).catch(fallback);

const UiPrefsSchema = z.object({
  version: z.literal(1),
  split: z
    .object({
      traffic: fraction(DEFAULT_UI_PREFS.split.traffic),
      rules: fraction(DEFAULT_UI_PREFS.split.rules),
      paused: fraction(DEFAULT_UI_PREFS.split.paused),
    })
    .catch(DEFAULT_UI_PREFS.split),
  drawerHeight: z.number().int().min(120).max(600).catch(DEFAULT_UI_PREFS.drawerHeight),
});

type PrefsStorage = Pick<Storage, "getItem" | "setItem">;

/** `localStorage` puede no existir o lanzar (contexto restringido): entonces no hay disco. */
function defaultStorage(): PrefsStorage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

const copy = (prefs: UiPrefs): UiPrefs => ({
  version: 1,
  split: { traffic: prefs.split.traffic, rules: prefs.split.rules, paused: prefs.split.paused },
  drawerHeight: prefs.drawerHeight,
});

export function readUiPrefs(storage: Pick<Storage, "getItem"> | null = defaultStorage()): UiPrefs {
  try {
    const raw = storage?.getItem(UI_PREFS_KEY);
    if (!raw) return copy(DEFAULT_UI_PREFS);
    const parsed = UiPrefsSchema.safeParse(JSON.parse(raw));
    return parsed.success ? copy(parsed.data) : copy(DEFAULT_UI_PREFS);
  } catch {
    return copy(DEFAULT_UI_PREFS);
  }
}

/** Escribe solo los campos de `UiPrefs`; si `localStorage` falla, no guarda y sigue. */
export function writeUiPrefs(prefs: UiPrefs, storage: PrefsStorage | null = defaultStorage()) {
  try {
    storage?.setItem(UI_PREFS_KEY, JSON.stringify(copy(prefs)));
  } catch {
    // Sin disco: el panel sigue con las preferencias en memoria.
  }
}

export interface UiPrefsWriter {
  get(): UiPrefs;
  /** Cambia en memoria y escribe 250 ms después del último cambio (arrastre del divisor). */
  update(patch: Partial<Omit<UiPrefs, "version">>): void;
}

export function createUiPrefsWriter(
  storage: PrefsStorage | null = defaultStorage(),
  delayMs = 250,
): UiPrefsWriter {
  let current = readUiPrefs(storage);
  let timer: ReturnType<typeof setTimeout> | null = null;
  return {
    get: () => current,
    update(patch) {
      current = { ...current, ...patch, version: 1 };
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        writeUiPrefs(current, storage);
      }, delayMs);
    },
  };
}

let shared: UiPrefsWriter | null = null;

/** Preferencias del panel abierto (una instancia, leída al primer uso). */
export function uiPrefs(): UiPrefsWriter {
  shared ??= createUiPrefsWriter();
  return shared;
}
