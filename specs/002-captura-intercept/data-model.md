# Data Model: Captura de tráfico e intercept condicional

Los tipos de dominio se definen como schemas Zod en `packages/domain` (fuente única) y los
reutilizan `packages/protocol` (mensajes) y el SW (storage). `DebuggerSession` de
[001](../001-spike-cdp/data-model.md) sigue igual; `InterceptionConfig` e
`InterceptionPattern` de 001 se reemplazan por `Rule` y el cálculo de patrones (research R3).

Límites comunes: URL ≤ 8,192 caracteres; nombre de header ≤ 256 (token RFC 9110); valor de header
≤ 8,192 sin CR/LF (como 001); regex ≤ 512; body evaluable ≤ 5 MB.

## Rule

| Campo | Tipo | Regla |
|---|---|---|
| `id` | uuid | Identidad; único |
| `site` | origin (`https://host:puerto`) | Obligatorio; origen no opaco (FR-014a) |
| `name` | string | 1–80 caracteres |
| `enabled` | boolean | |
| `order` | entero ≥ 0 | Posición en la lista del sitio; menor = mayor prioridad (FR-016) |
| `prefilter` | `{ kind: "glob" \| "regex", pattern: string }` | `pattern` 1–2,048 (glob) o 1–512 (regex); regex compilable sin banderas `g`/`y`; vacío ⇒ inválido. `*` = todo |
| `methods` | `HttpMethod[]` | Vacío = todos; sin duplicados |
| `resourceTypes` | `ResourceType[]` | Vacío = todos; valores de `Network.ResourceType` (`Document`, `XHR`, `Fetch`, `Script`, …) |
| `stage` | `"request" \| "response"` | |
| `conditions` | `Condition[]` | 0–20; todas deben cumplirse (Y); cada una válida para `stage` |
| `action` | `Action` | Ver abajo; `Mock`, `Fail`, `Delay`, `Pause`, `Log` |
| `createdAt`, `updatedAt` | epoch ms | |

Unicidad: `id`. Dos reglas pueden tener el mismo nombre. `order` se renumera 0..n-1 por sitio al
reordenar, eliminar o restaurar.

## Condition (unión discriminada por `kind`)

| `kind` | Etapas | Campos | Operadores |
|---|---|---|---|
| `method` | request | `values: HttpMethod[]` (1–9) | en la lista |
| `header` | ambas | `name` (sin distinguir mayúsculas), `op`, `value?` | `exists`, `notExists`, `equals`, `contains`, `matches` |
| `query` | request | `name`, `op`, `value?` | los de `header` |
| `jsonPath` | ambas | `path` (JSONPath RFC 9535 compilable, ≤ 1,024), `op`, `value?` | `exists`, `notExists`, `equals`, `notEquals`, `contains`, `matches`, `empty`, `notEmpty`, `lt`, `lte`, `gt`, `gte` |
| `graphqlOperation` | ambas | `op`, `value` | `equals`, `notEquals`, `matches` |
| `graphqlErrors` | response | `present: boolean` | — |
| `status` | response | `op` + `value` \| `range: [min, max]` \| `list: int[]` | `eq`, `ne`, `lt`, `lte`, `gt`, `gte`, `between` (inclusivo), `in` |

Validación (FR-013): `value` obligatorio salvo `exists`/`notExists`/`empty`/`notEmpty`; status en
100–599; `min ≤ max`; `list` de 1–50 códigos; numéricos de `jsonPath` exigen un número; `matches`
exige regex compilable ≤ 512. Semántica de JSONPath y GraphQL: research R5 y R6.

## Action (unión discriminada por `kind`)

| `kind` | Campos | Regla |
|---|---|---|
| `pause` | — | Entra en la cola |
| `mock` | `status` (100–599), `headers: Header[]` (≤ 100), `body: string`, `bodyEncoding: "text" \| "base64"` | `body` ≤ 1 MB en reglas guardadas |
| `fail` | `errorReason` | `failed`, `aborted`, `timedOut`, `connectionRefused`, `nameNotResolved`, `accessDenied`, `internetDisconnected` |
| `delay` | `ms` | entero 1–60,000 |
| `log` | — | Solo marca la entrada |

## Settings (`nahual.settings.v1`)

| Campo | Tipo | Regla |
|---|---|---|
| `pauseTimeoutSeconds` | entero | 5–300; 60 por defecto (FR-022) |
| `globalPaused` | boolean | "pausar Nahual"; `false` por defecto (FR-017) |
| `onboardingSeen` | boolean | `false` por defecto |
| `attachConsent` | boolean | `true` tras el primer adjunto explícito (FR-027a) |
| `autoAttach` | boolean | `true` por defecto; aplica solo con `attachConsent` |

Valores fuera de rango o un objeto inválido al leer ⇒ se usan los valores por defecto campo a
campo y se avisa.

## Template

Constante en `packages/domain` (no se persiste): `id`, clave i18n del nombre y una `RuleDraft`
(una `Rule` sin `id`, `site`, `order` ni fechas). Las cuatro de FR-018; `mock503` y `slow3s` tienen
`prefilter.pattern` vacío y exigen completarlo.

## CapturedExchange (memoria del panel)

| Campo | Tipo | Regla |
|---|---|---|
| `id` | string | `requestId` de Network; `#n` por salto de redirección (research R2) |
| `seq` | entero | Orden de inicio dentro de la pestaña |
| `method`, `url`, `resourceType` | | URL ≤ 8,192 (se trunca con indicación) |
| `isPreflight` | boolean | `method === "OPTIONS"` con `Access-Control-Request-Method` |
| `requestHeaders`, `responseHeaders` | `Header[]` | Los de `ExtraInfo` cuando existen |
| `status` | entero \| null | null mientras está pendiente |
| `state` | `"pending" \| "complete" \| "failed"` | `failed` con `errorText` |
| `encodedSize`, `decodedSize` | bytes \| null | Lista: transferido; detalle: ambos |
| `startedAt`, `durationMs` | | `durationMs` al completar |
| `mimeType` | string \| null | |
| `bodyInfo` | `{ request, response }: { available, size, binary, tooLarge, reason? }` | Sin contenido; el body se pide bajo demanda |
| `ruleEffects` | `RuleEffect[]` | Una por etapa como máximo |

`RuleEffect`: `{ stage, ruleId, ruleName, result }`, con `result` en `paused`, `continued`,
`modified`, `mocked`, `failed`, `aborted`, `delayed`, `logged`, `timed_out`,
`discarded_navigation`, `continued_on_detach`, `queue_full`, `unevaluable` (+ `reason`),
`apply_failed` (+ `errorKey`).

Búfer: 2,000 por pestaña (FR-005), FIFO; el panel marca `atCap` al descartar.

## PausedItem (SW, y su vista en el panel)

| Campo | Tipo | Regla |
|---|---|---|
| `pausedId` | string | `Fetch.requestId`; único en la pestaña |
| `exchangeId` | string | Enlace al `CapturedExchange` |
| `stage` | `"request" \| "response"` | |
| `ruleId`, `ruleName` | | Regla que pausó |
| `pausedAt`, `expiresAt` | epoch ms | `expiresAt = pausedAt + timeout` vigente al pausar |
| `request` | `{ method, url, headers, body? }` | `body` presente si ≤ 5 MB y textual |
| `response` | `{ status, headers, body? }` \| null | Solo en etapa Response |
| `state` | `"paused" \| "resolving" \| "resolved"` | |

**Transiciones**

```text
paused ──resolve(continue | continueUnchanged | mock | abort)──▶ resolving ──▶ resolved(outcome)
paused ──timeout──────────────────────────────────────────────▶ resolved(timed_out)
paused ──navegación (pausedAt < commit)───────────────────────▶ resolved(discarded_navigation)
paused ──detach / cierre / panel cerrado───────────────────────▶ resolved(continued_on_detach)
resolving ──error CDP──▶ reintento sin cambios ──▶ resolved(apply_failed)
```

Solo la primera transición desde `paused` cuenta (idempotente). Cola: ≤ 100 por pestaña en orden
de `pausedAt` (FR-023); el item 101 continúa sin cambios con `queue_full`.

## PausedEdit (comando del panel)

- Request: `{ method?, url?, headers?: Header[] (reemplazo completo, ≤ 100), body?: string }`.
- Response: `{ status?, headers?, body? }`.
- Mock desde la cola: `Action.mock` con `body` ≤ 5 MB.
- Los headers sensibles que el dev no tocó viajan con su valor real (FR-004b): el panel envía la
  lista completa con los valores originales, nunca la máscara.

## Relaciones

- `Rule` 1—N `RuleEffect` (por referencia `ruleId`; borrar una regla no borra efectos pasados).
- `CapturedExchange` 1—0..2 `PausedItem` (uno por etapa).
- `Settings` 1 global; `Rule` N por `site`.
