import { Suspense, lazy, type ComponentType } from "react";
import { t } from "../../shared/i18n.ts";

/** Sección de Ajustes que se carga al abrirla, con el mismo estado de carga que el editor de 006. */
export function lazySection(load: () => Promise<{ default: ComponentType }>): ComponentType {
  const Section = lazy(load);
  return function LazySection() {
    return (
      <Suspense fallback={<p className="muted">{t("export_generating")}</p>}>
        <Section />
      </Suspense>
    );
  };
}
