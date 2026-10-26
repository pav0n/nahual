# Contrato: API de un hook (`HookContext`)

Lo que ve el dev al escribir un hook. La fuente es
`packages/hook-runtime/src/hook-context.d.ts`: la usa el editor para autocompletado y tipos y es
el archivo que descarga "Descargar tipos" (FR-039). Cambiarlo es un cambio de contrato.

## Firma

```ts
export default (ctx: HookContext) => HookContext | void | Promise<HookContext | void>;
```

- Devolver `ctx` (modificado o no) o `undefined` (sin cambios). Cualquier otro valor ⇒
  `invalid_result`.
- Tiempo máximo: 2 s, contando la parte asíncrona y los intentos por `state` (FR-009, FR-020);
  no cuenta la preparación del entorno aislado.
- `log()` redacta por defecto los valores con nombre sensible (FR-030).

## `HookContext`

```ts
interface HookContext {
  readonly stage: "request" | "response";
  readonly resourceType: string;           // "Fetch", "XHR", "Document", …
  readonly site: string;                   // origen de la página inspeccionada
  request: HookRequest;                    // en etapa Response, solo lectura
  response: HookResponse | null;           // null en etapa Request
  state: Record<string, unknown>;          // compartido; solo valores JSON; ≤ 1 MB
  log(...values: unknown[]): void;         // a la consola de hooks, como texto
  json<T = unknown>(): T;                  // body JSON de la etapa; lanza si no es JSON válido
  setHeader(name: string, value: string): void;    // en la parte de la etapa
  removeHeader(name: string): void;
  readonly graphql: { readonly operationName: string | null } | null;
  respond(init: { status: number; headers?: Record<string, string>; body?: string | object }): void;
  // solo etapa Request: responde sin llegar al servidor (FR-010)
}

interface HookRequest {
  method: string;
  url: string;                              // cambiar el origen exige el permiso de destino
  headers: Record<string, string>;          // nombres en minúsculas
  body: string | null;                      // null si no es texto (ver bodyInfo)
  readonly bodyInfo: BodyInfo;
}

interface HookResponse {
  status: number;
  headers: Record<string, string>;
  body: string | null;
  readonly bodyInfo: BodyInfo;
}

interface BodyInfo {
  readonly kind: "text" | "binary" | "tooLarge" | "none";
  readonly contentType: string | null;
  readonly size: number | null;
}
```

Notas:

- **Headers como objeto** con nombres en minúsculas para que `ctx.request.headers["x-a"] = "1"`
  funcione; el runtime los convierte a la lista de 002 conservando el orden y el uso de mayúsculas
  originales de los que no cambian. Un header repetido llega unido con `", "`, salvo
  `set-cookie`, que se une con `"\n"` y se vuelve a separar al aplicar.
- **Valores sensibles** sin el permiso "Puede leer valores sensibles": llegan como `"••••••"`.
  Dejarlos así conserva el original; asignar otro valor lo reemplaza; `removeHeader` lo quita
  (FR-004).
- **`json()`** devuelve una copia; para cambiar el body JSON: `const d = ctx.json(); d.x = 1;
  ctx.response.body = JSON.stringify(d)`. Las plantillas lo muestran.
- **Body no textual**: `body` es `null` y `bodyInfo` dice por qué; asignar un texto reemplaza al
  original (FR-006).
- **`respond()` en etapa Response** ⇒ `invalid_result`.
- **Globales**: solo los de ECMAScript (`JSON`, `Math`, `Date`, `URL`, `URLSearchParams`,
  `TextEncoder`, `crypto.getRandomValues`, `structuredClone`, `console` redirigido a `log`). Red,
  `chrome`, DOM, `import`/`require` y `Worker` no existen o lanzan `access_denied` (FR-031).
- **Sintaxis**: TypeScript de una función; `enum`, decoradores e `import` son errores (R3).

## Plantillas (FR-017)

| Id | Etapa | Qué hace |
|---|---|---|
| `addHeader` | Request | `ctx.setHeader("x-debug", "nahual")` |
| `changeJsonField` | Response | lee `ctx.json()`, cambia `data.status = "error"`, vuelve a asignar el body |
| `emptyList` | Response | `data.items = []` (o el array de primer nivel vacío) |

Cada plantilla trae comentarios cortos en el idioma del panel y exige prefiltro antes de guardar,
como las de 002.
