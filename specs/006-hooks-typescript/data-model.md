# Data Model: Hooks en TypeScript (006)

Tipos de `packages/hook-runtime` (puro, sin `chrome.*`) y ampliaciones de `packages/domain`. Los
schemas Zod son la fuente; los tipos salen con `z.infer`. Los límites viven en `LIMITS`.

## Límites (`LIMITS`, domain)

| Clave | Valor | Origen |
|---|---|---|
| `hookSourceBytesMax` | 102,400 (100 KB) | FR-034, archivo importado |
| `hookTotalBytesMax` | 5,242,880 (5 MB) | FR-034, clarificación |
| `hookTimeoutMs` | 2,000 | FR-020 |
| `hookStateBytesMax` | 1,048,576 (1 MB) | FR-008 |
| `hookStateAttempts` | 3 (intentos en total) | FR-009 |
| `hookSuspendAfterErrors` | 5 | FR-022 |
| `hookConsoleEntriesMax` | 1,000 | FR-027 |
| `hookLogEntryChars` | 10,240 | FR-027 |
| `hookWorkerIdleMs` | 60,000 | R2 |
| `bodyBytes` | 5 MB (de 002) | FR-006, FR-011 |

## Acción `hook` (domain, `schemas/action.ts`)

Nuevo miembro de `ActionSchema` (discriminado por `kind`):

| Campo | Tipo | Reglas |
|---|---|---|
| `kind` | `"hook"` | |
| `source` | string | ≤ `hookSourceBytesMax` bytes UTF-8 |
| `imported` | boolean | `true` al importar; el dev no lo cambia |
| `permissions.changeDestination` | boolean | `false` por defecto y al importar (FR-010) |
| `permissions.readSensitive` | boolean | `false` por defecto y al importar (FR-004) |
| `check.hash` | string | FNV-1a de `source` en hex (`hashSource`) |
| `check.ok` | boolean | sin errores de sintaxis ni de tipo en el último análisis |

**Reglas del almacén** (`rule-store`, FR-016, FR-034, FR-037):

- La suma de `source` de todas las reglas con hook ≤ `hookTotalBytesMax`; si no, error
  `hook_error_total_size` con `[usado, límite]`.
- `enabled: true` exige `check.ok && check.hash === hashSource(source)`; si no,
  `hook_error_not_checked`.
- La acción `hook` vale en etapa Request y Response.
- Al importar: `enabled: false`, `imported: true`, permisos en `false`.

## `HookContextData` (hook-runtime, lo que viaja al sandbox)

Solo datos (clonables). Las utilidades las añade el runtime del Worker (contracts/hook-api.md).

| Campo | Tipo | Notas |
|---|---|---|
| `stage` | `"request" \| "response"` | solo lectura |
| `resourceType` | string | solo lectura |
| `site` | string | origen de la página; solo lectura |
| `request.method` | string | editable en etapa Request |
| `request.url` | string | editable en etapa Request; el origen exige `changeDestination` |
| `request.headers` | `{ name, value }[]` | sensibles con `MASK` sin `readSensitive` |
| `request.body` | `HookBody` | editable en etapa Request |
| `request.graphql` | `{ operationName: string \| null } \| null` | solo lectura |
| `response` | `{ status, headers, body: HookBody } \| null` | en etapa Response; editable |

`HookBody`:

- `{ kind: "text", text: string, json?: unknown }`: `json` solo si el texto es JSON válido.
- `{ kind: "binary" | "tooLarge" | "none", contentType: string | null, size: number | null }`.

## `HookOutcome` (worker → sandbox → panel)

| Variante | Campos |
|---|---|
| `ok` | `context` (`HookContextData` devuelto o el original si la función no devuelve nada), `respond?` (`{ status, headers, body }`, solo etapa Request), `state?` (si cambió), `logs: string[]`, `durationMs` |
| `error` | `type`: `exception` · `invalid_result` · `timeout` · `state_conflict` · `state_too_large` · `access_denied`; `message`; `line?`; `field?`; `logs`; `durationMs` |

`access_denied`: un `TypeError`/`SecurityError` de un global bloqueado (red, `chrome`, `parent`…)
o una violación de CSP que el runtime reconoce; se muestra como "acceso no permitido".

## `HookEffect` (hook-runtime, resultado validado de un hook)

- `unchanged`
- `edit`: `{ parts: ("method" | "url" | "headers" | "body" | "status")[], request?, response? }`
  con los valores ya combinados (`mergeMasked`)
- `respond`: `{ status, headers, body }` (etapa Request)
- `error`: `{ type, message, line?, field? }`

## Cadena

| Entidad | Campos |
|---|---|
| `HookChainItem` | `ruleId`, `ruleName`, `source`, `permissions` |
| `HookRun` (evento `hookRun`) | `runId`, `exchangeId`, `stage`, `chain: HookChainItem[]`, `context: HookContextData` sin enmascarar (el panel enmascara por hook según sus permisos) |
| `HookRunResult` (comando `hookResult`) | `runId`, `final`: `unchanged` · `edit` · `respond`, `executions: HookExecutionSummary[]` |
| `HookExecutionSummary` | `ruleId`, `result`: `hooked` · `hook_unchanged` · `hook_failed` · `hook_responded` · `hook_skipped_suspended`, `durationMs`, `errorType?` |

**Plegado** (`foldChain`, puro): `actual = contexto original`; por cada hook no suspendido:
ejecutar con `actual` ⇒ si `edit`, `actual = aplicado`; si `respond`, terminar; si `error`,
seguir con `actual`. `final` es la diferencia entre `actual` y el original (o el `respond`).

## `HookState` (panel, memoria)

| Campo | Tipo | Reglas |
|---|---|---|
| `value` | objeto JSON | ≤ `hookStateBytesMax` al guardar |
| `version` | entero | +1 en cada guardado |

Transiciones: guardar si `version` coincide; si no, repetir (3 intentos en total); vaciar con
"Vaciar estado" (`value = {}`, `version + 1`) y `restore` de la copia anterior con "Deshacer"
(10 s); al cerrar el panel se pierde.

## `HookExecution` (panel, memoria) y consola

| Entidad | Campos |
|---|---|
| `HookExecution` | `id`, `runId`, `exchangeId`, `ruleId`, `ruleName`, `stage`, `result`, `durationMs`, `parts`, `from?`/`to?` (destino si cambió), `logs: string[]`, `error?` |
| `ConsoleEntry` | `id`, `at`, `level`: `log` · `error`, `text`, `ruleId`, `ruleName`, `request: { method, url }`, `exchangeId`, `count` (repeticiones consecutivas agrupadas), `read`, `revealed?` (valores reales redactados, solo memoria) |
| `HookSuspension` | `ruleId`, `consecutiveErrors`, `suspended`, `lastError` |

Ejecuciones por intercambio: las de los intercambios que siguen en el historial de 002 (2,000 por
pestaña); al salir un intercambio del historial, sus ejecuciones también.

## Archivo de hook (`.ts`)

Ver [contracts/hook-file.md](./contracts/hook-file.md). `HookFileConfig`: `name` (1–80, `LIMITS.ruleNameMax`, mismo schema que `Rule.name`),
`stage`, `prefilter`, `resourceTypes`, `conditions` (mismos schemas que `Rule`). Sin permisos, sin
sitio, sin `id` ni `order`.
