import type { Stage } from "@nahual/domain";

export type HookTemplateId = "addHeader" | "changeJsonField" | "emptyList";

export interface HookTemplate {
  id: HookTemplateId;
  stage: Stage;
}

/** Plantillas de inicio (FR-017): la etapa y el código, con comentarios en `es` o `en`. */
export const HOOK_TEMPLATES: readonly HookTemplate[] = [
  { id: "addHeader", stage: "request" },
  { id: "changeJsonField", stage: "response" },
  { id: "emptyList", stage: "response" },
];

const COMMENTS: Record<HookTemplateId, Record<"es" | "en", string>> = {
  addHeader: {
    es: "// Añade un header a cada request que cumple la regla.",
    en: "// Adds a header to every request that matches the rule.",
  },
  changeJsonField: {
    es: "// Cambia un campo del JSON de la respuesta; el resto sigue siendo la respuesta real.",
    en: "// Changes one field of the JSON response; the rest stays the real response.",
  },
  emptyList: {
    es: "// Vacía la lista de la respuesta para probar el estado vacío de tu interfaz.",
    en: "// Empties the list in the response to test your UI's empty state.",
  },
};

const BODIES: Record<HookTemplateId, string> = {
  addHeader: `export default (ctx: HookContext) => {
  ctx.setHeader("x-debug", "nahual");
  return ctx;
};
`,
  changeJsonField: `export default (ctx: HookContext) => {
  if (!ctx.response) return;
  const data = ctx.json<Record<string, unknown>>();
  data.status = "error";
  ctx.response.body = JSON.stringify(data);
  return ctx;
};
`,
  emptyList: `export default (ctx: HookContext) => {
  if (!ctx.response) return;
  const data = ctx.json<{ items?: unknown[] }>();
  data.items = [];
  ctx.response.body = JSON.stringify(data);
  return ctx;
};
`,
};

/** Código de una plantilla con sus comentarios en el idioma del panel. */
export function templateSource(id: HookTemplateId, lang: "es" | "en"): string {
  return `${COMMENTS[id][lang]}\n${BODIES[id]}`;
}

/** Hook de ejemplo al elegir la acción (US1-1): no cambia nada y muestra la firma. */
export const EXAMPLE_HOOK = `export default (ctx: HookContext) => {
  return ctx;
};
`;
