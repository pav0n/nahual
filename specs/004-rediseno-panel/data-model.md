# Data Model: Rediseño del panel

El rediseño no cambia los datos de 002 y 003 (`Exchange`, `Rule`, `PausedItem`, `Settings`,
`Relaxation`) ni el protocolo v3. Añade estructuras **del panel** para organizar la interfaz y
una función pura del dominio.

## Dominio (`packages/domain`)

### `ruleDraftFromExchange(exchange) ⇒ RuleDraft` (R7)

| Campo del borrador | Valor |
|---|---|
| `name` | `"<MÉTODO> <ruta>"`, recortado a `LIMITS.ruleNameMax` |
| `enabled` | `true` (no tiene efecto hasta que el dev guarda) |
| `prefilter` | `{ kind: "glob", pattern: "<origen><ruta>*" }`; los caracteres especiales del glob de 002 (`*`, `?`, `\`) en la URL se escapan con `\`; sin la query (la cubre el `*` final); longitud ≤ `LIMITS.globMax` (si no cabe, se recorta la ruta y se termina en `*`) |
| `methods` | `[exchange.method]` |
| `resourceTypes` | `[exchange.resourceType]` si es uno de `RESOURCE_TYPES`, si no `[]` |
| `stage` | `"response"` si el request no lleva body (`requestBody` sin body: `reason` `none`) y tuvo respuesta (`status` no nulo); si no, `"request"` |
| `conditions` | `[]` |
| `action` | `{ kind: "pause" }` |

Invariante probada: el resultado pasa `RuleDraftSchema` para cualquier `Exchange` válido y su
prefiltro coincide con la URL del exchange de origen.

## Panel (`apps/extension/src/panel`)

### `PanelSection`

| Campo | Tipo | Regla |
|---|---|---|
| `id` | `"traffic" \| "rules" \| "paused"` (005 añade `"repeater"`) | Único |
| `labelKey` | clave i18n | `es` y `en` |
| `count` | `(state) ⇒ number \| null` | `null` o `0` ⇒ no se muestra (FR-011) |
| `countTone` | `"neutral" \| "attention"` | Pausados > 0 ⇒ `attention` |

Reemplaza `PanelTab = "traffic" | "rules" | "queue"` del store `ui`. `queue` pasa a `paused`.

### `StatusItem` (indicador de la barra)

| Campo | Tipo | Regla |
|---|---|---|
| `id` | `"session"` (006 añade `"hookConsole"`, 007 `"profile"`) | Único |
| `render` | componente | Texto + icono, nunca solo color (FR-012) |
| `menu` | acciones opcionales | El estado de sesión abre `Menu` con Soltar / Adjuntar / Reconectar |

### `StripItem` (franja de indicadores) — orden fijo (R9)

| Orden | Tipo | Origen | Se cierra |
|---|---|---|---|
| 1 | Nahual en pausa | `settings.globalPaused` | Con "Reanudar" |
| 2 | CORS relajado | `relaxations` (003) | Con "Apagar" o al terminar |
| 3+ | Aviso o error | `notices`, `lastError` | Con "Cerrar"; > 2 ⇒ grupo "N avisos" |

### `RequestAction` (R6)

| Campo | Tipo | Regla |
|---|---|---|
| `id` | `"createRule" \| "relaxCors"` (005 `"sendToRepeater"`, 007 `"export"`) | Único; define el orden |
| `labelKey` | clave i18n | |
| `shortcut` | `ShortcutId?` | Debe existir en `SHORTCUTS` |
| `appliesTo(exchange, ctx)` | función pura | `createRule`: siempre. `relaxCors`: `exchange.cors?.diagnosis` y sin relajación activa que cubra `appOrigin ⇒ apiOrigin` |
| `run(exchange, ctx)` | efecto | `createRule`: abre Reglas con `ruleDraftFromExchange`; `relaxCors`: abre la confirmación de 003 en el detalle |

`ctx` lleva lo que la aplicabilidad necesita del store (relajaciones, pausados, estado de
sesión), nunca `chrome.*`.

### `BatchAction` (lugar reservado, FR-028)

| Campo | Tipo | Regla |
|---|---|---|
| `id` | string | 007 añade `"exportMany"` |
| `labelKey` | clave i18n | |
| `minSelected` | number | ≥ 2 |

Sin `BatchAction` registradas, la lista no ofrece selección múltiple.

### `SettingsSection`

`id`: `"general" | "pause" | "cors" | "shortcuts"` (007 añade `"profiles"` y `"data"`); cada una
con `labelKey` y su componente. El orden del arreglo es el de la navegación del diálogo.

### `Shortcut` (R12)

| Campo | Tipo | Regla |
|---|---|---|
| `id` | `ShortcutId` | Único |
| `keys` | `{ code, alt, shift, ctrl, meta }` o tecla simple (`/`) | Única entre todas; no reservada por DevTools |
| `descriptionKey` | clave i18n | Se lista en Ajustes ⇒ Atajos y en Ayuda |
| `scope` | `"global" \| "list" \| "rules"` | `global` se ignora mientras se escribe en un campo |

### `UiPrefs` (R3, `localStorage` `nahual.ui.v1`)

| Campo | Tipo | Default | Regla |
|---|---|---|---|
| `version` | `1` | `1` | Otra versión ⇒ defaults |
| `split.traffic` | número 0.2–0.8 | `0.5` | Fracción del ancho para la lista de tráfico (panel izquierdo) |
| `split.rules` | número 0.2–0.8 | `0.34` | Fracción del ancho para la lista de reglas (panel izquierdo) |
| `split.paused` | número 0.2–0.8 | `0.34` | Fracción del ancho para la lista de pausados (panel izquierdo) |
| `drawerHeight` | entero 120–600 | `180` | Px del cajón inferior (sin uso visible hasta 006) |

Inválido o ausente ⇒ default campo por campo (FR-034). Nunca contiene URLs, headers ni bodies.

## Estados

- **Detalle de un exchange**: pestaña inicial según el caso (FR-018): `cors` si
  `exchange.cors?.diagnosis`; `edit` si tiene un `PausedItem` activo; si no `headers`. Si el
  pausado vence o se resuelve con el detalle abierto ⇒ `headers` y aviso de 002.
- **Ajustes, campo**: `saved` ⇒ (edita) `dirty` ⇒ (confirma) `saving` ⇒ `saved` | `invalid`;
  `invalid` ⇒ (cierra el diálogo) `saved` con el valor anterior (clarificación 2).
- **Divisor**: `idle` ⇒ `dragging` | `keyboard` ⇒ `idle` y persiste `UiPrefs`.
