---
description: "Lista de tareas de 005-repeater-diff"
---

# Tasks: Repeater y diff de respuestas

**Input**: Design documents from `/specs/005-repeater-diff/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/panel-protocol.md,
contracts/manifest.md, contracts/storage.md, quickstart.md

**Tests**: obligatorias. La constitución (principio IV, NO NEGOCIABLE) exige TDD en el dominio y
pruebas que intenten violar las garantías de seguridad: cada prueba de dominio y de integración
se escribe, se ejecuta y **falla** antes de su implementación. Incluye la prueba de inyección en
`Runtime.callFunctionOn`, E2E en ambos modos, revisión axe y un checkpoint demostrable por
historia.

**Organization**: una fase por historia, en el orden de la entrada: US1 reenviar un request (P1)
y US2 comparar respuestas (P1). US2 usa los envíos de US1 para su E2E, pero su dominio (diff,
ignorados, redacción) no depende de US1 y puede hacerse en paralelo.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: se puede hacer en paralelo (archivos distintos, sin dependencias pendientes)
- **[USn]**: tarea de la historia de usuario n
- "Prueba primero" = escribir la prueba, verla fallar y solo entonces implementar
- Rutas abreviadas: `domain/` = `packages/domain/src/`; `dtests/` = `packages/domain/tests/`;
  `bg/` = `apps/extension/src/background/`; `panel/` = `apps/extension/src/panel/`; `e2e/` =
  `apps/extension/e2e/`; `tests/` = `apps/extension/tests/`; locales =
  `apps/extension/public/_locales/{es,en}/messages.json`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: versión, permiso opcional, experimentos de Chrome (X1–X3) y rutas del servidor de
prueba.

- [X] T001 Subir la versión a `0.5.0` en `apps/extension/package.json`; añadir `optional_host_permissions: ["http://*/*", "https://*/*"]` en `apps/extension/manifest.config.ts` (sin `host_permissions`); actualizar `tests/dist/manifest.test.ts` para exigir `permissions` exactamente `["debugger", "storage"]`, esos dos patrones opcionales y ningún `host_permissions` (contracts/manifest.md)
- [X] T002 [P] Añadir al servidor de prueba `e2e/fixtures/servers.ts`: `/echo` (devuelve en JSON método, headers recibidos —incluidas `cookie` y `origin`— y body), `/no-cors` (sin headers CORS), `/diff/a` y `/diff/b` (JSON con: campo añadido, eliminado, tipo cambiado, array por posición con un elemento distinto, `meta.timestamp` distinto, `Set-Cookie` y `access_token` distintos, `Location` con `?token=`), `/diff/ids` (mismo array de objetos con `id` reordenado y un elemento nuevo), `/diff/text` (texto plano de varias líneas), `/diff/big?seed=` (JSON de ~1 MB determinista), `/binary` (PNG pequeño) y una cookie de sesión al cargar la SPA (quickstart)
- [X] T003 [P] Escribir el experimento X1 en `e2e/experiments/x1-isolated-send.spec.ts` (research R1, R2): por CDP crudo, `Page.createIsolatedWorld` en el marco principal y `Runtime.callFunctionOn` con una función fija que hace `fetch` a `/echo` (argumento serializado); la página reemplaza antes `window.fetch`. Comprobar (a) cookie y `Origin` de la app en el eco, (b) `Network.requestWillBeSent` y `Fetch.requestPaused` del request, (c) que el `fetch` reemplazado no se llamó, (d) si `initiator.stack.callFrames[0].url` lleva el `//# sourceURL` de la función
- [X] T004 [P] Escribir el experimento X2 en `e2e/experiments/x2-clean-send.spec.ts` (research R5): desde el panel, en un clic, `chrome.permissions.request({ origins: [<origen de /no-cors>/*] })`; tras conceder, `fetch` del SW con `credentials: "omit"` a `/no-cors` y `/echo`: (a) la petición del permiso funciona en el panel, (b) se lee la respuesta sin CORS, (c) el eco no trae `cookie` ni `authorization`, (d) qué `Origin` envía
- [X] T005 [P] Escribir el experimento X3 en `e2e/experiments/x3-worker.spec.ts` (research R12): un worker mínimo del panel (`new Worker(new URL("./x3.worker.ts", import.meta.url), { type: "module" })`) responde a un mensaje en el build de prueba sin violaciones de CSP
- [X] T006 Ejecutar X1–X3 (`EXPERIMENTS=1 pnpm --filter @nahual/extension e2e e2e/experiments/x*`) y registrar resultados y respaldos elegidos en "Resultados" de `specs/005-repeater-diff/research.md`; si algún resultado obliga al respaldo de R1, R2, R5 o R12, actualizar ese apartado y `plan.md` antes de seguir

**Checkpoint**: `pnpm lint && pnpm typecheck && pnpm test` en verde; X1–X3 registrados.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: schemas y límites del dominio, protocolo v4 y la sección vacía en el panel.

**⚠️ CRITICAL**: ninguna historia empieza antes de terminar esta fase.

- [X] T007 Añadir a `LIMITS` en `domain/schemas/limits.ts`: `repeaterTabsMax: 20`, `repeaterSendsMax: 50`, `repeaterTabNameMax: 60`, `repeaterHeadersMax: 100`, `ignoreEndpointsMax: 500`, `ignoreEntriesMax: 100`, `diffChangesMax: 50_000`, `diffLineEditsMax: 20_000` (data-model)
- [X] T008 Prueba primero en `dtests/schemas.test.ts` y luego schemas en `domain/schemas/repeater.ts`: `RepeaterRequestSchema` (`method` `/^[A-Za-z]+$/` de 1–64; `url` http(s) absoluta ≤ `LIMITS.urlMax`; `headers` `{ name, value, enabled }[]` ≤ `repeaterHeadersMax`; `body` unión `none{reason?: "unavailable"|"evicted"|"tooLarge"}` | `text{text ≤ 5 MB UTF-8}` | `original{base64, contentType: string|null, size ≤ 5 MB}`), `RepeaterResponseSchema` (status 0–999, headers ≤ 500, body texto ≤ 5 MB o `BodyInfo`), `RepeaterSendSchema` con `state` `pending|done|failed|cancelled` y los códigos de error de data-model, `IgnoreListSchema` (`version: 1`, claves hex de 64 caracteres, `paths` y `headers` ≤ `ignoreEntriesMax`, ≤ `ignoreEndpointsMax` endpoints, sin campos de valor); exportar en `domain/index.ts`
- [X] T009 [P] Prueba primero en `dtests/schemas.test.ts` y luego `domain/schemas/diff.ts`: `PathSegmentSchema` (`{key}` | `{index}` | `{idField: "id"|"_id"|"uuid"|"key", id: string|number}`), `ComparableResponseSchema` (origin `original|send{sendId}|pasted`; `status`/`headers` `null` en la pegada; body texto o `unavailable{reason: binary|tooLarge|evicted|none, size}`), `DiffResultSchema` (data-model `DiffResult`, `BodyDiff` por `mode` `json|lines|metadata|equal`); exportar en `domain/index.ts`
- [X] T010 Protocolo v4 en `packages/protocol/src/`: `PROTOCOL_VERSION = 4` en `envelope.ts`; comandos `repeaterSend { sendId: uuid, mode: "page"|"clean", request }`, `repeaterCancel { sendId }`, `getIgnores { method, url }`, `setIgnores { method, url, paths, headers }` en `panel-to-sw.ts`; eventos `repeaterResult` e `ignores` en `sw-to-panel.ts`; `ExchangeFields.repeater?: { sendId: uuid }` en el schema del dominio; pruebas del sobre en `packages/protocol/tests/` (un `v: 3` se descarta; payloads fuera de límite rechazados) (contracts/panel-protocol.md)
- [X] T011 [P] Añadir la sección `repeater` a `SECTIONS` en `panel/shell/sections.ts` (contador = pestañas abiertas, tono neutro), con `RepeaterView` vacío que muestra el estado vacío "Envía un request desde Tráfico o crea una pestaña vacía" y explica que las pestañas no se guardan al cerrar DevTools (FR-003, FR-020a); claves i18n en `es` y `en`
- [X] T012 [P] Prueba primero en `tests/unit/shortcuts.test.ts` (unicidad y choque con `DEVTOOLS_RESERVED`) y luego añadir a `panel/shortcuts.ts`: `repeaterSend` como `{ code: "Enter", ctrl: true }` y `repeaterSendMac` `{ code: "Enter", meta: true }` (ámbito: pestaña del repeater), `nextChange` `{ key: "j" }` y `prevChange` `{ key: "k" }` (ámbito: vista de diff, fuera de campos de texto) (research R17)

**Checkpoint**: la sección Repeater aparece vacía en la barra; protocolo v4 en verde; atajos
únicos.

---

## Phase 3: User Story 1 - Reenviar un request (Priority: P1) 🎯 MVP

**Goal**: desde cualquier request capturado, abrir una pestaña editable y enviarla en contexto de
página o limpio, con historial y pestañas.

**Independent Test**: capturar un GET y un POST con JSON, enviarlos al repeater, editar URL y
body, enviarlos en los dos modos y comprobar en `/echo` lo recibido (cookies solo en contexto de
página) y el historial.

### Dominio (prueba primero)

- [X] T013 [P] [US1] Pruebas en `dtests/repeater-from-exchange.test.ts` y luego `domain/repeater/from-exchange.ts` `repeaterRequestFromExchange(exchange, body)`: copia método, URL y headers (todos `enabled`); body texto ⇒ `text`; base64 ⇒ `original` con `contentType` y `size`; no disponible ⇒ `none` con `reason` (`evicted`, `tooLarge`, `unavailable`); nombre por defecto `MÉTODO /ruta` recortado a 60 (FR-002, FR-002a)
- [X] T014 [P] [US1] Pruebas en `dtests/repeater-validate.test.ts` y luego `domain/repeater/validate.ts` `validateRepeaterRequest`: issues por campo (`method`, `url`, `headers.N.name`, `headers.N.value`, `body`) con `messageKey` de 002 cuando existe (`rule_error_url`, `rule_error_method`) y nuevas (`repeater_error_body_too_large`) (FR-007)
- [X] T015 [P] [US1] Pruebas en `dtests/forbidden-headers.test.ts` y luego `domain/repeater/forbidden-headers.ts` `forbiddenHeaders(headers, mode)` con la lista de nombres prohibidos de la especificación Fetch (`accept-charset`, `accept-encoding`, `access-control-request-headers`, `access-control-request-method`, `connection`, `content-length`, `cookie`, `cookie2`, `date`, `dnt`, `expect`, `host`, `keep-alive`, `origin`, `referer`, `set-cookie`, `te`, `trailer`, `transfer-encoding`, `upgrade`, `via`, prefijos `proxy-` y `sec-`), sin distinguir mayúsculas, solo headers `enabled` (FR-008, R6)

### Service worker (integración primero, CDP simulado)

- [X] T016 [US1] Pruebas en `tests/integration/repeater-page-send.test.ts` (fallan primero): con `FakeDebugger`, `sendPage` crea el mundo aislado una vez por documento (`Page.createIsolatedWorld` con `worldName: "nahual-repeater"` sobre el `frameId` principal), llama a `Runtime.callFunctionOn` con `functionDeclaration === PAGE_SEND` y el request **solo** en `arguments[0].value`; con cargas de inyección en URL, headers y body (`"); globalThis.__pwned=1; ("`, `</script>`, `${1}`, `` ` ``, `\n//# sourceURL=x`) la `functionDeclaration` sigue siendo idéntica (hash de `PAGE_SEND` fijado en la prueba) (SC-004)
- [X] T017 [US1] Implementar `bg/repeater/page-template.ts` (`PAGE_SEND`, `PAGE_ABORT` como constantes de texto con `/* nahual:page-template */`; `fetch` con `credentials: "include"` y `signal` de un `AbortController` registrado por `sendId`; termina con el `//# sourceURL=nahual-repeater` **constante** (el `sendId` va solo en `arguments`; la declaración nunca se arma con datos); devuelve `{ ok, status }` o `{ ok: false, errorName, message }` recortado a 256) y `bg/repeater/page-send.ts` hasta pasar T016 (research R1)
- [X] T018 [US1] Pruebas en `tests/integration/network-capture.test.ts` y luego en `bg/network-capture.ts`: con un envío en curso en la pestaña, el `requestWillBeSent` del marco principal con `initiator.stack.callFrames[0].url === "nahual-repeater"` marca el intercambio con `repeater: { sendId }` del envío en curso y llama a `onRepeaterExchange(tabId, sendId, exchangeId)`; sin envío en curso, otro marco u otro `url` de `initiator` no marcan nada; si X1 eligió el respaldo, implementar la correlación por método + URL + `initiator.type === "script"` en 2 s (research R2)
- [X] T019 [US1] Pruebas en `tests/integration/repeater-service.test.ts` y luego `bg/repeater/repeater-service.ts`: valida con `RepeaterRequestSchema` (inválido ⇒ `invalid_request` con issues, sin llamar a CDP ni a `fetch`); `page` solo si la pestaña del puerto está adjunta y en el sitio de la sesión (si no, `not_attached`/`context_lost`); arma `repeaterResult` con la respuesta de la captura (`getBody`, límites de 002), `ruleEffects` del intercambio, `preflight`, `relaxed`, `cors` y `notSentHeaders`; `sendId` repetido pendiente ⇒ `invalid_request`; el `tabId` sale del remitente, nunca del payload (research R3, R15)
- [X] T020 [US1] Pruebas y luego en `bg/repeater/repeater-service.ts` y `page-send.ts`: cola de envíos en contexto de página: uno a la vez por pestaña, los siguientes esperan en orden y se ven como "en cola" (research R2); `repeaterCancel` ejecuta `PAGE_ABORT` con el `sendId` como argumento (o lo saca de la cola) y termina con `cancelled` (idempotente); `Runtime.executionContextDestroyed` del mundo, navegación del marco principal a otro sitio, detach y cierre de pestaña ⇒ `context_lost` para todos los pendientes; 5 min sin terminar ⇒ `timeout` en **ambos modos** (en contexto limpio aborta el `fetch`); el mundo se recrea en el siguiente envío (research R4)
- [X] T021 [US1] Pruebas en `tests/integration/repeater-clean-send.test.ts` (fallan primero) y luego `bg/repeater/clean-send.ts`: sin `chrome.permissions.contains` para el origen ⇒ `permission_required` con `params: [origen]` y **ningún** `fetch`; con permiso ⇒ `fetch` con `credentials: "omit"`, `cache: "no-store"`, `redirect: "follow"`, `signal`; body leído por stream con corte en 5 MB (`tooLarge`, sin texto); binario por `content-type` ⇒ solo metadatos; errores de red ⇒ `network`; cancelar aborta; marcar la llamada con `/* nahual:repeater-clean-send */` (research R5)
- [X] T022 [US1] Cablear en `bg/app.ts` los comandos `repeaterSend` y `repeaterCancel` hacia el servicio y el evento `repeaterResult` al puerto que lo pidió; el body `original` se decodifica de base64 en ambos modos (research R16)
- [X] T023 [US1] Ampliar `tests/dist/no-network.test.ts`: `fetch(` solo se permite en el chunk del SW junto a `/* nahual:repeater-clean-send */` y dentro del texto de `PAGE_SEND` junto a `/* nahual:page-template */`; comprobar que hay exactamente esos dos y que el texto de `PAGE_SEND` en el bundle coincide con el hash fijado (research R14)

### Panel (prueba primero en la lógica pura)

- [X] T024 [P] [US1] Pruebas en `tests/unit/repeater-store.test.ts` y luego `panel/store/repeater.ts`: abrir pestaña desde un request (con `source`), pestaña vacía (GET, URL en blanco), límite de 20 pestañas (no se abre más; motivo para el aviso), `mode` inicial `"page"`, renombrar (1–60), duplicar (copia `name` con sufijo, `mode`, `draft`; no `sends`, `source` ni `pasted`), cerrar a `recentlyClosed` 10 s y deshacer, historial más reciente primero con tope 50 y `droppedCount`, transiciones `pending → done|failed|cancelled` por `repeaterResult`; sin persistencia (research R13, FR-018–FR-021)
- [X] T025 [P] [US1] Prueba en `tests/unit/request-actions.test.ts` y luego añadir `sendToRepeater` a `REQUEST_ACTIONS` en `panel/actions/request-actions.ts` (`appliesTo: () => true`; `run`: pide `getBody(request)`, arma el request con `repeaterRequestFromExchange`, guarda como `source` la respuesta original y abre la sección Repeater) (FR-001, FR-002)
- [X] T026 [US1] `panel/components/repeater/RepeaterView.tsx` y `RepeaterTabs.tsx`: pestañas (`Tabs` de 004) con menú Renombrar/Duplicar/Cerrar, aviso "Deshacer" de 10 s, "Nueva pestaña", `SplitPane` editor | respuesta e historial con reparto en `nahual.ui.v1.split.repeater` (0.2–0.8) (FR-020, contracts/storage.md)
- [X] T027 [US1] `panel/components/repeater/RequestEditor.tsx`: método, URL, `HeadersEditor` de 002 con casilla "activo" por header y enmascarado de sensibles con "Mostrar" (FR-006), marca de headers prohibidos con su explicación (FR-008), body con `BodyEditor` de 002 o, si es `original`, tipo, tamaño y "Reemplazar por texto" con deshacer, o el aviso de `none` (FR-002a); errores de `validateRepeaterRequest` por campo bloquean "Enviar" (FR-007)
- [X] T028 [US1] `panel/components/repeater/ModeSwitch.tsx`: modo visible siempre (dos botones de selección con `aria-pressed`), contexto de página deshabilitado con motivo y solución cuando no hay sesión adjunta o el sitio cambió (FR-009, FR-012)
- [X] T029 [US1] Envío en `RepeaterView`: "Enviar", `Ctrl+Enter`/`Cmd+Enter` con el foco en la pestaña, progreso y "Cancelar" (FR-014); ante `permission_required`, `chrome.permissions.request` del origen en el mismo gesto (o botón "Conceder acceso a <origen>" si el gesto se perdió, según X2) y reenvío; denegado ⇒ error con causa y "Usar contexto de página" (FR-011a)
- [X] T030 [US1] `panel/components/repeater/SendResult.tsx` y `SendHistory.tsx`: respuesta con status, headers, body (`BodyView` de 002), tiempo y tamaño (FR-015); reglas que actuaron con enlace a la regla, preflight, diagnóstico CORS de 003 y headers no enviados (FR-010a, FR-016); error con causa y solución (FR-017); historial con hora, método, URL, modo, status o error, tiempo y tamaño, y "Cargar en el editor" (FR-018, FR-019); aviso de envíos descartados
- [X] T031 [US1] Marca "repeater" en `panel/components/traffic/TrafficGrid.tsx` (texto accesible además del icono) para intercambios con `repeater` (FR-010a)
- [X] T032 [US1] Orígenes con acceso concedido en `panel/settings/GeneralSettings.tsx` (`chrome.permissions.getAll`, "Quitar" con `chrome.permissions.remove`) (FR-011a)
- [X] T033 [P] [US1] Claves i18n del editor, modos, envío, errores (`not_attached`, `context_lost`, `network`, `cors_blocked`, `permission_required`, `permission_denied`, `timeout`, `cancelled`, `body_too_large` con causa y solución), historial y pestañas en `es` y `en`

### E2E y checkpoint

- [X] T034 [US1] `e2e/repeater-send.spec.ts`: "Enviar al repeater" desde el menú contextual y la cabecera del detalle abre la pestaña con método, URL, headers y body (GET y POST con JSON); `Ctrl+Enter` envía; contexto de página: `/echo` recibe la cookie y el `Origin` de la app y la fila aparece en Tráfico marcada "repeater"; contexto limpio a `/no-cors` y `/echo`: tras conceder el permiso, se lee la respuesta y el eco no trae cookies (SC-005); denegar ⇒ error con causa; regla de pausa ⇒ el envío aparece en Pausados y el resultado nombra la regla; header `Cookie` marcado y listado como no enviado; renombrar, duplicar, cerrar y deshacer; navegar a otro sitio deshabilita el contexto de página; cancelar un envío lento; dos envíos seguidos en contexto de página salen en orden y cada resultado lleva su propia respuesta (R2); binario `/binary` reenviado intacto (FR-002a); CORS en contexto de página (FR-010, FR-016): un envío a `/cors/preflight-401` muestra el preflight y el diagnóstico de 003, uno a `/cors/none` muestra el bloqueo y, tras "Permitir CORS para desarrollo" en ese par de orígenes, el siguiente envío marca `relaxed` y trae la respuesta; contenido como texto (FR-035): una respuesta con `<script>window.__xss=1</script>` y `<img src=x onerror="window.__xss=2">` se muestra literal en el resultado y el historial, y `window.__xss` no existe en el panel
- [X] T035 [US1] `e2e/repeater-injection.spec.ts` (SC-004): envíos en contexto de página con las cargas de T016 en URL (query y ruta), nombre y valor de header y body; `globalThis.__pwned` no existe en la página ni en el SW, y `/echo` recibió los valores literales
- [X] T036 [US1] Medir en `e2e/repeater-send.spec.ts` (tag `@perf`) el tiempo de "Enviar al repeater" a respuesta mostrada en el fixture (< 2 s) y registrar en "Resultados" de research.md como parte de SC-001
- [X] T037 [US1] Ampliar `e2e/a11y.spec.ts`: axe sin violaciones serias en el repeater vacío, con pestañas, editor con errores, envío en curso, resultado con error y historial, en claro y oscuro a 320 px (SC-007); recorrido solo con teclado (FR-033): desde la fila de Tráfico con `Shift+F10` ⇒ "Enviar al repeater", editar URL y un header, cambiar de modo, `Ctrl+Enter`, moverse entre pestañas del repeater con flechas, renombrar y cerrar con deshacer, todo con foco visible y sin trampas de foco

**Checkpoint (demostrable)**: pasos 1–8 de quickstart.md; `pnpm e2e` en verde.

---

## Phase 4: User Story 2 - Comparar respuestas (Priority: P1)

**Goal**: diff entre dos respuestas (original, envíos o pegada): status, headers y body por
estructura o por líneas, con ignorados por endpoint y redacción.

**Independent Test**: comparar `/diff/a` con `/diff/b` y `/diff/ids`, ignorar el timestamp y
comprobar que se recuerda; los valores sensibles salen redactados.

### Dominio (prueba primero: suite de SC-002)

- [X] T038 [P] [US2] Pruebas en `dtests/diff-json.test.ts` y luego `domain/diff/json.ts` `diffJson`: añadido/eliminado/cambiado con ruta; anidación profunda; claves reordenadas sin cambios; tipo cambiado (número↔texto, objeto↔array, `null`↔objeto) como un solo `changed`; arrays por posición (elemento distinto, más largo, más corto); arrays por identidad con el primero de `id`, `_id`, `uuid`, `key` que tengan **todos** con valores únicos (texto o número) en cada lado: reordenar no cuenta, nuevo = añadido, falta = eliminado, cambio dentro con ruta `[id=42]`; si falta en algún elemento o hay repetidos, por posición; `arrays[]` con el criterio usado; `truncated` al pasar `diffChangesMax`; invariantes de data-model (`diff(a,a)` vacío, intercambiar lados invierte added/removed) (FR-025, FR-025a, R7)
- [X] T039 [P] [US2] Pruebas en `dtests/diff-path.test.ts` y luego `domain/diff/path.ts` `formatPath`: `$.a.b[2]`, `$.items[id=42].price`, `$["x-y"]`, claves con comillas y corchetes escapadas
- [X] T040 [P] [US2] Pruebas en `dtests/diff-lines.test.ts` y luego `domain/diff/lines.ts` `diffLines` (Myers, espacio lineal): iguales, solo añadidas, solo eliminadas, mezcla con contexto, `\r\n` normalizado, vacíos, `truncated` con recuento al pasar `diffLineEditsMax` (FR-026, R8)
- [X] T041 [US2] Pruebas en `dtests/diff-responses.test.ts` y luego `domain/diff/responses.ts` `diffResponses`: status cambiado; headers por nombre en minúsculas (añadido, eliminado, cambiado, repetidos como lista ordenada); body JSON válido en ambos ⇒ `json`; alguno inválido ⇒ `lines` con nota `json_expected` si el `content-type` decía JSON; binario, > 5 MB o no disponible ⇒ `metadata` con nota `body_not_compared`; pegada ⇒ solo body; iguales ⇒ `equal` y `total: 0` (FR-022a, FR-024, FR-026, FR-027, R9)
- [X] T042 [P] [US2] Pruebas en `dtests/diff-ignores.test.ts` y luego `domain/diff/ignores.ts` `applyIgnores`: rutas exactas, `[*]` para cualquier elemento, headers sin distinguir mayúsculas; los ignorados pasan a `ignored` y salen de `total` (FR-028, R10)
- [X] T043 [P] [US2] Pruebas en `dtests/diff-redact.test.ts` y luego `isSensitiveName` en `domain/sensitive.ts` (criterio de `isSensitiveHeader` + `password`) y `domain/diff/redact.ts` `redactDiff`: headers sensibles, cambios JSON con último segmento de clave sensible a cualquier profundidad, valores de `"clave": valor` y de parámetros de query sensibles dentro de líneas, query sensible en URLs de headers (`Location`); conserva `changed` y `sensitive: true`; **ningún** valor secreto de la suite aparece en el resultado serializado; los valores reales se devuelven aparte (FR-030, R11, SC-006)
- [X] T044 [P] [US2] Pruebas en `dtests/repeater-endpoint.test.ts` y luego `domain/repeater/endpoint.ts` `endpointKeyInput(method, url)` = `"<MÉTODO> <origen><ruta>"` sin query ni fragmento, método en mayúsculas

### Service worker

- [X] T045 [US2] Pruebas en `tests/integration/ignores-store.test.ts` y luego `bg/repeater/ignores-store.ts`: clave `sha256(endpointKeyInput)` en hex con `crypto.subtle`; `setIgnores` valida con `IgnoreListSchema` (rechaza valores y pasa límites ⇒ `ignores_invalid`), recorta a 100 entradas, descarta el endpoint de `usedAt` más antiguo al pasar de 500; lectura inválida ⇒ lista vacía y aviso `repeater_ignores_invalid`; cablear `getIgnores`/`setIgnores` en `bg/app.ts` (R10, contracts/storage.md)

### Panel

- [X] T046 [US2] Worker `panel/repeater/diff.worker.ts` (entrada validada con Zod: `requestId`, dos `ComparableResponse` + ignorados; salida `DiffResult` redactado + valores reales aparte) y `panel/repeater/diff-client.ts` (cola de uno, cancelación al cerrar el diff, timeout de 10 s ⇒ resultado `truncated` con explicación; **valida la salida** con `DiffResultSchema` y solo acepta mensajes de la instancia `Worker` que creó con el `requestId` en curso; un mensaje inválido o ajeno se descarta, se registra y el diff termina con "No se pudo comparar"), con pruebas de `diff-client` en `tests/unit/diff-client.test.ts` sobre un worker simulado, incluidos mensajes inválidos, de otro `requestId` y tardíos tras cancelar (R12, principio I)
- [X] T047 [US2] Selección de lados en `SendHistory.tsx` y `RepeaterView.tsx`: "Comparar con el original" en cada envío con `source`; elegir dos envíos; incluir la respuesta pegada; "antes" y "después" rotulados e intercambiables (FR-022, FR-023); pedir con `getBody` los bodies que falten (original desalojado ⇒ `unavailable`)
- [X] T048 [P] [US2] `panel/components/repeater/PastedResponse.tsx`: pegar, editar y quitar un body (JSON o texto, ≤ 5 MB), uno por pestaña (FR-022a)
- [X] T049 [US2] `panel/components/repeater/DiffView.tsx`: resumen (status, total, ignorados, criterio de cada array, notas), lista de cambios con prefijo e icono `+`/`−`/`~` y texto accesible equivalente (FR-031), ruta y valores antes/después como texto; diff por líneas con número de línea; "Cambio siguiente/anterior" con botones y `J`/`K` moviendo foco y vista (FR-032); "Sin diferencias"; "Comparando…" con cancelar
- [X] T050 [US2] Ignorar desde `DiffView`: "Ignorar esta ruta"/"Ignorar este header" (y `[*]` en elementos de array) y desmarcar desde la lista de ignorados; `setIgnores` del endpoint y nuevo cálculo; al abrir un diff, `getIgnores` del endpoint del request (FR-028, FR-029)
- [X] T051 [US2] "Mostrar valores sensibles" en `DiffView`: revela los valores reales solo en ese diff, en memoria, y se olvida al cerrarlo (FR-030)
- [X] T052 [P] [US2] Claves i18n del diff (antes/después, tipos de cambio con su texto accesible, notas, criterios de array, ignorados, sensibles, "Sin diferencias", "Comparando…", truncado) en `es` y `en`

### E2E y checkpoint

- [X] T053 [US2] `e2e/repeater-diff.spec.ts`: `/diff/a` frente a `/diff/b` lista exactamente los cambios conocidos con su ruta y prefijo; status y headers; `J`/`K` recorren los cambios; ignorar `$.meta.timestamp`, cerrar, reenviar y comparar ⇒ sigue ignorado; `/diff/ids` ⇒ solo el elemento nuevo y "por id"; `/diff/text` ⇒ por líneas; JSON inválido ⇒ por líneas con aviso; binario ⇒ solo metadatos; respuesta pegada como "antes"; dos envíos del historial; intercambiar lados con los rótulos "Antes"/"Después" y su procedencia (FR-023); un diff de dos respuestas con HTML y scripts los muestra como texto y no ejecuta nada en el panel (FR-035) (SC-002 en E2E)
- [X] T054 [US2] Redacción en `e2e/repeater-diff.spec.ts` (SC-006): el texto completo del diff no contiene los valores de `Set-Cookie`, `access_token` ni el `token` de `Location`; muestra que cambiaron; "Mostrar valores sensibles" los revela y al reabrir el diff vuelven a estar redactados
- [X] T055 [US2] `e2e/repeater-perf.spec.ts` (tag `@perf`): diff de dos `/diff/big` de ~1 MB distintos < 1 s hasta mostrar el total, sin tareas largas > 50 ms en el panel (`PerformanceObserver` `longtask`) (SC-003); registrar en "Resultados" de research.md
- [X] T056 [US2] Ampliar `e2e/a11y.spec.ts`: axe sin violaciones serias en el diff JSON, por líneas, con ignorados, con sensibles revelados y "Sin diferencias", en claro y oscuro a 320 px (SC-007); recorrido solo con teclado (FR-033): elegir dos envíos para comparar, `J`/`K` entre cambios, ignorar una ruta, mostrar sensibles y cerrar el diff con Escape (sin abrir la consola de DevTools, D2 de 004), con el foco de vuelta en el disparador

**Checkpoint (demostrable)**: pasos 9–14 de quickstart.md; `pnpm e2e` en verde.

---

## Phase 5: Polish & Cross-Cutting Concerns

- [X] T057 [P] Ampliar `e2e/storage-privacy.spec.ts` (SC-005a): tras envíos en ambos modos con cookies, `Authorization`, `access_token` en body y `?token=` en query, una respuesta pegada y un diff con ignorados, ningún valor de esos requests ni respuestas está en `chrome.storage.local`, `localStorage` ni IndexedDB; las claves de `nahual.repeater.ignores.v1` son hashes de 64 caracteres; `nahual.ui.v1` solo suma `split.repeater`
- [X] T058 [P] Prueba E2E de SC-005b en `e2e/repeater-send.spec.ts`: sin clic en "Enviar" en contexto limpio no se pide ningún permiso; cada petición abarca un solo origen exacto (gancho solo del build de pruebas `__nahualPermissionsSpy` en `panel/test-slots.tsx` que envuelve `chrome.permissions.request` y registra cada llamada y sus orígenes; `tests/dist/no-network.test.ts` comprueba que no existe en producción)
- [X] T059 [P] Capturas en `e2e/visual/panel.visual.spec.ts`: repeater con pestañas y resultado, editor con body original binario, diff JSON y diff por líneas, en claro y oscuro a 320, 800 y 1280 px (puertos fijos; máscaras para tiempos y fechas)
- [X] T060 [P] Comprobar en `tests/unit/` que `sendToRepeater` aparece en la cabecera del detalle y en el menú contextual con el mismo texto (catálogo único de 004) y que la ayuda y Ajustes ⇒ Atajos listan `Ctrl/Cmd+Enter`, `J` y `K`
- [X] T061 Medir el camino del tráfico con E4 de 001 (`E4_TARGET_URL` local) con la detección de `initiator` activa: sin regresión > 1 ms p95 frente a 004; registrar en "Resultados" de research.md (R18, principio VI)
- [X] T062 [P] Actualizar `README.md` (repeater, modos, permiso opcional por origen, diff) y la ayuda del panel (`panel/components/Onboarding.tsx` en modo ayuda) con el flujo del repeater
- [X] T063 Revisión de implementación en `specs/005-repeater-diff/plan.md` (sección "Revisión de implementación"): permisos y `verify:dist`, dependencias (ninguna), modelo de amenazas (inyección, página maliciosa, fuga de credenciales, abuso del permiso de host, contexto limpio), tamaños de bundle, definición de terminado por historia
- [X] T064 Ejecutar la suite completa 3 veces seguidas (`pnpm e2e`) y la visual; registrar estabilidad en "Resultados" de research.md
- [X] T065 **Checkpoint final**: demo de punta a punta con los pasos 1–17 de `specs/005-repeater-diff/quickstart.md` en Chrome estable; prueba de comprensión (SC-008) con al menos 1 dev, cronometrando también SC-001 (de request capturado a reenviado < 10 s), con los tiempos en research.md; `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm verify:dist && pnpm e2e && pnpm --filter @nahual/extension e2e:visual` en verde; research.md sin "por registrar"; recordar la deuda de 001 (E5/T066, T067 y la definición de "en conflicto") y la feature futura de edición de bodies no textuales — validado por el usuario en Chrome el 2026-10-25

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sin dependencias. T006 depende de T003–T005; sus resultados pueden cambiar
  R1, R2, R5 o R12 antes de la fase 3.
- **Foundational (Phase 2)**: depende de Setup. T008/T009 dependen de T007; T010 de T008.
  Bloquea ambas historias.
- **US1 (Phase 3)**: depende de Foundational.
- **US2 (Phase 4)**: su dominio (T038–T044) solo depende de T009 y puede ir en paralelo con US1;
  el SW (T045) depende de T010; el panel (T046–T051) y sus E2E dependen del store y los envíos de
  US1 (T024, T029, T030).
- **Polish (Phase 5)**: depende de US1 y US2.

### Within Each User Story

- Pruebas de dominio e integración antes de su implementación (deben fallar primero).
- Dominio → SW → panel → E2E → axe → checkpoint.
- T016 → T017 → T018 → T019 → T020 (mismo módulo y su servicio); T021 es independiente de
  T016–T020 salvo T019 (servicio).

### Parallel Opportunities

- Setup: T002–T005 en paralelo.
- Foundational: T009, T011 y T012 en paralelo tras T007.
- US1: T013–T015 en paralelo; T024 y T025 en paralelo con el SW; T033 en cualquier momento.
- US2: T038–T040 y T042–T044 en paralelo (archivos distintos); T048 y T052 en paralelo con
  T049.
- Polish: T057–T060 y T062 en paralelo.

## Parallel Example: User Story 2 (dominio)

```text
Task: "T038 diffJson con arrays por identidad en packages/domain/src/diff/json.ts"
Task: "T040 diffLines (Myers) en packages/domain/src/diff/lines.ts"
Task: "T042 applyIgnores en packages/domain/src/diff/ignores.ts"
Task: "T043 redactDiff e isSensitiveName en packages/domain/src/diff/redact.ts"
Task: "T044 endpointKeyInput en packages/domain/src/repeater/endpoint.ts"
```

## Implementation Strategy

### MVP First (User Story 1)

1. Setup con X1–X3 registrados (ajustar el diseño si algún respaldo aplica).
2. Foundational: schemas, protocolo v4, sección vacía, atajos.
3. US1 completa: reenviar en ambos modos con historial y pestañas; inyección y axe.
4. **Parar y validar**: pasos 1–8 de quickstart.md. Ya ahorra repetir flujos en la app.

### Incremental Delivery

1. US1 ⇒ demo del reenvío.
2. US2 ⇒ demo del diff (pasos 9–14).
3. Polish ⇒ privacidad, visual, rendimiento, revisión y checkpoint final.

### Notes

- [P] = archivos distintos, sin dependencias pendientes.
- Nunca dos procesos de Playwright a la vez (cada uno borra `test-results/`).
- Commit por tarea o grupo lógico; cada checkpoint deja la suite en verde.
