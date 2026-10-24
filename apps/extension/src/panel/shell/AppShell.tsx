import type { ReactNode } from "react";
import { Drawer } from "./Drawer.tsx";
import { IndicatorStrip } from "./IndicatorStrip.tsx";
import { TopBar } from "./TopBar.tsx";

/**
 * Filas fijas del panel (004, contracts/panel-shell.md, research R4): barra superior, franja de
 * indicadores (0 px si está vacía), área principal (la única que hace scroll) y cajón opcional.
 * Ajustes, Ayuda, el reporte y los menús van en capas encima: nada de eso desplaza el contenido
 * (SC-001).
 */
export function AppShell({ children, overlays }: { children: ReactNode; overlays?: ReactNode }) {
  return (
    <div className="app">
      <TopBar />
      <IndicatorStrip />
      <main>{children}</main>
      <Drawer />
      {overlays}
    </div>
  );
}
