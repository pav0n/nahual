---
description: "Lista de tareas de 002-captura-intercept"
---

# Tasks: Captura de tráfico e intercept condicional

**Input**: Design documents from `/specs/002-captura-intercept/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/panel-protocol.md,
contracts/storage.md, contracts/manifest.md, quickstart.md

**Tests**: obligatorias. La constitución (principio IV, NO NEGOCIABLE) exige TDD en
`packages/domain`: cada prueba se escribe, se ejecuta y **falla** antes de su implementación. Lo
mismo aplica a las pruebas de integración del SW con CDP simulado.

**Organization**: una fase por historia, en el orden de la entrada: US1 tráfico (P1), US2 pausar
(P1), US3 primer uso (P1), US4 acciones (P2). Cada historia incluye sus pruebas E2E, la revisión
axe, la verificación de que ningún error deja la página colgada y un checkpoint demostrable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: se puede hacer en paralelo (archivos distintos, sin dependencias pendientes)
- **[USn]**: tarea de la historia de usuario n
- Rutas relativas a la raíz del repo, según la estructura de `plan.md`
- "Prueba primero" = escribir la prueba, verla fallar y solo entonces implementar

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: dependencias nuevas, fixtures de prueba y fakes ampliados.

- [ ] T001 Añadir dependencias exactas: `zod` 4.6.5 y `json-p3` 3.0.0 en `packages/domain/package.json`; `@nahual/domain` (`workspace:*`) en `packages/protocol/package.json` y `apps/extension/package.json`; `zustand` 5.0.15, `immer` 11.1.21 y `@tanstack/react-virtual` 3.14.13 en `apps/extension/package.json`. Ejecutar `pnpm install`, commitear `pnpm-lock.yaml` y comprobar en el lockfile `iregexp-check` 0.1.x y `@tanstack/virtual-core` 3.17.11; `node scripts/check-licenses.mjs` y `pnpm audit` en verde
- [ ] T002 [P] Subir la versión a `0.2.0` en `apps/extension/package.json` y comprobar que `apps/extension/tests/dist/manifest.test.ts` sigue exigiendo solo `["debugger", "storage"]` sin host permissions (contracts/manifest.md)
- [ ] T003 [P] Ampliar `apps/extension/e2e/fixtures/servers.ts` con las rutas de la app de prueba (quickstart): API (origen B) `/api/items` (200 `{"items":[1,2]}`), `/api/empty` (200 `{"items":[]}`), `/api/error` (500 JSON), `/graphql` (POST; `GetUser` con y sin `errors` según query param, `ListUsers` sin errores), `/gzip` (JSON con `Content-Encoding: gzip`), `/binary` (PNG), `/big` (6 MB de JSON), `/redirect` (302), `/echo` (registra método, URL, headers y body recibidos y los devuelve) y `/received` (lista lo registrado para que la prueba lo consulte), `/api/html` (body `<img src=x onerror="window.__xss=1"><script>window.__xss=1</script>` con `Content-Type: text/html` y un header `X-Evil` con el mismo valor); SPA (origen A) con botones `data-testid` para cada llamada y un enlace de navegación a otra página
- [ ] T004 [P] Crear `apps/extension/e2e/fixtures/serve.ts` y el script `fixture:serve` en `apps/extension/package.json` para levantar los servidores de T003 en puertos fijos para la validación manual
- [ ] T005 [P] Ampliar `apps/extension/tests/fakes/fake-debugger.ts`: emitir `Network.requestWillBeSent` (con `redirectResponse`), `requestWillBeSentExtraInfo`, `responseReceived`, `responseReceivedExtraInfo`, `loadingFinished`, `loadingFailed`, `Page.frameNavigated` y `Fetch.requestPaused` en etapa Response con `responseStatusCode`/`responseHeaders`; responder `Network.getResponseBody`, `Network.getRequestPostData`, `Fetch.getResponseBody` (con `base64Encoded`), `Target.getTargetInfo` (URL configurable) y registrar `fulfillRequest`, `failRequest`, `continueRequest`, `continueResponse`, `Fetch.enable`/`disable` con sus parámetros; permitir inyectar fallos por comando
- [ ] T006 [P] Ampliar `apps/extension/tests/fakes/fake-storage.ts` con el área `local`, `onChanged` y un modo que falle `set` por cuota

**Checkpoint**: `pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm test` en verde; licencias y auditoría en verde.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: schemas de dominio, protocolo v2, stores, logger, sitio de la pestaña y el armazón
del panel. Nada de historia funciona sin esto.

**⚠️ CRITICAL**: ninguna historia empieza antes de terminar esta fase.

### Dominio: schemas y utilidades (pruebas primero)

- [ ] T007 [P] Escribir `packages/domain/tests/schemas.test.ts` (debe fallar): `Rule` exige `site` origen no opaco, `name` "1–80 caracteres", `prefilter.pattern` "1–2,048 (glob) o 1–512 (regex)" y regex compilable "sin banderas `g`/`y`", `methods`/`resourceTypes` sin duplicados (vacío = todos), `conditions` "0–20", cada condición válida para su `stage` (p. ej. `status` y `graphqlErrors` solo en response; `method` y `query` solo en request); `Condition.status` en 100–599, `range` con `min ≤ max`, `list` de "1–50 códigos"; `value` obligatorio salvo `exists`/`notExists`/`empty`/`notEmpty`; `Action.mock` con `status` 100–599, `headers` "≤ 100", `body` "≤ 1 MB en reglas guardadas"; `Action.delay.ms` "entero 1–60,000"; `Action.fail.errorReason` en los siete valores de data-model; `Settings.pauseTimeoutSeconds` "5–300; 60 por defecto", `autoAttach` `true` por defecto y `globalPaused`/`onboardingSeen`/`attachConsent` `false` por defecto
- [ ] T008 [P] Escribir `packages/domain/tests/glob.test.ts` (debe fallar): `*` = cualquier secuencia incluida `/`, `?` = un carácter, resto literal (incluidos `.`, `+`, `(`), comparación contra la URL completa, `\` escapa, `*` coincide con todo (research R3)
- [ ] T009 [P] Escribir `packages/domain/tests/sensitive.test.ts` (debe fallar): `isSensitiveHeader` para `Authorization`, `Proxy-Authorization`, `Cookie`, `Set-Cookie` y nombres que contengan `token`, `secret`, `session`, `api-key` o `apikey` sin distinguir mayúsculas; `redactHeaders` reemplaza esos valores por una máscara fija (FR-004a, FR-036)
- [ ] T010 [P] Escribir `packages/domain/tests/body.test.ts` (debe fallar): detección de binario (UTF-8 inválido o content-type no textual), límite de 5 MB, decodificación de base64 a texto, `stripContentEncoding` elimina `Content-Encoding` y recalcula `Content-Length` (research R7)
- [ ] T011 Implementar `packages/domain/src/schemas/limits.ts`, `rule.ts`, `condition.ts`, `action.ts` y `settings.ts` con Zod (`z.config({ jitless: true })` como en `packages/protocol/src/envelope.ts`) hasta que pase T007
- [ ] T012 Implementar `packages/domain/src/schemas/exchange.ts` (`CapturedExchange`, `RuleEffect` con los `result` de data-model, `ExchangeUpdate`) y `packages/domain/src/schemas/paused.ts` (`PausedItemView`, `PausedEdit` con `headers` "reemplazo completo, ≤ 100"); añadir sus casos a `packages/domain/tests/schemas.test.ts`
- [ ] T013 [P] Implementar `packages/domain/src/match/glob.ts` hasta que pase T008
- [ ] T014 [P] Implementar `packages/domain/src/sensitive.ts` hasta que pase T009
- [ ] T015 [P] Implementar `packages/domain/src/body.ts` hasta que pase T010
- [ ] T016 Exportar todo desde `packages/domain/src/index.ts`, retirar `packages/domain/tests/smoke.test.ts` y verificar cobertura ≥ 85% con `pnpm --filter @nahual/domain test`

### Protocolo v2 (pruebas primero)

- [ ] T017 Reescribir las pruebas de `packages/protocol/tests/` para v2 (deben fallar): `PROTOCOL_VERSION = 2`; un mensaje `v: 1` se descarta; cada comando y evento de contracts/panel-protocol.md con payload válido e inválido; `setPatterns` y `setPauseTimeout` ya no existen; `saveRule` reutiliza los schemas de `@nahual/domain`; `resolvePaused` acepta `edit` solo con `continue` y `mock` solo con `mock`; `reorderRules` exige ids únicos; `exchanges.updates` ≤ 200; `parsePanelMessage` nunca lanza ni repite valores en sus errores
- [ ] T018 Implementar v2 en `packages/protocol/src/envelope.ts`, `packages/protocol/src/panel-to-sw.ts`, `packages/protocol/src/sw-to-panel.ts` (nuevos `ErrorCode`: `rule_invalid`, `unknown_rule`, `settings_invalid`, `storage_quota`, `edit_invalid`, `body_unavailable`, `no_site`; `error.issues?`) y `packages/protocol/src/index.ts` hasta que pase T017; cobertura ≥ 85%

### Service worker: almacenamiento, registros, puerto y sitio (pruebas primero)

- [ ] T019 [P] Escribir `apps/extension/tests/integration/settings-store.test.ts` (debe fallar) con `FakeStorage`: lee `nahual.settings.v1`, aplica valores por defecto campo a campo ante valores inválidos y emite aviso; `update` valida y persiste; solo el SW escribe (contracts/storage.md)
- [ ] T020 [P] Escribir `apps/extension/tests/unit/logger.test.ts` (debe fallar): `logger.warn/error` nunca incluye URLs, valores de headers sensibles ni bodies, aunque se le pasen (FR-036)
- [ ] T021 Implementar `apps/extension/src/background/storage-port.ts` (interfaz + implementación sobre `chrome.storage.local`/`onChanged`) y `apps/extension/src/background/settings-store.ts` hasta que pase T019
- [ ] T022 [P] Implementar `apps/extension/src/background/logger.ts` usando `redactHeaders` de `@nahual/domain` y eliminando URLs de los argumentos hasta que pase T020, y reemplazar los `console.warn` del SW por el logger
- [ ] T023 Actualizar `apps/extension/tests/integration/panel-port.test.ts` a v2 (debe fallar): las garantías de 001 siguen; un mensaje > 6 MB se descarta sin parsear; `hello` responde `ack` + `state` + `settings` + `rules`
- [ ] T024 Actualizar `apps/extension/tests/integration/debugger-manager.test.ts` (debe fallar): al adjuntar habilita `Network` (`maxResourceBufferSize` 5 MB, `maxTotalBufferSize` 50 MB) y `Page`; obtiene el sitio con `Target.getTargetInfo`; `Page.frameNavigated` del frame principal actualiza el sitio y emite `navigated`; orígenes opacos ⇒ `site: null`; `attach { consent: true }` persiste `attachConsent` (research R1, R9, R17)
- [ ] T025 Implementar los cambios en `apps/extension/src/background/panel-port.ts` y `apps/extension/src/background/debugger-manager.ts` hasta que pasen T023 y T024
- [ ] T026 Reconectar `apps/extension/src/background/index.ts` a v2: eliminar `setPatterns`/`setPauseTimeout`, cargar `SettingsStore` antes de aceptar puertos, emitir `state` con `site`, `activeRuleCount`, `queueSize` y `globalPaused`; `apps/extension/src/background/fetch-interceptor.ts` queda sin patrones hasta US2 (sin reglas ⇒ `Fetch.disable`)

### Panel: armazón

- [ ] T027 Crear el store en `apps/extension/src/panel/store/index.ts` con Zustand + middleware `immer` y los slices `connection.ts`, `settings.ts` y `ui.ts` en `apps/extension/src/panel/store/`; actualizar `apps/extension/src/panel/use-sw-connection.ts` a v2 para volcar `state`, `settings`, `rules` y `notice` en el store
- [ ] T028 [P] Crear los componentes comunes accesibles en `apps/extension/src/panel/components/common/`: `Tabs.tsx` (patrón APG, flechas e `Inicio`/`Fin`), `Toast.tsx` (región `aria-live="polite"` con acción opcional "Deshacer"), `Switch.tsx` (`<input type="checkbox" role="switch">`) y `EmptyState.tsx` (título, explicación y acción) (research R15)
- [ ] T029 Reestructurar `apps/extension/src/panel/App.tsx`: `StatusBar` arriba y pestañas Tráfico, Reglas y Cola; eliminar `apps/extension/src/panel/components/PatternForm.tsx`; ampliar `apps/extension/src/panel/components/StatusBar.tsx` con el sitio actual
- [ ] T030 [P] Añadir las claves i18n del armazón (pestañas, estados de sitio, avisos de storage y de reglas descartadas, errores v2 con causa y solución) en `apps/extension/public/_locales/es/messages.json` y `apps/extension/public/_locales/en/messages.json`
- [ ] T031 Adaptar `apps/extension/e2e/detach-detection.spec.ts`, `apps/extension/e2e/a11y.spec.ts` y `apps/extension/e2e/fixtures/panel.ts` al panel con pestañas; marcar `apps/extension/e2e/attach-pause-continue.spec.ts` y `apps/extension/e2e/sw-restart.spec.ts` con `test.fixme` apuntando a T075 (dependen de reglas)

**Checkpoint**: `pnpm lint && pnpm typecheck && pnpm test` en verde; cobertura ≥ 85% en `packages/*`; `pnpm build && pnpm verify:dist` en verde; la extensión carga, adjunta y muestra el panel con pestañas vacías y el sitio actual.

---

## Phase 3: User Story 1 - Ver el tráfico de la pestaña (Priority: P1) 🎯 MVP

**Goal**: lista, filtros, detalle con bodies y historial de 2,000 entradas con limpiar y deshacer.

**Independent Test**: sin reglas, cargar la SPA del fixture y verificar lista, filtros, detalle
(JSON, binario, > 5 MB, enmascarado), tope y deshacer (quickstart 2–4).

### Pruebas primero

- [ ] T032 [P] [US1] Escribir `packages/domain/tests/filter.test.ts` (debe fallar): filtro por subcadena de URL (sin distinguir mayúsculas), regex sobre la URL (inválida ⇒ `{ ok: false }` y se conserva la anterior), status exacto o clase `1xx`–`5xx`, tipos de recurso (uno o varios), combinados con Y; pendientes sin status no pasan un filtro de status (FR-003)
- [ ] T033 [P] [US1] Escribir `apps/extension/tests/integration/network-capture.test.ts` (debe fallar) con `FakeDebugger`: cada evento Network produce el `ExchangeUpdate` correcto; headers de `ExtraInfo` prevalecen; `isPreflight` para `OPTIONS` con `Access-Control-Request-Method`; redirección ⇒ entrada anterior cerrada como 3xx sin body y nueva con `#n`; lotes cada 50 ms con ≤ 200 updates; los updates nunca contienen bodies; `getBody` responde `body` o `error body_unavailable` con causa (desalojado, binario, > 5 MB) (research R1, R2, R11)
- [ ] T034 [P] [US1] Escribir `apps/extension/tests/unit/traffic-store.test.ts` (debe fallar): búfer circular de 2,000 por pestaña, descarte FIFO con `atCap`, aplicación de lotes, `clear` + `undoClear` durante 10 s y expiración posterior (FR-005, FR-006)

### Implementación

- [ ] T035 [P] [US1] Implementar `packages/domain/src/filter.ts` hasta que pase T032
- [ ] T036 [US1] Implementar `apps/extension/src/background/network-capture.ts` y manejar `getBody` en `apps/extension/src/background/index.ts` hasta que pase T033
- [ ] T037 [US1] Implementar `apps/extension/src/panel/store/traffic.ts` hasta que pase T034
- [ ] T038 [P] [US1] Crear `apps/extension/src/panel/components/traffic/TrafficGrid.tsx` con `@tanstack/react-virtual`: `role="grid"`, `aria-rowcount` total, `aria-rowindex` por fila, columnas método, URL, status (o pendiente/fallido), tipo, tamaño transferido, tiempo y marca de regla aplicada; flechas, `Enter` abre detalle, `Escape` cierra (FR-002, research R13)
- [ ] T039 [P] [US1] Crear `apps/extension/src/panel/components/traffic/Filters.tsx`: texto, regex con error inline, status, tipos (multiselección) y contador "N de M"; atajo `/` (fuera de campos) y `Alt+Shift+F` en `apps/extension/src/panel/use-shortcuts.ts` (FR-003, research R16)
- [ ] T040 [P] [US1] Crear `apps/extension/src/panel/components/traffic/HeaderList.tsx`: headers como texto, sensibles enmascarados con "Mostrar" por valor hasta cerrar el detalle; copiar un valor enmascarado copia la máscara (FR-004a)
- [ ] T041 [P] [US1] Crear `apps/extension/src/panel/components/traffic/BodyView.tsx`: pide el body con `getBody`, lo muestra en `<pre>` (JSON formateado con `JSON.stringify(…, null, 2)`), metadatos y motivo para binario, > 5 MB, redirección o no disponible, y estado de carga (FR-004)
- [ ] T042 [US1] Crear `apps/extension/src/panel/components/traffic/ExchangeDetail.tsx` (pestañas Headers / Request / Response con `Tabs`, tamaños transferido y descomprimido, efectos de reglas) y la vista `apps/extension/src/panel/components/traffic/TrafficView.tsx` con botón "Limpiar" + `Toast` "Deshacer" y estados vacío ("recarga la página para capturar sus requests"), de carga y de error (FR-006, FR-029, US3-8)
- [ ] T043 [P] [US1] Añadir las claves i18n de tráfico, detalle, filtros y estados en `apps/extension/public/_locales/es/messages.json` y `apps/extension/public/_locales/en/messages.json`

### E2E, accesibilidad y sin cuelgues

- [ ] T044 [US1] Escribir `apps/extension/e2e/traffic.spec.ts`: escenarios US1-1 a US1-7 sobre el fixture (lista, filtros, regex inválida, JSON formateado, `/binary` y `/big` solo con metadatos, `Cookie` enmascarada y "Mostrar", tope de 2,000 con la página de carga, limpiar y deshacer); `/gzip` muestra el JSON descomprimido; abrir el detalle de `/api/html` ⇒ el marcado se ve como texto, `window.__xss` sigue indefinido en el panel y no hay violaciones de CSP (FR-032)
- [ ] T045 [US1] Medir SC-004 en `apps/extension/e2e/traffic.spec.ts`: con 2,000 entradas, cambiar un filtro actualiza la lista en < 300 ms (medido con `performance.now()` en el panel) y el desplazamiento no bloquea el hilo > 50 ms
- [ ] T046 [US1] Ampliar `apps/extension/e2e/a11y.spec.ts` con la lista, filtros, detalle y estados vacío/carga en ambos temas y a 320 px: axe sin violaciones serias ni críticas y recorrido solo con teclado
- [ ] T047 [US1] Crear `apps/extension/e2e/no-hang.spec.ts` con el bloque de captura: soltar el debugger, cerrar el panel y forzar un error en `network-capture` (vía build de test) durante una ráfaga de requests ⇒ la página completa todas sus llamadas sin cambios

**Checkpoint US1**: pruebas unitarias, de integración y E2E de US1 en verde; demo: quickstart 2–4 con la extensión cargada.

---

## Phase 4: User Story 2 - Pausar solo lo que cumple una condición (Priority: P1)

**Goal**: reglas por sitio con prefiltro, condiciones y acción Pausar; cola editable con cuenta
regresiva; lo que no cumple no se retrasa.

**Independent Test**: reglas "status ≥ 500" y "`$.items` está vacío" sobre el fixture: solo esos
intercambios se pausan, se editan y llegan editados; el resto pasa sin retraso (quickstart 5–10,
14, 16, 17).

### Dominio (pruebas primero)

- [ ] T048 [P] [US2] Escribir `packages/domain/tests/status.test.ts` (debe fallar): `eq`, `ne`, `lt`, `lte`, `gt`, `gte`, `between` inclusivo, `in` con lista
- [ ] T049 [P] [US2] Escribir `packages/domain/tests/headers-query.test.ts` (debe fallar): `exists`, `notExists`, `equals`, `contains`, `matches` por nombre sin distinguir mayúsculas; headers repetidos; query params repetidos y codificados; texto evaluado acotado a 8 KB (research R19)
- [ ] T050 [P] [US2] Escribir `packages/domain/tests/jsonpath.test.ts` (debe fallar) con la semántica de research R5: `exists`/`notExists` por nodelist; "algún nodo" para `equals`, `notEquals`, `contains`, `matches` y numéricos; `empty` exige todos vacíos (`[]`, `{}`, `""`, `null`) y al menos uno; `equals` con JSON canónico y texto si el valor no es JSON; valores > 64 KB truncados; ruta inválida rechazada al compilar
- [ ] T051 [P] [US2] Escribir `packages/domain/tests/graphql.test.ts` (debe fallar): detección por `query` en body JSON o en `GET`; `operationName` del campo o de la primera definición `query|mutation|subscription <Nombre>`; batch ⇒ alguna operación; `errors` presente solo con arreglo no vacío; no GraphQL ⇒ no evaluable (research R6)
- [ ] T052 [P] [US2] Escribir `packages/domain/tests/evaluate.test.ts` (debe fallar): `evaluateRule` respeta método, tipo, prefiltro glob/regex, condiciones con Y; orden barato ⇒ caro; `needsBody` indica si hace falta pedir el body; condición no evaluable (sin body, binario, > 5 MB, JSON inválido, no GraphQL) ⇒ `false` con `unevaluable: reason`; `selectRule` devuelve la primera regla activa del sitio por `order` y etapa, ignora inactivas y otros sitios, y nada con `globalPaused` (FR-012, FR-014a, FR-016)
- [ ] T053 [P] [US2] Escribir `packages/domain/tests/fetch-patterns.test.ts` (debe fallar) con research R3: sin reglas activas ⇒ `[]`; glob ⇒ `urlPattern` igual; regex ⇒ `*`; un patrón por tipo; `*` sin tipo absorbe la etapa; duplicados eliminados; > 50 patrones ⇒ etapa reducida a `*`; solo reglas del sitio y nada con `globalPaused`
- [ ] T054 [P] [US2] Escribir `packages/domain/tests/validate.test.ts` (debe fallar): `validateRule` devuelve `issues` con `path` y `messageKey` para regex no compilable, JSONPath inválido, status fuera de 100–599, `min > max`, `value` ausente, condición de otra etapa, prefiltro vacío, regex > 512 caracteres y body de mock > 1 MB (FR-013, SC-005)
- [ ] T055 [P] [US2] Implementar `packages/domain/src/match/status.ts`, `packages/domain/src/match/headers.ts` y `packages/domain/src/match/query.ts` hasta que pasen T048 y T049
- [ ] T056 [P] [US2] Implementar `packages/domain/src/jsonpath.ts` sobre `json-p3` hasta que pase T050
- [ ] T057 [P] [US2] Implementar `packages/domain/src/graphql.ts` hasta que pase T051
- [ ] T058 [US2] Implementar `packages/domain/src/match/prefilter.ts` y `packages/domain/src/evaluate.ts` (regex compiladas una vez y cacheadas por regla) hasta que pase T052
- [ ] T059 [P] [US2] Implementar `packages/domain/src/fetch-patterns.ts` hasta que pase T053
- [ ] T060 [P] [US2] Implementar `packages/domain/src/validate.ts` hasta que pase T054; cobertura de `packages/domain` ≥ 85%

### Service worker (pruebas primero)

- [ ] T061 [P] [US2] Escribir `apps/extension/tests/integration/rule-store.test.ts` (debe fallar) con contracts/storage.md: valida al guardar y al leer; reglas corruptas mezcladas con válidas ⇒ se usan las válidas y `rules.discarded` cuenta por causa; versión desconocida ⇒ se ignora sin sobrescribir; escrituras serializadas; "≤ 500 reglas" (la regla 501 se rechaza con `rule_invalid`); cuota ⇒ `error storage_quota` sin cambiar la memoria; `deleteRule` + `restoreRule` en 10 s y `unknown_rule` después; nueva regla al final de su sitio con `order` renumerado
- [ ] T062 [P] [US2] Escribir `apps/extension/tests/integration/pause-queue.test.ts` (debe fallar) con research R8: orden de llegada; "≤ 100" y el 101 continúa sin cambios con `queue_full`; `expiresAt = pausedAt + timeout` vigente (60 s por defecto, 5–300 s); resolución idempotente (lo primero entre acción, timeout, navegación, detach, error); navegación resuelve solo los pausados antes del commit como `discarded_navigation`; detach ⇒ `continued_on_detach`; `continueAll`
- [ ] T063 [P] [US2] Escribir `apps/extension/tests/integration/action-executor.test.ts` (debe fallar) con la tabla de research R7: continuar sin cambios; request editado ⇒ `continueRequest` con método, URL, headers y `postData` base64; response solo status/headers ⇒ `continueResponse` con `responseCode`; response con body ⇒ `fulfillRequest` sin `Content-Encoding` y con `Content-Length` recalculado; mock desde la cola ⇒ `fulfillRequest`; abortar ⇒ `failRequest Aborted`; comando fallido ⇒ un reintento sin cambios y `apply_failed` con `errorKey`; headers sensibles sin tocar viajan con su valor real (FR-004b); edición con status fuera de 100–599, URL no absoluta o nombre de header que no es token RFC 9110 ⇒ `error edit_invalid` con `issues` y sin llamar a CDP
- [ ] T064 [P] [US2] Escribir `apps/extension/tests/integration/rule-engine.test.ts` (debe fallar): `requestPaused` sin regla ⇒ `continue*` inmediato; con regla Pausar ⇒ entra en la cola y emite `paused` + `effect`; pide el body una sola vez y solo si `needsBody`; excepción del motor ⇒ continuar sin cambios y error registrado sin valores; `Fetch.enable` se recalcula al cambiar reglas, `globalPaused` o sitio, y sin reglas activas ⇒ `Fetch.disable`
- [ ] T065 [US2] Implementar `apps/extension/src/background/rule-store.ts` hasta que pase T061
- [ ] T066 [US2] Implementar `apps/extension/src/background/pause-queue.ts` hasta que pase T062 (reemplaza la gestión de pausas de `fetch-interceptor.ts` de 001)
- [ ] T067 [US2] Implementar `apps/extension/src/background/action-executor.ts` hasta que pase T063
- [ ] T068 [US2] Implementar `apps/extension/src/background/rule-engine.ts` y conectar `apps/extension/src/background/fetch-interceptor.ts` (patrones con `computeFetchPatterns`) hasta que pase T064
- [ ] T069 [US2] Manejar en `apps/extension/src/background/index.ts` los comandos `saveRule`, `deleteRule`, `restoreRule`, `setRuleEnabled`, `resolvePaused`, `continueAll` y `updateSettings { pauseTimeoutSeconds }`, y escribir `apps/extension/tests/integration/intercept-flow.test.ts`: flujo completo `requestPaused ⇒ regla ⇒ cola ⇒ resolvePaused ⇒ CDP` para etapa Request y Response con `FakeDebugger`

### Panel

- [ ] T070 [P] [US2] Crear `apps/extension/src/panel/store/rules.ts` y `apps/extension/src/panel/store/queue.ts` (items por `pausedAt`, selección actual, borradores de edición por item)
- [ ] T071 [US2] Crear `apps/extension/src/panel/components/rules/RuleList.tsx` (reglas del sitio actual primero, sitio visible en cada una, activar/desactivar con `Switch`, duplicar, editar, eliminar con `Toast` "Deshacer"; estado vacío con "Crea tu primera regla") (FR-014a, FR-015)
- [ ] T072 [US2] Crear `apps/extension/src/panel/components/rules/RuleEditor.tsx` y `apps/extension/src/panel/components/rules/ConditionEditor.tsx`: nombre, prefiltro glob/regex, métodos, tipos, etapa, condiciones permitidas para la etapa con sus operadores (data-model), acción Pausar; muestra `issues` junto a cada campo y no cierra si `saveRule` falla (FR-008 a FR-013)
- [ ] T073 [US2] Crear `apps/extension/src/panel/components/queue/Countdown.tsx` (texto con segundos restantes y `aria-live` cada 10 s y en los últimos 5 s, acotado al timeout del item), `apps/extension/src/panel/components/queue/PauseQueue.tsx` (orden de llegada, tamaño, "Continuar todos" con confirmación en `<dialog>` si algún item tiene borrador sin aplicar, FR-024) y `apps/extension/src/panel/components/queue/PausedEditor.tsx` (Request: método, URL, headers, body; Response: status, headers, body en `<textarea>` con "Formatear" y "Validar JSON"; sensibles con valor real al editar; validación inline de status, URL y nombres de header antes de enviar; acciones Continuar, Continuar sin cambios, Responder con mock con editor de status/headers/body, Abortar; aviso si vence mientras se edita); reemplazan `PausedList.tsx` y `HeaderEditor.tsx` de 001 (FR-020 a FR-024)
- [ ] T074 [US2] Añadir el ajuste de timeout (5–300 s) en `apps/extension/src/panel/components/SettingsPanel.tsx`, los atajos `Alt+Shift+C` (continuar seleccionado) y `Alt+Shift+K` (continuar todos, con la misma confirmación que el botón si hay borradores, FR-024) en `apps/extension/src/panel/use-shortcuts.ts`, y las claves i18n de reglas, condiciones, cola y errores de validación en `apps/extension/public/_locales/es/messages.json` y `apps/extension/public/_locales/en/messages.json`

### E2E, accesibilidad y sin cuelgues

- [ ] T075 [US2] Migrar `apps/extension/e2e/attach-pause-continue.spec.ts` y `apps/extension/e2e/sw-restart.spec.ts` a reglas (crear una regla Pausar desde el panel en lugar de un patrón) y quitar sus `test.fixme`
- [ ] T076 [US2] Escribir `apps/extension/e2e/conditional-pause.spec.ts`: escenarios US2-1 a US2-12 sobre el fixture (persistencia tras cerrar y reabrir, regla de otro sitio no aplica, status ≥ 500, `$.items` vacío, GraphQL `GetUser` con `errors`, condiciones de Request, edición de Request verificada con `/received`, edición de Response con body sobre `/gzip`, cuenta regresiva y timeout con 5 s, tres pausas resueltas en otro orden, regex inválida rechazada, "Continuar todos" con un borrador ⇒ confirmación y cancelar conserva la cola); verificar que `Cookie` sin tocar llega con su valor real; registrar en `specs/002-captura-intercept/research.md` (R7) qué pasa al cambiar la URL a otro origen
- [ ] T077 [US2] Ampliar `apps/extension/e2e/no-hang.spec.ts` con items en cola: navegar, cerrar la pestaña, "Soltar", cancelar desde la barra de Chrome, reiniciar el SW, timeout, fallo forzado al aplicar un cambio y cola llena (101 pausas) ⇒ la página nunca queda colgada y la cola queda vacía (SC-003); dos pestañas del mismo sitio con su propio panel: historial, cola y estado del debugger independientes, resolver o soltar en una no afecta a la otra y las reglas son compartidas
- [ ] T078 [US2] Ampliar `apps/extension/e2e/a11y.spec.ts` con la lista de reglas, el editor (con errores de validación), la cola y el editor de pausados en ambos temas y a 320 px
- [ ] T079 [US2] Crear `apps/extension/e2e/experiments/e4-overhead-rules.spec.ts` con las cuatro corridas de research R20 y registrar la tabla p50/p95 en `specs/002-captura-intercept/research.md`; p95 del overhead < 20 ms en las corridas 3 y 4 (SC-002)

**Checkpoint US2**: pruebas de US2 en verde (dominio ≥ 85%); demo: quickstart 5–10, 14, 16 y 17.

---

## Phase 5: User Story 3 - Primer uso comprensible (Priority: P1)

**Goal**: onboarding, consentimiento y adjunto automático, indicador permanente y estados vacíos
con plantillas.

**Independent Test**: perfil limpio ⇒ onboarding ⇒ "Adjuntar y empezar" ⇒ plantilla "Pausar
respuestas con error" ⇒ primera respuesta pausada y editada (quickstart 1, 5, 15).

- [ ] T080 [P] [US3] Escribir `packages/domain/tests/templates.test.ts` (debe fallar): cuatro plantillas de FR-018, todas con tipos Fetch/XHR; `errors` (Response, status ≥ 400, prefiltro `*`), `empty` (Response, JSONPath `$` `empty`, prefiltro `*`), `mock503` (Request, Mock 503 con body JSON de error) y `slow3s` (Request, Retrasar 3,000 ms) con prefiltro vacío; cada `RuleDraft` completada pasa `validateRule` y la de prefiltro vacío no
- [ ] T081 [P] [US3] Implementar `packages/domain/src/templates.ts` hasta que pase T080
- [ ] T082 [P] [US3] Escribir `apps/extension/tests/unit/auto-attach.test.ts` (debe fallar) para la lógica de `apps/extension/src/panel/use-sw-connection.ts`: sin consentimiento no envía `attach`; con consentimiento y `autoAttach` lo envía tras `hello`; con `autoAttach: false` espera; tras un "Soltar" manual no reenvía hasta "Reconectar" o una nueva apertura; reconexión del puerto tras reinicio del SW sin "Soltar" previo ⇒ readjunta, con "Soltar" previo ⇒ no (FR-027a, FR-027b, research R17)
- [ ] T083 [US3] Implementar el adjunto automático en `apps/extension/src/panel/use-sw-connection.ts` hasta que pase T082 y el ajuste `autoAttach` en `apps/extension/src/panel/components/SettingsPanel.tsx`
- [ ] T084 [US3] Crear `apps/extension/src/panel/components/Onboarding.tsx` con `<dialog>` y `showModal()`: ≤ 3 pasos (barra de aviso de Chrome, qué ve Nahual incluidas credenciales, nada sale del navegador), "Omitir", último paso "Adjuntar y empezar" (`attach { consent: true }`), `onboardingSeen` al cerrar y botón "Ayuda" en `StatusBar` para reabrirlo (FR-027)
- [ ] T085 [US3] Completar `apps/extension/src/panel/components/StatusBar.tsx`: estado con texto e icono (no solo color), reglas activas, tamaño de cola, "pausar Nahual" activo, acción "Soltar" o "Reconectar" y estado de error con causa y solución (FR-028)
- [ ] T086 [US3] Añadir las plantillas `errors` y `empty` al estado vacío de `apps/extension/src/panel/components/rules/RuleList.tsx` ("Pausar respuestas con error" como primera sugerida) y abrir `RuleEditor` con la plantilla cargada, sin guardar hasta confirmar (US3-6, US3-7)
- [ ] T087 [P] [US3] Añadir las claves i18n de onboarding, indicador, plantillas y ajustes en `apps/extension/public/_locales/es/messages.json` y `apps/extension/public/_locales/en/messages.json`
- [ ] T088 [US3] Escribir `apps/extension/e2e/first-use.spec.ts` con perfil limpio: US3-1 a US3-8; reabrir el panel ⇒ adjunta solo; desactivar `autoAttach` ⇒ espera; omitir el onboarding ⇒ no adjunta; recorrido guiado completo (onboarding ⇒ plantilla ⇒ pausa de `/api/error` ⇒ edición ⇒ continuar) cronometrado, registrando el tiempo como referencia de SC-001
- [ ] T089 [US3] Ampliar `apps/extension/e2e/a11y.spec.ts` con el onboarding (foco atrapado, `Escape`, orden de lectura), el indicador en cada estado y los estados vacíos con plantillas; ambos temas y 320 px
- [ ] T090 [US3] Ampliar `apps/extension/e2e/no-hang.spec.ts`: adjunto automático sobre una página restringida falla con mensaje y la pestaña sigue usable; cerrar DevTools durante el onboarding no deja el debugger adjunto

**Checkpoint US3**: pruebas de US3 en verde; demo: quickstart 1, 5 y 15 con un perfil limpio.

---

## Phase 6: User Story 4 - Mock, fallo y retraso automáticos (Priority: P2)

**Goal**: acciones Mock, Fallar, Retrasar y Solo registrar; prioridad reordenable; reglas
activables y "pausar Nahual".

**Independent Test**: una regla por acción sobre el fixture, dos reglas que coinciden y los
interruptores (quickstart 11–13).

- [ ] T091 [P] [US4] Ampliar `apps/extension/tests/integration/action-executor.test.ts` (debe fallar): Mock en Request ⇒ `fulfillRequest` y el request no sale; Mock en Response ⇒ reemplaza la respuesta; Fallar ⇒ `failRequest` con el mapeo de research R7 (`failed` ⇒ `Failed`, `aborted` ⇒ `Aborted`, `timedOut` ⇒ `TimedOut`, `connectionRefused` ⇒ `ConnectionRefused`, `nameNotResolved` ⇒ `NameNotResolved`, `accessDenied` ⇒ `AccessDenied`, `internetDisconnected` ⇒ `InternetDisconnected`); Retrasar ⇒ continúa tras ≥ N ms sin bloquear otros; navegación y detach cancelan retrasos y continúan sin cambios; Solo registrar ⇒ continúa y emite `effect logged`
- [ ] T092 [P] [US4] Ampliar `apps/extension/tests/integration/rule-store.test.ts` (debe fallar): `reorderRules` exige una permutación exacta de las reglas del sitio y renumera `order`; `setRuleEnabled`; `updateSettings { globalPaused }` y su efecto en `Fetch.disable` en `apps/extension/tests/integration/rule-engine.test.ts`
- [ ] T093 [US4] Implementar Mock, Fallar, Retrasar y Solo registrar en `apps/extension/src/background/action-executor.ts` y `apps/extension/src/background/rule-engine.ts` hasta que pase T091
- [ ] T094 [US4] Implementar `reorderRules` en `apps/extension/src/background/rule-store.ts` y `globalPaused` en `apps/extension/src/background/fetch-interceptor.ts` hasta que pase T092
- [ ] T095 [US4] Crear `apps/extension/src/panel/components/rules/ActionEditor.tsx` (Pausar, Mock con status/headers/body ≤ 1 MB, Fallar con los siete errores, Retrasar 1–60,000 ms, Solo registrar) e integrarlo en `RuleEditor.tsx`; reutilizar el editor de mock de `PausedEditor.tsx`
- [ ] T096 [US4] Reordenar reglas en `apps/extension/src/panel/components/rules/RuleList.tsx` con botones "Subir"/"Bajar" y `Alt+ArrowUp`/`Alt+ArrowDown` sobre la regla enfocada, anunciando la nueva posición (FR-015, FR-016)
- [ ] T097 [US4] Interruptor global "pausar Nahual" en `apps/extension/src/panel/components/StatusBar.tsx` con atajo `Alt+Shift+P` en `apps/extension/src/panel/use-shortcuts.ts`; persistido en `settings.globalPaused` y visible al reabrir el panel; los pausados existentes siguen en la cola (FR-017)
- [ ] T098 [US4] Añadir las plantillas `mock503` y `slow3s` al estado vacío de `RuleList.tsx`; el editor abre con foco en el prefiltro y no permite guardar con él vacío (US4-7)
- [ ] T099 [P] [US4] Añadir las claves i18n de acciones, errores de red, reordenar y "pausar Nahual" en `apps/extension/public/_locales/es/messages.json` y `apps/extension/public/_locales/en/messages.json`
- [ ] T100 [US4] Escribir `apps/extension/e2e/rule-actions.spec.ts`: US4-1 a US4-8 (mock sin llegar al servidor según `/received`, cada error de red visible en la página, retraso ≥ N ms sin retrasar otras llamadas, solo registrar marcado en el historial, prioridad y reordenar con teclado, regla desactivada, "pausar Nahual")
- [ ] T101 [US4] Ampliar `apps/extension/e2e/no-hang.spec.ts`: retraso de 60 s con navegación, con "Soltar" y con cierre de pestaña ⇒ la página no queda colgada
- [ ] T102 [US4] Ampliar `apps/extension/e2e/a11y.spec.ts` con el editor de acciones y la lista reordenable en ambos temas y a 320 px

**Checkpoint US4**: pruebas de US4 en verde; demo: quickstart 11–13.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T103 [P] Ampliar `apps/extension/tests/dist/no-network.test.ts` para los bundles con `json-p3`, `zustand`, `immer` y `@tanstack/react-virtual`: sin `eval`, `new Function` ni `fetch`/`XMLHttpRequest` propios; cualquier excepción se añade a la allowlist con su justificación
- [ ] T104 [P] Escribir `apps/extension/e2e/storage-privacy.spec.ts`: tras una sesión E2E completa (tráfico, pausas, mocks), `chrome.storage.local` solo contiene `nahual.rules.v1` y `nahual.settings.v1`, sin URLs capturadas, headers ni bodies (contracts/storage.md, FR-033)
- [ ] T105 [P] Registrar en `specs/002-captura-intercept/research.md` el tamaño del bundle del panel y del SW antes y después de 002 (R13/R14)
- [ ] T106 Ejecutar la E2E completa 10 veces seguidas sin fallos (`pnpm e2e`) y registrar el resultado en `specs/002-captura-intercept/research.md`; 0 páginas colgadas (SC-003)
- [ ] T107 [P] Actualizar `README.md` con las funciones de 002 (tráfico, reglas, cola, acciones, atajos) y el comando `fixture:serve`
- [ ] T108 Añadir la sección "Revisión de implementación" en `specs/002-captura-intercept/plan.md`: diff contra el modelo de amenazas, permisos (sin cambios), dependencias, mensajería v2, enmascarado y registros, fallo seguro y definición de terminado por historia
- [ ] T109 Ejecutar la prueba moderada de primer uso con 5 devs según `specs/002-captura-intercept/quickstart.md` y registrar tiempos y fricciones en `specs/002-captura-intercept/research.md` (SC-001: al menos 4 de 5 en < 2 min)
- [ ] T110 **Checkpoint final**: demo de punta a punta con los pasos 1–18 de `specs/002-captura-intercept/quickstart.md` en Chrome estable; `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm verify:dist && pnpm e2e` en verde; `research.md` sin "por registrar"; recordar la deuda de 001 (E5/T066, T067 y la definición de "en conflicto")

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sin dependencias.
- **Foundational (Phase 2)**: depende de Setup; bloquea todas las historias.
- **US1 (Phase 3)**: depende de Foundational. MVP.
- **US2 (Phase 4)**: depende de Foundational. Puede avanzar en paralelo con US1 en dominio y SW;
  la marca de regla en la lista de tráfico (T038) necesita los `effect` de US2 para probarse.
- **US3 (Phase 5)**: depende de US2 (estado vacío y editor de reglas, primera pausa).
- **US4 (Phase 6)**: depende de US2 (motor, cola, editor de reglas); las plantillas `mock503` y
  `slow3s` (T098) dependen de T081.
- **Polish (Phase 7)**: depende de las historias que se entreguen.

### Within Each Story

- Pruebas de dominio ⇒ dominio ⇒ pruebas del SW ⇒ SW ⇒ panel ⇒ E2E/a11y/sin cuelgues ⇒ checkpoint.
- `evaluate.ts` (T058) depende de T055–T057; `rule-engine.ts` (T068) depende de T058, T059,
  T066 y T067.

### Parallel Opportunities

- Setup: T002–T006.
- Foundational: T007–T010 juntas; T013–T015 juntas; T019, T020 y T028 en paralelo con el protocolo.
- US1: T032–T034 juntas; T038–T041 juntas.
- US2: T048–T054 juntas; T055–T057, T059 y T060 juntas; T061–T064 juntas.
- US3: T080 y T082 juntas.
- US4: T091 y T092 juntas.

---

## Parallel Example: User Story 2

```bash
# Pruebas de dominio, juntas:
Task: "status.test.ts en packages/domain/tests/"
Task: "headers-query.test.ts en packages/domain/tests/"
Task: "jsonpath.test.ts en packages/domain/tests/"
Task: "graphql.test.ts en packages/domain/tests/"
Task: "fetch-patterns.test.ts en packages/domain/tests/"
Task: "validate.test.ts en packages/domain/tests/"

# Pruebas del SW, juntas:
Task: "rule-store.test.ts en apps/extension/tests/integration/"
Task: "pause-queue.test.ts en apps/extension/tests/integration/"
Task: "action-executor.test.ts en apps/extension/tests/integration/"
Task: "rule-engine.test.ts en apps/extension/tests/integration/"
```

---

## Implementation Strategy

### MVP

1. Phase 1 y 2 ⇒ panel con pestañas y protocolo v2.
2. Phase 3 (US1) ⇒ ver el tráfico. **Detenerse y validar** (quickstart 2–4).
3. Phase 4 (US2) ⇒ pausar condicionalmente: la propuesta de valor central.
4. Phase 5 (US3) ⇒ primer uso: necesario para SC-001 antes de cualquier publicación.

### Incremental Delivery

- US1 ⇒ US2 ⇒ US3 ⇒ US4, con demo en cada checkpoint.
- Commit por tarea o grupo lógico (Conventional Commits), en la rama de implementación de 002.
- Si una medición (R7, R20) contradice el diseño, corregir el código y su prueba antes de seguir.

---

## Notes

- [P] = archivos distintos, sin dependencias pendientes.
- No añadir permisos ni dependencias fuera de `plan.md` sin actualizar sus tablas.
- Nunca registrar URLs, headers ni bodies en la consola; usar `logger.ts`.
- No marcar T109 ni T110 sin resultados reales.
