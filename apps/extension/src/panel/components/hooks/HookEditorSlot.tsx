import { Suspense, lazy } from "react";
import { t } from "../../../shared/i18n.ts";
import type { RuleEditorSlotProps } from "../rules/editor-slots.ts";

// El editor (CodeMirror) y el Worker de tipos van en un chunk aparte (FR-019, SC-007).
const HookEditor = lazy(() => import("./HookEditor.tsx"));

/** Contenido ancho del editor de reglas para la acción "Modificar con hook" (006). */
export function HookEditorSlot(props: RuleEditorSlotProps) {
  if (props.form.action.kind !== "hook") return null;
  return (
    <Suspense fallback={<p className="muted hook-loading">{t("hook_editor_loading")}</p>}>
      <HookEditor {...props} />
    </Suspense>
  );
}
