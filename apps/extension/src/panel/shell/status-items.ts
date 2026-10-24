import type { ComponentType } from "react";
import { SessionStatus } from "./SessionStatus.tsx";

export interface StatusItemEntry {
  id: string;
  /** Texto e icono, nunca solo color (FR-012); si actúa, abre un `Menu`. */
  render: ComponentType;
}

/**
 * Indicadores de estado de la barra superior (004, contracts/panel-shell.md): hoy la sesión; 006
 * añade la consola de hooks y 007 el perfil activo.
 */
export const STATUS_ITEMS: StatusItemEntry[] = [{ id: "session", render: SessionStatus }];
