import type { Settings } from "@nahual/domain";
import type { SessionState } from "@nahual/protocol";

export interface AutoAttach {
  /** Se abrió (o reabrió) el puerto y `hello` fue aceptado. */
  connected(): void;
  /** Llega `settings` o `state`: decide si adjuntar. */
  update(settings: Settings | null, session: SessionState | null): void;
  /** El dev pulsó "Soltar": no se readjunta mientras el panel siga abierto (FR-027b). */
  userDetached(): void;
  /** El dev pulsó "Adjuntar" o "Reconectar". */
  userAttached(): void;
}

/**
 * Adjunto automático tras el primer consentimiento (FR-027a, research R17). La decisión es del
 * panel: el SW nunca se adjunta solo. Tras cada `hello` (también tras un reinicio del SW) se
 * adjunta una vez si hay consentimiento, `autoAttach` y el dev no soltó el debugger en este panel.
 */
export function createAutoAttach(attach: () => void): AutoAttach {
  let pending = false;
  let manualDetach = false;
  return {
    connected() {
      pending = true;
    },
    update(settings, session) {
      if (!pending || !settings || !session) return;
      pending = false;
      if (!settings.attachConsent || !settings.autoAttach || manualDetach) return;
      if (session.status === "detached") attach();
    },
    userDetached() {
      manualDetach = true;
    },
    userAttached() {
      manualDetach = false;
    },
  };
}
