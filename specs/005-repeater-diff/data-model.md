# Data Model: Repeater y diff de respuestas (005)

Schemas Zod en `packages/domain/src/schemas/repeater.ts` y `diff.ts` (TDD). Los límites nuevos
van a `LIMITS` (`schemas/limits.ts`). Tipos de 002 reutilizados: `Header`, `BodyInfo`,
`CapturedExchange`, `CorsDiagnosis`, `RuleEffect`.

## Límites nuevos (`LIMITS`)

| Clave | Valor | Origen |
|---|---|---|
| `repeaterTabsMax` | 20 | FR-021 |
| `repeaterSendsMax` | 50 | FR-021 |
| `repeaterTabNameMax` | 60 | Nombre visible |
| `repeaterHeadersMax` | 100 | Como `editHeadersMax` de 002 |
| `ignoreEndpointsMax` | 500 | R10 |
| `ignoreEntriesMax` | 100 | R10 |
| `diffChangesMax` | 50,000 | R7 (corte con `truncated`) |
| `diffLineEditsMax` | 20,000 | R8 |

`bodyBytes` (5 MB), `urlMax` y los de headers son los de 002.

## RepeaterRequest

| Campo | Tipo | Reglas |
|---|---|---|
| `method` | string | `/^[A-Za-z]+$/`, 1–64 caracteres (como el editor de pausados) |
| `url` | string | URL absoluta `http:`/`https:`, ≤ `LIMITS.urlMax` |
| `headers` | `{ name, value, enabled }[]` | ≤ `repeaterHeadersMax`; nombre válido de header HTTP; solo los `enabled` se envían |
| `body` | `RepeaterBody` | ver abajo |

`RepeaterBody` (unión discriminada por `kind`):

| `kind` | Campos | Uso |
|---|---|---|
| `none` | `reason?: "unavailable" \| "evicted" \| "tooLarge"` | Sin body, o el original no se conserva (FR-002a: aviso) |
| `text` | `text` (≤ 5 MB en UTF-8) | Editable |
| `original` | `base64`, `contentType: string \| null`, `size` (≤ 5 MB) | Binario reenviado intacto, no editable (R16) |

El SW vuelve a validar `RepeaterRequest` en `repeaterSend` (R15). `forbiddenHeaders(headers)`
devuelve los nombres que el navegador no deja fijar (R6); la lista es la misma en los dos modos.

## RepeaterSend (un envío del historial)

| Campo | Tipo | Reglas |
|---|---|---|
| `sendId` | UUID | Lo genera el panel; el SW lo usa como marca (R2) |
| `request` | `RepeaterRequest` | Copia de lo enviado |
| `mode` | `"page" \| "clean"` | Modo efectivo |
| `startedAt` | número (ms) | |
| `state` | `"pending" \| "done" \| "failed" \| "cancelled"` | Transiciones abajo |
| `response` | `RepeaterResponse \| null` | Solo con `done`, o con `failed` si la captura vio la respuesta (CORS, R3) |
| `error` | `{ code, messageKey, params? } \| null` | Con `failed`/`cancelled` |
| `durationMs` | número \| null | |
| `size` | número \| null | Bytes del body recibido |
| `preflight` | `{ status: number \| null, blocked: boolean } \| null` | FR-016 |
| `ruleEffects` | `RuleEffect[]` | Solo contexto de página (FR-010a) |
| `relaxed` | boolean | La relajación CORS de 003 actuó |
| `cors` | `CorsDiagnosis \| null` | Bloqueo CORS (003) |
| `notSentHeaders` | string[] | Headers prohibidos (R6) |
| `exchangeId` | string \| null | Intercambio de Tráfico (solo contexto de página) |

Transiciones de `state`: `pending → done` (respuesta completa), `pending → failed` (red, CORS,
`context_lost`, `timeout`, `permission_denied`, validación del SW), `pending → cancelled`
(Cancelar). No hay vuelta atrás.

Códigos de `error.code`: `invalid_request`, `not_attached`, `context_lost`, `network`,
`cors_blocked`, `permission_required`, `permission_denied`, `timeout`, `cancelled`,
`body_too_large`.

## RepeaterResponse

| Campo | Tipo | Reglas |
|---|---|---|
| `status` | entero 0–999 | |
| `headers` | `Header[]` | ≤ 500 (como 002) |
| `body` | `{ encoding: "text", text } \| { encoding: "none", info: BodyInfo }` | Texto ≤ 5 MB; binario/grande/no disponible solo `BodyInfo` (FR-015) |
| `mimeType` | string \| null | |

## RepeaterTab (solo en memoria del panel, FR-020a)

| Campo | Tipo | Reglas |
|---|---|---|
| `id` | UUID | |
| `name` | string | 1–`repeaterTabNameMax`; por defecto `MÉTODO /ruta` |
| `mode` | `"page" \| "clean"` | Nueva ⇒ `"page"` (FR-009) |
| `draft` | `RepeaterRequest` | Lo que hay en el editor |
| `source` | `{ exchangeId, request: RepeaterRequest, response: ComparableResponse } \| null` | Request capturado de origen y su respuesta (FR-002) |
| `sends` | `RepeaterSend[]` | Más reciente primero; ≤ `repeaterSendsMax` |
| `droppedCount` | entero ≥ 0 | Envíos descartados por el límite (FR-021) |
| `pasted` | `{ text } \| null` | Respuesta pegada, ≤ 5 MB (FR-022a) |

Duplicar copia `name` (con sufijo), `mode` y `draft`; no copia `sends`, `source` ni `pasted`
(FR-020).

## ComparableResponse (lado de un diff)

| Campo | Tipo | Reglas |
|---|---|---|
| `origin` | `{ kind: "original" } \| { kind: "send", sendId } \| { kind: "pasted" }` | Procedencia |
| `status` | entero \| null | `null` en la pegada |
| `headers` | `Header[] \| null` | `null` en la pegada |
| `body` | `{ kind: "text", text, contentType } \| { kind: "unavailable", reason, size }` | `reason`: `binary`, `tooLarge`, `evicted`, `none` |

## DiffResult

| Campo | Tipo | Notas |
|---|---|---|
| `status` | `{ before, after } \| null` | `null` si no cambió o un lado es pegado |
| `headers` | `HeaderChange[]` | `{ kind, name, before?, after?, sensitive }`; nombres en minúsculas |
| `body` | `BodyDiff` | ver abajo |
| `ignored` | `{ headers: HeaderChange[], body: JsonChange[] }` | Fuera del recuento (FR-028) |
| `total` | entero | Cambios no ignorados |
| `notes` | `("json_expected" \| "body_not_compared" \| "truncated")[]` | Avisos (FR-026, FR-027) |

`BodyDiff` (por `mode`):

| `mode` | Contenido |
|---|---|
| `json` | `changes: JsonChange[]`, `arrays: { path, criterion: "id" \| "_id" \| "uuid" \| "key" \| "index" }[]` (FR-025a), `truncated` |
| `lines` | `hunks: { beforeStart, afterStart, lines: { op: "+" \| "-" \| " ", text, sensitive }[] }[]`, `truncated` |
| `metadata` | `before: { size, reason }`, `after: { size, reason }` |
| `equal` | sin cambios en el body |

`JsonChange` = `{ kind: "added" | "removed" | "changed", path: PathSegment[], before?, after?,
sensitive }`. `PathSegment` = `{ key: string } | { index: number } | { idField, id }`;
`formatPath` ⇒ `$.a.b[2]`, `$.items[id=42].price`, claves no identificadoras entre corchetes y
comillas (`$["x-y"]`).

Invariantes probadas: `diffResponses(a, a).total === 0`; intercambiar lados invierte
`added`/`removed`; reordenar claves de objeto o elementos con identidad no produce cambios; un
cambio de tipo es un solo `changed`; ningún cambio `sensitive` lleva el valor real tras
`redactDiff`.

## IgnoreList (persistida, R10)

`chrome.storage.local["nahual.repeater.ignores.v1"]`:

```text
{ version: 1, endpoints: { [endpointKey: sha256 hex]: { paths: PathPattern[], headers: string[], usedAt: number } } }
```

- `endpointKey = sha256("<MÉTODO> <origen><ruta>")`, sin query ni fragmento.
- `PathPattern` = segmentos como `PathSegment`, más `{ any: true }` para "cualquier elemento" de
  un array.
- ≤ `ignoreEndpointsMax` endpoints (se descarta el de `usedAt` más antiguo) y ≤
  `ignoreEntriesMax` entradas por endpoint. Lectura con schema: inválido ⇒ lista vacía y aviso
  `repeater_ignores_invalid`.
- Nunca contiene valores, URLs ni headers con su valor (prueba en `storage-privacy.spec.ts`).

## Funciones de dominio nuevas

| Función | Archivo | Cubre |
|---|---|---|
| `repeaterRequestFromExchange(exchange, body)` | `repeater/from-exchange.ts` | FR-002, FR-002a, nombre por defecto |
| `validateRepeaterRequest(req)` | `repeater/validate.ts` | FR-007 (issues por campo) |
| `forbiddenHeaders(headers)` | `repeater/forbidden-headers.ts` | FR-008, R6 |
| `endpointKeyInput(method, url)` | `repeater/endpoint.ts` | R10 (el hash lo calcula el SW) |
| `diffJson`, `diffLines`, `diffResponses` | `diff/*.ts` | FR-024 a FR-027, R7–R9 |
| `applyIgnores(result, ignores)` | `diff/ignores.ts` | FR-028 |
| `redactDiff(result)`, `isSensitiveName(name)` | `diff/redact.ts`, `sensitive.ts` | FR-030, R11 |
| `formatPath(segments)` | `diff/path.ts` | Rutas legibles |
