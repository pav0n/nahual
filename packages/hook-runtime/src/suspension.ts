import { LIMITS } from "@nahual/domain";

/**
 * Suspensión automática (006, FR-022, research R9): tras 5 ejecuciones seguidas con error, el
 * hook se salta hasta cerrar el panel. Una ejecución correcta pone la cuenta a cero; reanudar o
 * cambiar el código la quita. Solo memoria.
 */
export function createSuspensions() {
  const errors = new Map<string, number>();
  const suspended = new Set<string>();
  return {
    /** Registra una ejecución; `true` si con ella el hook queda suspendido. */
    record(ruleId: string, failed: boolean): boolean {
      if (!failed) {
        errors.delete(ruleId);
        return false;
      }
      const count = (errors.get(ruleId) ?? 0) + 1;
      errors.set(ruleId, count);
      if (count >= LIMITS.hookSuspendAfterErrors && !suspended.has(ruleId)) {
        suspended.add(ruleId);
        return true;
      }
      return false;
    },
    isSuspended: (ruleId: string) => suspended.has(ruleId),
    suspended: () => [...suspended],
    resume(ruleId: string) {
      suspended.delete(ruleId);
      errors.delete(ruleId);
    },
    sourceChanged(ruleId: string) {
      suspended.delete(ruleId);
      errors.delete(ruleId);
    },
  };
}

export type Suspensions = ReturnType<typeof createSuspensions>;
