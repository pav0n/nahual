---
description: "Lista de tareas de 003-cors-desarrollo"
---

# Tasks: CORS de desarrollo

**Input**: Design documents from `/specs/003-cors-desarrollo/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/panel-protocol.md,
contracts/storage.md, contracts/manifest.md, quickstart.md

**Tests**: obligatorias. La constitución (principio IV, NO NEGOCIABLE) exige TDD en
`packages/domain`: cada prueba se escribe, se ejecuta y **falla** antes de su implementación. Lo
mismo aplica a las pruebas de integración del SW con CDP simulado. Las garantías de aislamiento
CORS tienen E2E que intentan violarlas.

**Organization**: una fase por historia, en el orden de la entrada: US1 entender (P1), US2
desbloquear (P1), US3 reporte (P2). Cada historia incluye sus pruebas E2E, la revisión axe y un
checkpoint demostrable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: se puede hacer en paralelo (archivos distintos, sin dependencias pendientes)
- **[USn]**: tarea de la historia de usuario n
- Rutas relativas a la raíz del repo, según la estructura de `plan.md`
- "Prueba primero" = escribir la prueba, verla fallar y solo entonces implementar

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: fixture de tres orígenes, fakes ampliados, control del tiempo en pruebas y los
experimentos de Chrome que confirman el diseño (research X1, X2, X4).

- [X] T001 [P] Subir la versión a `0.3.0` en `apps/extension/package.json` y comprobar que `apps/extension/tests/dist/manifest.test.ts` sigue exigiendo solo `["debugger", "storage"]`, sin host permissions ni `alarms`, `declarativeNetRequest*`, `tabs` o `clipboardWrite` (contracts/manifest.md, FR-040)
- [X] T002 [P] Ampliar `apps/extension/e2e/fixtures/servers.ts` con un tercer origen C y las rutas CORS de la API (origen B) de `specs/003-cors-desarrollo/quickstart.md`: `/cors/none`, `/cors/mismatch` (`Allow-Origin: https://otro.example`), `/cors/preflight-401` (`PUT`; el `OPTIONS` responde 401), `/cors/preflight-redirect` (el `OPTIONS` responde 302), `/cors/method` (preflight sin el método pedido), `/cors/header` (preflight sin `x-custom`), `/cors/wildcard-credentials` (`Allow-Origin: *`), `/cors/no-credentials` (origen exacto sin `Allow-Credentials`), `/cors/ok` (CORS correcto con `Expose-Headers` vacío y un header `x-total`), `/cors/sensitive` (sin CORS; recibe `Authorization`, cookie, `?token=` y body con secretos); registrar en `/received` cada request **incluidos los `OPTIONS`**; `/blocked` en la API (200 con CORS correcto) para la prueba de "no es CORS" con una regla de 002 "Fallar"; en el origen C una ruta `/cors/none` igual y una página HTML con un enlace de vuelta a la SPA; SPA (origen A) con botones `data-testid` para cada ruta con y sin `credentials: "include"`, uno hacia el origen C y un `<iframe>` del origen C que llama a `/cors/none` de B
- [X] T003 [P] Añadir el puerto `4312` (origen C) a `apps/extension/e2e/fixtures/serve.ts` e imprimirlo
- [X] T004 [P] Ampliar `apps/extension/tests/fakes/fake-debugger.ts` y `apps/extension/tests/fakes/cdp-events.ts`: `Network.loadingFailed` con `corsErrorStatus: { corsError, failedParameter }` y con `blockedReason`; `Page.frameNavigated` de subframes con `securityOrigin` y `parentId`; `Page.frameDetached`; `Fetch.requestPaused` con `frameId` y preflights `OPTIONS` con `Access-Control-Request-Method/Headers`; `Network.requestWillBeSent` con `initiator: { type: "preflight", requestId }`
- [X] T005 [P] Añadir `__nahualCorsTimeScale` en `apps/extension/src/background/test-hooks.ts` (solo build `--mode test`, como `__nahualFaults`): factor que divide la duración de las relajaciones; ampliar `apps/extension/tests/dist/no-network.test.ts`, junto a la comprobación de `__nahualFaults`, para fallar si el texto `__nahualCorsTimeScale` aparece en el build de producción (research R16)
- [X] T006 [P] Escribir el experimento X1 en `apps/extension/e2e/experiments/x1-cors-credentials.spec.ts` con `cdp-lab.ts`: request a `/cors/no-credentials` con `credentials: "include"` con cookie y sin cookie; registrar si `Fetch.requestPaused` (etapa Response) trae `Cookie` en `request.headers` y si `Network.requestWillBeSentExtraInfo` del mismo `networkId` llega antes que la etapa Response (research R5)
- [X] T007 [P] Escribir el experimento X2 en `apps/extension/e2e/experiments/x2-preflight-network.spec.ts`: con `Network.enable` desde la extensión, `PUT` a `/cors/preflight-401` y a `/cors/ok`; registrar si llega `Network.requestWillBeSent` del preflight, su `type` e `initiator` (`type: "preflight"`, `requestId`), y su `responseReceived`/`loadingFailed` (research R6); además, con `Fetch.enable` `{ urlPattern: "<API>/*", requestStage: "Response" }`, registrar si los `OPTIONS` de `/cors/preflight-401` y `/cors/preflight-redirect` llegan a `Fetch.requestPaused` en etapa Response (con `responseStatusCode` 401 y 302) y si `Fetch.fulfillRequest` 204 sobre ellos hace que el `PUT` continúe (experimento X5, research R1)
- [X] T008 [P] Escribir el experimento X4 en `apps/extension/e2e/experiments/x4-network-headers.spec.ts`: `Fetch.continueResponse` con headers `Access-Control-*` cambiados y registrar qué headers reportan `Network.responseReceived` y `responseReceivedExtraInfo` (research R7)
- [X] T009 Ejecutar T006–T008 (`EXPERIMENTS=1 pnpm --filter @nahual/extension e2e`) y registrar X1, X2, X4 y X5 en "Resultados por registrar" de `specs/003-cors-desarrollo/research.md`; si un resultado cambia una decisión (fuente de `Cookie` en R5, relación del preflight en R6, preflight en etapa Response en R1), actualizar R1/R5/R6 antes de seguir; si X5 es negativo, añadir a T012 y T015 el patrón de etapa Request para `OPTIONS` del respaldo (research R11)

**Checkpoint**: `pnpm lint && pnpm typecheck && pnpm test` en verde; experimentos registrados.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: orígenes, schemas, ajustes ampliados, patrones de Fetch, protocolo v3, orígenes por
frame y el estado CORS del panel. Nada de historia funciona sin esto.

**⚠️ CRITICAL**: ninguna historia empieza antes de terminar esta fase.

### Dominio (prueba primero)

- [X] T010 [P] Prueba primero `packages/domain/tests/cors/origin.test.ts`: `parseOrigin` normaliza (minúsculas, sin puerto por defecto, sin ruta ni barra final), acepta solo `http`/`https`, rechaza `"null"`, `*`, `?`, `\` y > 256 caracteres; `parseProductionEntry` acepta origen exacto o `esquema://*.dominio[:puerto]` ("un solo `*`, al inicio del host, seguido de `.` y al menos un dominio con punto") y rechaza el resto; `matchProductionOrigin(origin, list)` devuelve la entrada: el patrón coincide con subdominios de cualquier nivel con el mismo esquema y puerto y **no** con el dominio raíz (clarificación, FR-028)
- [X] T011 [P] Prueba primero en `packages/domain/tests/schemas.test.ts`: `Settings` con `corsDefaultDurationMinutes` (`15 | 60 | 240 | 480`, default `480`) y `productionOrigins` ("≤ 100 entradas, sin duplicados", normalizadas); `parseSettings` de ajustes de 002 sin esos campos ⇒ defaults sin `invalidFields`; lista con una entrada inválida ⇒ conserva las válidas y marca `productionOriginsInvalid: true`; schemas `CorsCause`, `CorsDiagnosis`, `CorsRelaxedInfo` y `RelaxationView` con los límites de `specs/003-cors-desarrollo/data-model.md` (`requestedHeaders` ≤ 50, `serverCorsHeaders` ≤ 20, `added` ≤ 10, `removed` ≤ 20, `errorKey` ≤ 128, `exposeHeaders` ≤ 30, `browserCode` ≤ 64, `failedParameter` ≤ 256); `ExchangeUpdate` con `kind: "cors"` y `CapturedExchange.appOrigin`
- [X] T012 [P] Prueba primero en `packages/domain/tests/fetch-patterns.test.ts`: `relaxedApiOrigins` añade `{ urlPattern: "<origen>/*", requestStage: "Response" }` por origen, y también `requestStage: "Request"` para los orígenes con preflight que redirige (resultado de X5); un `*` de Response de una regla los absorbe; con `globalPaused` no se añaden; sin reglas ni relajaciones ⇒ `[]` (research R11)
- [X] T013 Implementar `packages/domain/src/cors/origin.ts` (T010)
- [X] T014 Implementar en `packages/domain/src/schemas/settings.ts`, `packages/domain/src/schemas/exchange.ts`, `packages/domain/src/schemas/limits.ts` (`relaxationsPerTab: 10`, `productionOriginsMax: 100`, `exposeHeadersMax: 30`, `reportEndpointsMax: 50`) y `packages/domain/src/cors/schemas.ts` lo de T011
- [X] T015 Implementar `relaxedApiOrigins` en `packages/domain/src/fetch-patterns.ts` (T012) y exportar lo nuevo en `packages/domain/src/index.ts`

### Protocolo v3 (prueba primero)

- [X] T016 Prueba primero en `packages/protocol/tests/panel-to-sw.test.ts` y `packages/protocol/tests/sw-to-panel.test.ts`: `PROTOCOL_VERSION = 3` y `v: 2` descartado; `relaxCors` (`durationMinutes` solo 15/60/240/480, `exposeHeaders` ≤ 30 nombres válidos), `endRelaxation` (`relaxationId?`), `updateSettings` con los campos nuevos; eventos `relaxations`, `state.relaxationCount`, `exchanges` con `kind: "cors"`, nuevos `messageKey` de `notice` y códigos `relaxation_invalid` y `not_attached` (contracts/panel-protocol.md)
- [X] T017 Implementar v3 en `packages/protocol/src/panel-to-sw.ts`, `packages/protocol/src/sw-to-panel.ts` y `packages/protocol/src/envelope.ts`

### Service worker y panel

- [X] T018 [P] Prueba primero `apps/extension/tests/integration/frame-origins.test.ts`: `Page.frameNavigated` de frame principal y subframes llena `frameId ⇒ origin` (con `securityOrigin`, o el origen de `url`); `frameDetached` lo quita; al soltar o cerrar se vacía; `originOf(tabId, frameId)` desconocido ⇒ `null`; `hasOrigin(tabId, origin)` para el estado `idle` (research R4)
- [X] T019 Implementar `apps/extension/src/background/frame-origins.ts` y conectarlo en `apps/extension/src/background/app.ts` (eventos `Page.*` y `onSessionEnded`)
- [X] T020 [P] Prueba primero en `apps/extension/tests/integration/settings-store.test.ts`: lectura con los campos nuevos; `productionOrigins` con entrada corrupta ⇒ `notice cors_production_list_invalid` y `productionListReadable() === false` hasta que el dev guarde la lista; `updateSettings` normaliza y devuelve `issues` con el índice de la entrada inválida (contracts/storage.md, research R12)
- [X] T021 Implementar lo de T020 en `apps/extension/src/background/settings-store.ts`
- [X] T022 [P] Crear `apps/extension/src/panel/store/cors.ts` (relajaciones recibidas, `hadRelaxationsBeforeReconnect`) y manejar `relaxations`, `state.relaxationCount` y `exchanges kind "cors"` en `apps/extension/src/panel/store/dispatch.ts` y `apps/extension/src/panel/store/traffic.ts` (el intercambio guarda `cors.diagnosis` y `cors.relaxed`); prueba en `apps/extension/tests/unit/traffic-store.test.ts`
- [X] T023 Actualizar `apps/extension/src/panel/sw-client.ts` y `apps/extension/src/background/panel-port.ts` a v3 sin cambios de comportamiento; `pnpm test` en verde

**Checkpoint**: `pnpm lint && pnpm typecheck && pnpm test` en verde; cobertura ≥ 85% en `packages/*`; `pnpm build && pnpm verify:dist` en verde; la extensión carga y funciona como 002.

---

## Phase 3: User Story 1 - Entender un error de CORS (Priority: P1) 🎯 MVP

**Goal**: los requests bloqueados por CORS se marcan en la lista y el detalle explica la causa,
qué pidió la app y qué respondió el servidor, sin modificar tráfico.

**Independent Test**: con el panel adjunto, pulsar cada botón `/cors/*` de la SPA y verificar la
marca, el filtro y la explicación de cada causa; ninguna relajación activa.

### Dominio (prueba primero)

- [X] T024 [P] [US1] Prueba primero `packages/domain/tests/cors/classify.test.ts`: tabla con **cada** valor de `corsError` de research R3 ⇒ su `CorsCause`, `atPreflight` correcto y `failedParameter` conservado; comodín (`*`) en métodos o headers con credenciales ⇒ `method_not_allowed`/`header_not_allowed` con parámetro `*`; valor desconocido (`"SomethingNew"`) ⇒ `unrecognized` con `browserCode`; `relaxable` falso con `appOrigin` `null` (`null_origin`), igual al de la API (`same_origin`) o causa `unrecognized`; `serverCorsHeaders` solo `Access-Control-*`; `credentials` `"yes"` con `Cookie` en el request crudo o causa de credenciales, `"no"`/`"unknown"` en el resto (research R5)
- [X] T025 [P] [US1] Prueba primero `packages/domain/tests/cors/request-headers.test.ts`: `requestedHeaders` devuelve nombres en minúsculas, sin duplicados, ≤ 50, solo los no safelisted (un `content-type: application/json` sí, `text/plain` no) y sin los que pone el navegador (`origin`, `cookie`, `referer`, `user-agent`, `host`, `connection`, `sec-*`, `accept-encoding`…)
- [X] T026 [P] [US1] Prueba primero `packages/domain/tests/cors/link-preflight.test.ts`: `linkPreflights` relaciona por `initiatorRequestId` si existe; si no, misma URL, `Access-Control-Request-Method` igual al método, preflight que empieza ≤ 5 s después y el más cercano; sin candidato ⇒ sin relación (research R6)
- [X] T027 [US1] Implementar `packages/domain/src/cors/classify.ts` (T024)
- [X] T028 [P] [US1] Implementar `packages/domain/src/cors/request-headers.ts` (T025)
- [X] T029 [P] [US1] Implementar `packages/domain/src/cors/link-preflight.ts` (T026)

### Service worker (prueba primero)

- [X] T030 [US1] Prueba primero en `apps/extension/tests/integration/network-capture.test.ts`: `loadingFailed` con `corsErrorStatus` ⇒ update `kind: "cors"` con `CorsDiagnosis` (causa, `appOrigin` del frame vía `frame-origins`, `apiOrigin`, método, headers solicitados desde los headers crudos, status de la respuesta si la hubo, `Access-Control-*` recibidos); `loadingFailed` sin `corsErrorStatus` o con solo `blockedReason` ⇒ sin `cors`; requests del mismo origen nunca `cors`; preflight observado por Network (según X2) relacionado con `preflightExchangeId` y `preflightStatus`; el diagnóstico nunca incluye valores de `Cookie` ni `Authorization`
- [X] T031 [US1] Implementar la detección en `apps/extension/src/background/network-capture.ts` con `classifyCorsFailure` y `requestedHeaders`; si X2 fue negativo, emitir en `apps/extension/src/background/rule-engine.ts` el intercambio sintético de preflight (`kind: "start"`, `isPreflight: true`) cuando `Fetch` pausa un `OPTIONS` sin intercambio de Network (research R6). _X2 fue positivo: no hace falta el intercambio sintético; la relación sale de `initiator.requestId`_

### Panel

- [X] T032 [P] [US1] Badge "Bloqueado por CORS" con icono y texto (no solo color) en `apps/extension/src/panel/components/traffic/TrafficGrid.tsx`
- [X] T033 [P] [US1] Prueba primero en `packages/domain/tests/filter.test.ts`: los filtros "CORS: bloqueados" y "CORS: relajados" (FR-002)
- [X] T033a [US1] Implementar el filtro en `packages/domain/src/filter.ts` y añadir "CORS: bloqueados" en `apps/extension/src/panel/components/traffic/Filters.tsx` (T033)
- [X] T034 [US1] Crear `apps/extension/src/panel/components/traffic/CorsSection.tsx` y montarla en `apps/extension/src/panel/components/traffic/ExchangeDetail.tsx`: causa en una frase y su solución nombrando header y valor concretos (FR-004); "Qué pidió la app" (origen, método, headers solicitados, credenciales) y "Qué respondió el servidor" (status del preflight o "no observado" con la explicación de research R6, status del request, `Access-Control-*`), con las diferencias marcadas con texto; enlace al preflight relacionado y vuelta; `unrecognized` muestra "Causa no reconocida" y el código; motivo cuando no es relajable (FR-007); todo como texto
- [X] T035 [P] [US1] Añadir las claves de US1 (badge, filtro, 9 causas con explicación y solución, "qué pidió/qué respondió", no relajable, preflight no observado) en `apps/extension/public/_locales/es/messages.json` y `apps/extension/public/_locales/en/messages.json`

### E2E y accesibilidad

- [X] T036 [US1] Escribir `apps/extension/e2e/cors-diagnosis.spec.ts`: cada ruta de T002 ⇒ marca "Bloqueado por CORS" y la causa esperada en el detalle (SC-004: 100% correctas); `/cors/ok` no se marca; `/blocked` fallado por una regla de 002 "Fallar" no se marca como CORS (escenario US1-5); el filtro aísla los bloqueados; en `/cors/header`, "qué pidió" lista `x-custom`; en `/cors/wildcard-credentials`, credenciales "sí"; ningún tráfico modificado (`/received` igual que sin Nahual)
- [X] T037 [US1] Ampliar `apps/extension/e2e/a11y.spec.ts` con la sección CORS (bloqueado, no relajable, causa no reconocida) en tema claro y oscuro a 320 px: sin violaciones serias ni críticas

**Checkpoint US1**: pruebas de US1 en verde; demo: quickstart 1–3 con la extensión cargada.

---

## Phase 4: User Story 2 - Desbloquear para seguir trabajando (Priority: P1)

**Goal**: desde un request bloqueado, 2 clics crean una relajación acotada a pestaña + origen de
la app + origen de la API, visible en un indicador, que expira y desaparece con el debugger.

**Independent Test**: relajar `/cors/preflight-401` y `/cors/no-credentials`; la app funciona;
otra pestaña y un tercer origen siguen bloqueados; la relajación termina al vencer, apagarla,
cerrar la pestaña, soltar el debugger y reiniciar el SW.

### Dominio (prueba primero)

- [X] T038 [P] [US2] Prueba primero `packages/domain/tests/cors/headers.test.ts` para `computeRelaxedHeaders` (research R7): `Allow-Origin` = origen exacto; `Vary: Origin` añadido sin duplicar; `Allow-Credentials: true` solo con credenciales; `Expose-Headers` solo si la lista no está vacía; elimina los `Access-Control-*` del servidor salvo los fijados por el dev; preflight reemplazado ⇒ status 204, `Allow-Methods` = `Access-Control-Request-Method`, `Allow-Headers` = nombres de `Access-Control-Request-Headers` en minúsculas sin duplicados (omitido si no pide headers), `Max-Age: 0`; un `Access-Control-Request-Headers: *` o un nombre inválido ⇒ resultado `not_relaxable`; tabla de combinaciones que verifica que **nunca** aparece `*` en `Allow-Origin`, `Allow-Methods`, `Allow-Headers` ni `Expose-Headers` (FR-010, FR-011, SC-005)
- [X] T039 [P] [US2] Prueba primero en `packages/domain/tests/cors/headers.test.ts` para `preflightPasses` (research R8): 2xx sí, 3xx/4xx no; origen exacto o `*` sin credenciales; credenciales exigen `Allow-Credentials: true`; métodos simples implícitos; `Allow-Methods`/`Allow-Headers` con `*` sin credenciales sí y con credenciales no; `authorization` no cubierto por `*`; mayúsculas ignoradas
- [X] T040 [P] [US2] Prueba primero `packages/domain/tests/cors/relaxation.test.ts`: `validateRelaxation` devuelve cada issue de contracts/panel-protocol.md (`app_origin_invalid`, `app_origin_null`, `api_origin_invalid`, `same_origin`, `production_origin` con `params.entry`, `production_list_invalid`, `duration_invalid`, `limit_reached` con "10 orígenes de API relajados por pestaña", `already_relaxed`, `expose_header_invalid`) y ninguno sin valores sensibles; `applyRelaxation` respeta los nombres `Access-Control-*` que el dev cambió respecto al servidor (FR-024) y marca `alreadyValid` cuando el servidor ya respondía bien; `relaxationState` da `suspended` con `globalPaused`, `idle` sin frames del origen de la app y `active` en el resto
- [X] T041 [US2] Implementar `packages/domain/src/cors/headers.ts` (T038, T039)
- [X] T042 [US2] Implementar `packages/domain/src/cors/relaxation.ts` (T040)

### Service worker (prueba primero)

- [X] T043 [P] [US2] Prueba primero `apps/extension/tests/integration/cors-relaxer.test.ts` con temporizadores falsos: crear valida con los ajustes **del SW** (producción, lista legible) y no con datos del panel; `tabId` siempre del remitente; 11.º origen ⇒ `limit_reached`; origen ya relajado ⇒ `already_relaxed`; `expiresAt − createdAt` = duración y ≤ 8 h; termina con `expired` (temporizador y comprobación por request con el reloj adelantado), `user`, `detached`, `production` (al guardar una entrada que coincide); `globalPaused` ⇒ `suspended`; navegación a otro origen ⇒ `idle` y de vuelta ⇒ `active`; cada cambio emite `relaxations`, recalcula patrones y, salvo `user`, `notice` con la causa; `InvalidAllowCredentials` con relajación activa ⇒ `credentials: true` y `notice cors_credentials_learned` (research R5, R10); con `__nahualCorsTimeScale` la duración se escala
- [X] T044 [P] [US2] Prueba primero en `apps/extension/tests/integration/rule-engine.test.ts` (relajación, research R9): respuesta en el alcance sin regla ⇒ `Fetch.continueResponse` con headers relajados y `responseCode`; preflight 401 ⇒ `Fetch.fulfillRequest` 204 con los headers de T038; preflight que ya pasa ⇒ continúa sin cambios con `alreadyValid`; preflight con 3xx en Response ⇒ la URL se aprende y el siguiente `OPTIONS` a ella se responde con 204 en etapa Request sin llegar al servidor, y los demás requests de esa etapa continúan sin cambios (X5); misma URL desde otra pestaña, desde otro frame con otro origen o hacia un tercer origen ⇒ `continueRequest` sin cambios; regla `pause` que se continúa con `Access-Control-Allow-Origin` editado ⇒ se respeta; `mock` ⇒ headers del mock relajados respetando los del dev; `delay` que se suelta tras vencer ⇒ sin relajar; relajación `suspended` ⇒ sin relajar; fallo inyectado en el relaxer ⇒ continúa sin modificar y `CorsRelaxedInfo` con `errorKey` y `added: []` (FR-027); cada respuesta relajada emite `kind: "cors"` con `added`, `removed`, `preflightReplaced` y `serverStatus` sin valores sensibles
- [X] T045 [P] [US2] Prueba primero en `apps/extension/tests/integration/background.test.ts`: `relaxCors` con origen de producción, `null`, igual al de la app, duración inválida o sin debugger adjunto ⇒ `error` y **ninguna** llamada a `Fetch.enable`; desde el puerto de la pestaña A nunca relaja la B; `endRelaxation` sin id termina todas y con un id ya terminado responde `ack`; al relajar, `Fetch.enable` incluye `<origen de API>/*` en Response y al terminar lo quita; `state.relaxationCount` correcto; los registros del SW no contienen URLs ni valores de headers (logger de 002)
- [X] T046 [US2] Implementar `apps/extension/src/background/cors-relaxer.ts` (T043)
- [X] T047 [US2] Integrar la relajación como último paso de la etapa Response en `apps/extension/src/background/rule-engine.ts` y `apps/extension/src/background/action-executor.ts` (`continueResponse` con headers finales y `responseCode`; `fulfillRequest` 204 para el preflight) (T044)
- [X] T048 [US2] Cablear en `apps/extension/src/background/app.ts`: comandos `relaxCors`/`endRelaxation`, `relaxedApiOrigins` en `applyPatterns`, fin por `onSessionEnded`, por cambio de `productionOrigins` y por `globalPaused`/navegación (estados), evento `relaxations` tras `hello`, `state.relaxationCount` y el aprendizaje de credenciales desde `network-capture.ts` (T045)

### Panel

- [X] T049 [P] [US2] Crear `apps/extension/src/panel/cors-commands.ts` (`relaxCors`, `endRelaxation`, con errores e `issues` como `settings-commands.ts`)
- [X] T050 [US2] En `apps/extension/src/panel/components/traffic/CorsSection.tsx`: botón "Permitir CORS para desarrollo" que despliega en línea el alcance (esta pestaña, origen de la app, origen de la API), la duración (15 min, 1 h, 4 h, 8 h; preseleccionada la de ajustes), los `Expose-Headers` (elegir entre los nombres que ya devolvió ese origen o escribirlos), la casilla "La app envía credenciales" (premarcada si `diagnosis.credentials === "yes"`) y el aviso "solo existe en este navegador"; "Permitir" la crea (2 clics, FR-008, SC-001) y "Cancelar" no crea nada; los `issues` se muestran con su causa (el de producción nombra la entrada); el foco vuelve al botón tras crear o cancelar
- [X] T051 [US2] Mostrar en `apps/extension/src/panel/components/traffic/CorsSection.tsx` la información de un intercambio relajado (FR-026): "CORS relajado por Nahual", headers añadidos y reemplazados, headers originales del servidor, "preflight reemplazado por Nahual" con el status real y "el servidor ya responde bien: puedes apagar la relajación"; y el badge "CORS relajado" en `TrafficGrid.tsx` y el filtro "CORS: relajados" en `Filters.tsx`
- [X] T052 [US2] Crear `apps/extension/src/panel/components/cors/RelaxIndicator.tsx` y montarlo bajo `StatusBar` en todas las vistas: origen de la app, orígenes de API, cuenta regresiva desde `expiresAt` (reutilizar `queue/Countdown.tsx`), estado (activa, suspendida por "pausar Nahual", sin efecto porque la página está en otro origen) con texto e icono, "Apagar" por relajación y "Apagar todas" sin confirmación (FR-019, FR-020); `role="status"` sin anunciar cada segundo
- [X] T053 [P] [US2] Añadir `Alt+Shift+R` ("apagar todas las relajaciones") en `apps/extension/src/panel/use-shortcuts.ts` y en la ayuda de atajos
- [X] T054 [P] [US2] Mostrar los `notice` de fin (`cors_ended_*`, `cors_credentials_learned`) en `apps/extension/src/panel/components/Notices.tsx` y emitir `cors_ended_restart` desde `apps/extension/src/panel/store/cors.ts` al reconectar con relajaciones previas y `relaxations` vacío
- [X] T055 [US2] Ampliar `apps/extension/src/panel/components/SettingsPanel.tsx`: duración por defecto (15 min, 1 h, 4 h, 8 h) y editor de orígenes de producción (añadir, quitar con deshacer vía `Toast`, validación por entrada con mensaje, aviso de lista ilegible) (FR-015, FR-028, FR-031)
- [X] T056 [P] [US2] Añadir las claves de US2 (confirmación, duraciones, alcance, aviso, indicador, estados, avisos de fin, ajustes, issues) en `apps/extension/public/_locales/es/messages.json` y `apps/extension/public/_locales/en/messages.json`

### E2E y accesibilidad

- [X] T057 [US2] Escribir `apps/extension/e2e/cors-relax.spec.ts`: desde el detalle de `/cors/none`, 2 clics y la app recibe 200 (SC-001); `/cors/preflight-401` funciona y `/received` muestra que el servidor recibió el `OPTIONS` y el `PUT`, y el detalle del preflight muestra 401 y "reemplazado"; relajar desde `/cors/preflight-redirect` ⇒ funciona al primer intento y el servidor solo recibe el `PUT` (respaldo de X5); `/cors/no-credentials` y `/cors/wildcard-credentials` con credenciales ⇒ la respuesta que ve la página tiene origen exacto y `Allow-Credentials: true`, nunca `*` (SC-005); `/cors/ok` ⇒ "el servidor ya responde bien"; `Expose-Headers` configurado ⇒ la página lee `x-total`; `/cors/none` con `credentials: "include"` y sin cookie: marcando la casilla funciona al primer intento; apagar con `Alt+Shift+R` y repetir **de inmediato** ⇒ bloqueado (experimento X3, FR-013); "pausar Nahual" ⇒ suspendida y bloqueado; origen de producción ⇒ aviso con la entrada y sin relajación; añadir la entrada con una activa ⇒ termina con aviso
- [X] T058 [US2] Escribir `apps/extension/e2e/cors-isolation.spec.ts` (SC-002): con la relajación A ⇒ B activa en la pestaña 1, (a) la misma SPA en la pestaña 2 con el panel adjunto sigue bloqueada con el mismo `corsError`; (b) desde la pestaña 1, el botón hacia el origen C sigue bloqueado; (c) el `<iframe>` del origen C de la pestaña 1 que llama a B sigue bloqueado; (d) la pestaña 2 no muestra indicador
- [X] T059 [US2] Escribir `apps/extension/e2e/cors-lifecycle.spec.ts` (SC-003), con `__nahualCorsTimeScale` para que 15 min duren segundos: (a) vence ⇒ indicador fuera, aviso "vencida" y el request vuelve a bloquearse; (b) "Soltar" ⇒ termina con aviso; (c) cerrar el panel y reabrirlo (adjunto automático) ⇒ sin relajación y bloqueado; (d) cerrar la pestaña ⇒ nada aplica en una pestaña nueva; (e) detener el SW (`ServiceWorker.stopWorker`, como `sw-restart.spec.ts`) ⇒ el panel reconecta, muestra el aviso de reinicio, sin indicador y el request se bloquea; (f) con la relajación activa, navegar la pestaña a la página del origen C ⇒ el indicador muestra "sin efecto"; volver a la SPA (origen A) antes de vencer ⇒ "activa" y el request funciona; en los casos (a)–(e) `Fetch` ya no intercepta el origen de la API
- [X] T060 [US2] Ampliar `apps/extension/e2e/a11y.spec.ts`: **revisión axe del indicador** (activa, suspendida, sin efecto, con 1 y con 10 orígenes), de la confirmación en línea, del detalle relajado y de los ajustes de producción, en tema claro y oscuro a 320 px; el indicador y "Apagar" se operan solo con teclado

**Checkpoint US2**: pruebas de US2 en verde; demo: quickstart 4–10 con la extensión cargada, incluido el aislamiento con una segunda pestaña.

---

## Phase 5: User Story 3 - Reporte para backend (Priority: P2)

**Goal**: un texto copiable con lo que backend debe configurar, sin valores sensibles y con
ejemplos por framework.

**Independent Test**: provocar bloqueos contra la API (con credenciales, `x-custom`, preflight
401, `Authorization` y cookie sembradas), generar el reporte con Express y copiarlo.

### Dominio (prueba primero)

- [X] T061 [P] [US3] Prueba primero `packages/domain/tests/cors/report.test.ts`: `buildCorsReport(exchanges, apiOrigin)` reúne orígenes de app, métodos, headers solicitados (sin los del navegador), credenciales, causas con conteo, endpoints `MÉTODO /ruta` sin query string, deduplicados y "≤ 50", `suggestedMaxAgeSeconds: 600` y `relaxedInBrowser`; ignora intercambios de otros orígenes de API; con tokens sembrados en `Authorization`, `Cookie`, query (`?token=`) y body, **ningún** valor aparece en `renderCorsReport` (FR-035, SC-006); `renderCorsReport` toma sus textos de `t` e incluye el aviso de "solo en este navegador" (FR-036)
- [X] T062 [P] [US3] Prueba primero `packages/domain/tests/cors/snippets.test.ts`: ejemplos para `express`, `nestjs`, `aws_api_gateway` y `cloud_run` con los orígenes exactos, métodos y headers del reporte; con credenciales nunca `*` y con `credentials: true`; `cloud_run` indica que CORS se configura en la app o en el gateway; los datos solo entran como valores validados (origen, token de header, método)
- [X] T063 [US3] Implementar `packages/domain/src/cors/report.ts` (T061)
- [X] T064 [US3] Implementar `packages/domain/src/cors/snippets.ts` (T062)

### Panel

- [X] T065 [US3] Crear `apps/extension/src/panel/components/cors/CorsReport.tsx`: `<dialog>` nativo abierto desde `CorsSection.tsx` ("Generar reporte para backend") y desde `RelaxIndicator.tsx` ("Reporte"), con el origen de API, selector de framework opcional, `<textarea readonly>` con el texto, aviso visible y estado vacío que explica cómo provocar requests bloqueados (FR-032–FR-037)
- [X] T066 [US3] Implementar "Copiar" en `apps/extension/src/panel/components/cors/CorsReport.tsx`: `navigator.clipboard.writeText`, si falla seleccionar el `textarea` y `document.execCommand("copy")` dentro del gesto, y si también falla un aviso para copiar con `Ctrl+C` (research R14)
- [X] T067 [P] [US3] Añadir las claves de US3 (secciones del reporte, aviso, frameworks, copiar, estado vacío) en `apps/extension/public/_locales/es/messages.json` y `apps/extension/public/_locales/en/messages.json`

### E2E y accesibilidad

- [X] T068 [US3] Escribir `apps/extension/e2e/cors-report.spec.ts`: tras `/cors/sensitive`, `/cors/header` (con credenciales) y `/cors/preflight-401`, el reporte de la API lista el origen A, `PUT`, `x-custom`, credenciales, `Max-Age` 600, las causas y los endpoints sin query; con Express incluye el ejemplo; "Copiar" deja el texto en el portapapeles (permisos de Playwright); ningún valor sembrado (token, cookie, body) aparece en el texto (SC-006); sin bloqueos ⇒ estado vacío
- [X] T069 [US3] Ampliar `apps/extension/e2e/a11y.spec.ts` con el diálogo del reporte (con datos y vacío) en ambos temas a 320 px; foco atrapado en el diálogo y devuelto al cerrar

**Checkpoint US3**: pruebas de US3 en verde; demo: quickstart 11.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T070 [P] Ampliar `apps/extension/e2e/storage-privacy.spec.ts`: tras una sesión con relajaciones, `chrome.storage.local` solo tiene `nahual.rules.v1` y `nahual.settings.v1` (con `productionOrigins`) y `chrome.storage.session` solo el registro de sesiones de 001; ninguna relajación ni dato de tráfico (FR-017, contracts/storage.md)
- [X] T071 [P] Escribir `apps/extension/e2e/experiments/e4-overhead-cors.spec.ts` (research R17): p95 del tiempo de requests relajados frente a sin Nahual en la app de prueba; registrar el resultado en `specs/003-cors-desarrollo/research.md` (SC-007: < 20 ms)
- [X] T072 [P] Registrar en `specs/003-cors-desarrollo/research.md` el resultado de X3 (de T057) y el tamaño de los bundles del panel y del SW antes y después de 003
- [X] T073 Ejecutar la E2E completa 10 veces seguidas (`pnpm e2e`) registrando el nombre de cualquier prueba fallida, y anotar el resultado en `specs/003-cors-desarrollo/research.md`; si reaparece el fallo intermitente de 002, identificarlo y corregirlo o registrarlo
- [X] T074 [P] Actualizar `README.md` con CORS de desarrollo (diagnóstico, relajación acotada, indicador, `Alt+Shift+R`, orígenes de producción, reporte) y el tercer origen de `fixture:serve`
- [X] T075 Añadir la sección "Revisión de implementación" en `specs/003-cors-desarrollo/plan.md`: diff contra el modelo de amenazas (filas de 003), permisos (sin cambios), dependencias (ninguna), mensajería v3, redacción en diagnóstico y reporte, fallo seguro y definición de terminado por historia
- [ ] T076 **Checkpoint final**: demo de punta a punta con los pasos 1–12 de `specs/003-cors-desarrollo/quickstart.md` en Chrome estable; `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm verify:dist && pnpm e2e` en verde; `research.md` sin "pendiente"; recordar la deuda de 001 (E5/T066, T067 y la definición de "en conflicto")

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sin dependencias. T009 depende de T006–T008.
- **Foundational (Phase 2)**: depende de Setup; bloquea todas las historias.
- **US1 (Phase 3)**: depende de Foundational. MVP.
- **US2 (Phase 4)**: depende de Foundational; la creación desde el detalle (T050) necesita la
  sección CORS de US1 (T034) y el diagnóstico (T031). El dominio y el SW de US2 pueden avanzar en
  paralelo con US1.
- **US3 (Phase 5)**: depende de US1 (diagnósticos en el historial). El acceso desde el indicador
  (parte de T065) depende de T052.
- **Polish (Phase 6)**: depende de las historias que se entreguen.

### Within Each Story

- Pruebas de dominio ⇒ dominio ⇒ pruebas del SW ⇒ SW ⇒ panel ⇒ E2E/a11y ⇒ checkpoint.
- `cors-relaxer.ts` (T046) depende de T041–T042; `rule-engine.ts` (T047) depende de T046;
  `app.ts` (T048) depende de T046–T047.

### Parallel Opportunities

- Setup: T001–T008.
- Foundational: T010–T012 juntas; T018, T020 y T022 en paralelo con el protocolo (T016–T017).
- US1: T024–T026 juntas; T028 y T029 juntas; T032, T033 y T035 juntas (T033a tras T033).
- US2: T038–T040 juntas; T043–T045 juntas; T049, T053, T054 y T056 juntas.
- US3: T061 y T062 juntas.
- Polish: T070–T072 y T074.

---

## Parallel Example: User Story 2

```bash
# Pruebas de dominio, juntas:
Task: "headers.test.ts (computeRelaxedHeaders) en packages/domain/tests/cors/"
Task: "headers.test.ts (preflightPasses) en packages/domain/tests/cors/"
Task: "relaxation.test.ts en packages/domain/tests/cors/"

# Pruebas del SW, juntas:
Task: "cors-relaxer.test.ts en apps/extension/tests/integration/"
Task: "rule-engine.test.ts (relajación) en apps/extension/tests/integration/"
Task: "background.test.ts (comandos CORS) en apps/extension/tests/integration/"
```

---

## Implementation Strategy

### MVP

1. Phase 1 y 2 ⇒ experimentos registrados, protocolo v3 y orígenes por frame.
2. Phase 3 (US1) ⇒ entender el error. **Detenerse y validar** (quickstart 1–3).
3. Phase 4 (US2) ⇒ desbloquear: la propuesta de valor central, con aislamiento y ciclo de vida
   probados antes de la demo.
4. Phase 5 (US3) ⇒ reporte para backend.

### Incremental Delivery

- US1 ⇒ US2 ⇒ US3, con demo en cada checkpoint.
- Commit por tarea o grupo lógico (Conventional Commits), en la rama de implementación de 003.
- Si un experimento (X1–X4) contradice el diseño, actualizar research.md y la prueba antes de
  implementar.

---

## Notes

- [P] = archivos distintos, sin dependencias pendientes.
- Las pruebas de dominio deben fallar antes de implementar.
- Ningún permiso ni dependencia nueva (plan.md); si hiciera falta, se justifica en `plan.md` antes
  de añadirlo.
- La relajación nunca se persiste ni se exporta (FR-017).
