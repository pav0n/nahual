import type { Issue } from "@nahual/protocol";
import type { ComponentType } from "react";
import { HookEditorSlot } from "../hooks/HookEditorSlot.tsx";
import type { RuleForm } from "./rule-form.ts";

/** Lo que recibe un contenido ancho del editor de reglas (006: el editor de código del hook). */
export interface RuleEditorSlotProps {
  form: RuleForm;
  setForm(form: RuleForm): void;
  issues: Issue[];
  /** Guarda la regla (p. ej. Ctrl/Cmd+S dentro del editor de código). */
  onSave(): void;
}

/**
 * Contenido ancho extra del editor de reglas (004, FR-027): 006 pone el editor de código de los
 * hooks. El gancho del build de pruebas añade uno de 900 px (research R13).
 */
export const RULE_EDITOR_SLOTS: ComponentType<RuleEditorSlotProps>[] = [HookEditorSlot];
