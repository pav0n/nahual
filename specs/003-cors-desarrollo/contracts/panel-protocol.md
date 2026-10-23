# Contrato: protocolo panel ↔ service worker (v3)

Evolución de [002 v2](../../002-captura-intercept/contracts/panel-protocol.md). Se mantienen el
transporte, la verificación de remitente, `hello` primero, el sobre, los límites de tamaño y las
garantías de v2. `PROTOCOL_VERSION` pasa a `3` sin compatibilidad con v2 (panel y SW se empaquetan
juntos): un mensaje `v: 2` se descarta como inválido.

Tipos de dominio (`CorsDiagnosis`, `CorsRelaxedInfo`, `RelaxationView`, `Settings`) en
[data-model.md](../data-model.md).

## Panel → SW: comandos nuevos

| `type` | `payload` | Efecto |
|---|---|---|
| `relaxCors` | `{ appOrigin, apiOrigin, durationMinutes: 15 \| 60 \| 240 \| 480, exposeHeaders: HeaderName[], credentials: boolean }` | Crea una relajación en la pestaña del puerto. El SW valida todo con `validateRelaxation` contra **sus** ajustes (lista de producción, legibilidad) y sus relajaciones; no confía en el panel. Responde `ack` + `relaxations`, o `error relaxation_invalid` con `issues[]` |
| `endRelaxation` | `{ relaxationId?: uuid }` | Termina una relajación (o todas si falta el id) con causa `user`. Idempotente: un id ya terminado responde `ack` |

`updateSettings` acepta los campos nuevos (`corsDefaultDurationMinutes`, `productionOrigins`). Al
guardar `productionOrigins`, el SW normaliza, valida cada entrada (`issues` con el índice) y
termina las relajaciones que coinciden.

## SW → Panel: eventos nuevos o ampliados

| `type` | `payload` | Cuándo |
|---|---|---|
| `relaxations` | `{ items: RelaxationView[] }` | Tras `hello`, al crear, terminar o cambiar de estado (`active`/`suspended`/`idle`) |
| `exchanges` | como v2; `ExchangeUpdate` suma `kind: "cors"` con `cors: { diagnosis?, relaxed? }` | Al clasificar un bloqueo y al relajar una respuesta |
| `state` | v2 + `relaxationCount` | Como v2 |
| `notice` | v2; `messageKey` nuevas: `cors_ended_expired`, `cors_ended_detached`, `cors_ended_production`, `cors_ended_restart`, `cors_production_list_invalid`, `cors_credentials_learned` | Fin de una relajación por una causa distinta del dev, lista de producción ilegible, credenciales aprendidas (R5) |

`RelaxationView` = `{ id, appOrigin, apiOrigin, exposeHeaders, credentials, createdAt,
expiresAt, state }` (sin `tabId`: el puerto ya es de la pestaña).

`cors_ended_restart` lo emite el **panel** para sí mismo: tras reconectar con un SW nuevo, si
tenía relajaciones y `relaxations` llega vacío.

## Códigos de error nuevos

`relaxation_invalid` (con `issues`: `app_origin_invalid`, `app_origin_null`,
`api_origin_invalid`, `same_origin`, `production_origin` con `params.entry`,
`production_list_invalid`, `duration_invalid`, `limit_reached`, `already_relaxed`,
`expose_header_invalid`), `not_attached` (relajar sin debugger adjunto).

## Garantías verificadas por pruebas

- Las de v2.
- `relaxCors` con un origen de producción, `null`, igual al de la app, una duración fuera de la
  lista o un 11.º origen ⇒ `error` y **ninguna** llamada a `Fetch.enable` ni relajación creada.
- `relaxCors` desde el puerto de la pestaña A nunca crea una relajación en la pestaña B (el
  `tabId` lo pone el SW a partir del remitente, nunca el payload).
- Ningún `CorsRelaxedInfo` ni `RelaxationView` contiene `*` en headers de permiso.
- Un fallo al relajar emite `CorsRelaxedInfo` con `errorKey` y `added: []`.
- `CorsDiagnosis` y `CorsRelaxedInfo` solo llevan headers `Access-Control-*` y nombres de
  headers; nunca valores de `Cookie`, `Authorization` ni otros sensibles.
