# Contrato: archivo de hook `.ts` (FR-035 a FR-038)

Un archivo de texto UTF-8, TypeScript válido, de hasta 100 KB.

```ts
/* @nahual-hook 1
{
  "name": "Lista vacía en /api/items",
  "stage": "response",
  "prefilter": { "kind": "glob", "pattern": "*\/api/items*" },
  "resourceTypes": ["Fetch", "XHR"],
  "conditions": [{ "kind": "status", "op": "eq", "value": 200 }]
}
*/
import type { HookContext } from "./nahual-hooks"; // opcional, para el editor del dev

export default (ctx: HookContext) => {
  const data = ctx.json<{ items: unknown[] }>();
  data.items = [];
  ctx.response!.body = JSON.stringify(data);
  return ctx;
};
```

## Reglas

- **Bloque de configuración**: debe ser el primer comentario del archivo y empezar exactamente con
  `/* @nahual-hook 1`. Su contenido hasta `*/` es JSON validado con `HookFileConfigSchema`
  (`name`, `stage`, `prefilter`, `resourceTypes`, `conditions`, con los schemas de `Rule`; `name`
  1–80 como `Rule.name`).
- **`*/` dentro del JSON**: cerraría el comentario (un glob como `*/api/*` es habitual).
  `serializeHookFile` escribe toda `/` precedida de `*` como `\/`, un escape válido de JSON que
  `JSON.parse` devuelve como `/`; el patrón importado es idéntico al exportado.
- **Sin bloque o bloque inválido**: se avisa del motivo y se importa solo el código (FR-036).
- **Nunca se exportan** permisos, sitio, `id`, `order`, `enabled` ni `check`.
- **`import type` de `./nahual-hooks`**: se admite y se elimina al ejecutar (solo tipos); el
  archivo de tipos descargado se llama `nahual-hooks.d.ts`. Cualquier otro `import` es un error.
- **Rechazo** (FR-038): > 100 KB, no es UTF-8 válido, no se puede leer, o el código supera el
  total de 5 MB de hooks.
- `serializeHookFile(rule)` y `parseHookFile(text)` (hook-runtime) son inversas: exportar e
  importar devuelve la misma configuración y el mismo código (prueba de ida y vuelta).
