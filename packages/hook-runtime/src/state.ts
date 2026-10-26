import { LIMITS, utf8Bytes } from "@nahual/domain";

export type HookStateValue = Record<string, unknown>;

export interface HookStateSnapshot {
  value: HookStateValue;
  version: number;
}

/**
 * `state` compartido por los hooks de una pestaña (R7, FR-008, FR-009): cada ejecución lee una
 * copia con su versión y guarda solo si nadie guardó antes (concurrencia optimista). Vive en
 * memoria del panel.
 */
export function createHookState() {
  let value: HookStateValue = {};
  let version = 0;
  const copy = (v: HookStateValue): HookStateValue => structuredClone(v);

  return {
    snapshot: (): HookStateSnapshot => ({ value: copy(value), version }),
    commit(expected: number, next: HookStateValue): "saved" | "conflict" | "too_large" {
      if (expected !== version) return "conflict";
      if (utf8Bytes(JSON.stringify(next)) > LIMITS.hookStateBytesMax) return "too_large";
      value = copy(next);
      version += 1;
      return "saved";
    },
    /** "Vaciar estado": devuelve lo anterior para "Deshacer". */
    clear(): HookStateSnapshot {
      const previous = { value, version };
      value = {};
      version += 1;
      return previous;
    },
    restore(previous: HookStateSnapshot) {
      value = copy(previous.value);
      version += 1;
    },
  };
}

export type HookState = ReturnType<typeof createHookState>;
