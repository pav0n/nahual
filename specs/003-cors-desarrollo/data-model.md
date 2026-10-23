# Data Model: CORS de desarrollo

Tipos nuevos de 003. Viven en `packages/domain/src/cors/` y `packages/domain/src/schemas/`, con
schemas Zod (validación en el receptor, principio I). Amplían los de
[002](../002-captura-intercept/data-model.md) sin cambiar los existentes salvo donde se indica.

## Primitivas

| Tipo | Regla |
|---|---|
| `Origin` | `esquema://host[:puerto]` normalizado: minúsculas, sin puerto por defecto, sin ruta ni barra final; esquema `http` o `https`; ≤ 256 caracteres; sin `*`, `?` ni `\`. `"null"` no es un `Origin` válido |
| `HeaderName` | token HTTP (RFC 9110), ≤ 128 caracteres, en minúsculas |
| `ProductionOriginEntry` | `Origin` exacto o patrón `esquema://*.dominio[:puerto]` (un solo `*`, al inicio del host, seguido de `.` y al menos un dominio con punto) |
| `RelaxationDuration` | `15 \| 60 \| 240 \| 480` minutos |

## CorsCause

`missing_allow_origin` · `origin_mismatch` · `method_not_allowed` · `header_not_allowed` ·
`preflight_status` · `wildcard_with_credentials` · `missing_allow_credentials` ·
`preflight_redirect` · `unrecognized`. Mapeo desde `corsError` en [research R3](./research.md#r3-detección-y-clasificación-de-bloqueos-cors).

## CorsDiagnosis

Asociado a un intercambio bloqueado (FR-003–FR-007). Se calcula en el SW al recibir
`loadingFailed` y viaja en `ExchangeUpdate.cors`.

| Campo | Tipo | Notas |
|---|---|---|
| `cause` | `CorsCause` | |
| `browserCode` | string ≤ 64 | `corsError` tal cual (se muestra con `unrecognized`) |
| `failedParameter` | string ≤ 256 \| null | Header, método u origen concreto |
| `atPreflight` | boolean | El fallo fue en el preflight |
| `appOrigin` | `Origin` \| null | `null` ⇒ no relajable (R4) |
| `apiOrigin` | `Origin` | Origen de la URL del request |
| `method` | string | |
| `requestedHeaders` | `HeaderName[]` ≤ 50 | No safelisted, sin los que pone el navegador |
| `credentials` | `"yes" \| "no" \| "unknown"` | R5 |
| `responseStatus` | int \| null | Del request real, si hubo respuesta |
| `preflightStatus` | int \| null | Si se observó el preflight (R6) |
| `serverCorsHeaders` | `Header[]` ≤ 20 | Solo `Access-Control-*` recibidos |
| `preflightExchangeId` | string \| null | Relación (FR-006) |
| `relaxable` | boolean | |
| `notRelaxableReason` | `"null_origin" \| "same_origin" \| "unrecognized" \| "production"` \| undefined | `production` se recalcula en el panel con la lista vigente |

## CorsRelaxedInfo

En un intercambio al que la relajación cambió algo (FR-026). Viaja en `ExchangeUpdate.cors`.

| Campo | Tipo | Notas |
|---|---|---|
| `relaxationId` | uuid | |
| `added` | `Header[]` ≤ 10 | Headers puestos por Nahual (valores no sensibles: orígenes, métodos, nombres) |
| `removed` | `Header[]` ≤ 20 | `Access-Control-*` del servidor reemplazados |
| `preflightReplaced` | boolean | El preflight del servidor fallaba y se respondió 204 |
| `serverStatus` | int | Status original del servidor |
| `alreadyValid` | boolean | El servidor ya respondía bien (caso límite: "puedes apagarla") |
| `errorKey` | string ≤ 128 \| undefined | Clave i18n si aplicar la relajación falló; la respuesta continuó sin modificar (FR-027) |

## Relaxation

Vive solo en memoria del SW por pestaña (FR-017). El panel recibe `RelaxationView`.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | uuid | |
| `tabId` | int | Pestaña donde se creó; nunca cambia |
| `appOrigin` | `Origin` | |
| `apiOrigin` | `Origin` | Distinto de `appOrigin`; único por pestaña |
| `exposeHeaders` | `HeaderName[]` ≤ 30 | Vacío por defecto |
| `credentials` | boolean | De la casilla "La app envía credenciales" (premarcada con el diagnóstico) o aprendido (R5) |
| `createdAt` / `expiresAt` | epoch ms | `expiresAt − createdAt = duración` ≤ 8 h |
| `state` | `"active" \| "suspended" \| "idle"` | Calculado: `suspended` con `globalPaused`; `idle` sin frames del origen de la app |

**Transiciones**: creada ⇒ `active` ⇄ `suspended` (pausar Nahual) ⇄ `idle` (navegación) ⇒
**terminada** con `endCause`: `expired | user | detached | production | restart`. Terminada no
vuelve; se crea otra.

**Validación al crear** (`validateRelaxation`, FR-008–FR-023, FR-029): orígenes válidos y no
`null`; `appOrigin ≠ apiOrigin`; ninguno coincide con la lista de producción (el issue nombra la
entrada); lista de producción legible (R12); duración en `RelaxationDuration`; < 10 activas en la
pestaña; `apiOrigin` no relajado ya; `exposeHeaders` válidos y sin `*`. Issues como en 002:
`{ path, messageKey }` sin valores sensibles.

**Garantía** (`computeRelaxedHeaders`): nunca produce `*` en `Allow-Origin`, `Allow-Methods`,
`Allow-Headers` ni `Expose-Headers`, ni `Allow-Credentials` con comodín (FR-010, FR-011).

## Settings (ampliado)

Clave `nahual.settings.v1` sin cambio de versión: `parseSettings` lee campo a campo y los campos
nuevos toman su valor por defecto si faltan ([contracts/storage.md](./contracts/storage.md)).

| Campo nuevo | Tipo | Default |
|---|---|---|
| `corsDefaultDurationMinutes` | `RelaxationDuration` | `480` |
| `productionOrigins` | `ProductionOriginEntry[]` ≤ 100, sin duplicados | `[]` |

Lectura de `productionOrigins`: entradas inválidas ⇒ se conservan las válidas, se marca
`productionOriginsInvalid` en memoria y **se bloquea relajar** hasta guardar la lista (R12).

## CorsReport

Calculado en el panel al pedirlo; no se guarda (FR-032–FR-037).

| Campo | Tipo |
|---|---|
| `apiOrigin` | `Origin` |
| `appOrigins` | `Origin[]` |
| `methods` | string[] |
| `requestedHeaders` | `HeaderName[]` |
| `credentials` | boolean |
| `suggestedMaxAgeSeconds` | `600` |
| `causes` | `{ cause: CorsCause, count: int }[]` |
| `endpoints` | `"MÉTODO /ruta"[]` ≤ 50, sin query string |
| `relaxedInBrowser` | boolean (para el aviso de FR-036) |

`Framework` = `express | nestjs | aws_api_gateway | cloud_run`.

## Cambios en tipos de 002

- `ExchangeUpdate.kind` suma `"cors"`; `ExchangeUpdate` suma `cors?: { diagnosis?:
  CorsDiagnosis; relaxed?: CorsRelaxedInfo }`.
- `CapturedExchange` suma `appOrigin: Origin | null` y `cors` (opcional).
- `computeFetchPatterns` recibe `relaxedApiOrigins: Origin[]` (R11).
- `LIMITS` suma `relaxationsPerTab: 10`, `productionOriginsMax: 100`,
  `exposeHeadersMax: 30`, `reportEndpointsMax: 50`.
