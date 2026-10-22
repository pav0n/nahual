---

description: "Lista de tareas de 001-spike-cdp"
---

# Tasks: Spike CDP y base del proyecto

**Input**: Design documents from `/specs/001-spike-cdp/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/panel-protocol.md, contracts/manifest.md, quickstart.md

**Tests**: obligatorias. La constitución (principio IV, NO NEGOCIABLE) exige TDD: cada prueba se
escribe, se ejecuta y **falla** antes de su implementación.

**Organization**: la spec tiene una sola historia (US1, P1). Para que sea manejable, la fase de
US1 se divide en bloques (sesión, intercepción, panel, E2E, experimentos), todos con `[US1]`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: se puede hacer en paralelo (archivos distintos, sin dependencias pendientes)
- **[US1]**: tarea de la historia de usuario 1
- Rutas relativas a la raíz del repo, según la estructura de `plan.md`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: monorepo, calidad, configuración de pruebas y CI antes de cualquier código.

- [X] T001 Crear `package.json` raíz (privado, `"packageManager": "pnpm@10.x"` exacto, `"engines": { "node": ">=24" }`, scripts `lint`, `typecheck`, `test`, `build`, `e2e`, `format` delegando en `turbo run`), `pnpm-workspace.yaml` con `apps/*` y `packages/*`, `.nvmrc` con `24` y `.npmrc` con `save-exact=true` y `engine-strict=true`
- [X] T002 Crear `turbo.json` con tareas `build` (outputs `dist/**`), `build:test` (outputs `dist-test/**`), `typecheck`, `lint`, `test` (outputs `coverage/**`, no lee `dist`), `verify:dist` (depende de `build` y `build:test`) y `e2e` (depende de `build:test`, sin caché)
- [X] T003 [P] Crear `tsconfig.base.json` con `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `moduleResolution: "bundler"`, `target: "ES2022"`, `verbatimModuleSyntax`
- [X] T004 [P] Crear `eslint.config.js` (flat config con `typescript-eslint` estricto y `eslint-plugin-react-hooks`) que prohíba `no-eval`, `no-implied-eval`, `no-new-func`, y vía `no-restricted-properties`/`no-restricted-syntax` las asignaciones a `innerHTML`/`outerHTML`, `insertAdjacentHTML`, `document.write` y la prop JSX `dangerouslySetInnerHTML`; crear `.prettierrc` y `.prettierignore`
- [X] T005 [P] Crear `packages/domain/package.json`, `packages/domain/tsconfig.json`, `packages/domain/src/index.ts` (export vacío con comentario "lógica de dominio a partir de 002"), `packages/domain/vitest.config.ts` con cobertura v8 y umbral 85% (lines, functions, branches, statements) y `packages/domain/tests/smoke.test.ts`
- [X] T006 [P] Crear `packages/protocol/package.json` (dependencia `zod` exacta), `packages/protocol/tsconfig.json` y `packages/protocol/vitest.config.ts` con cobertura v8 y umbral 85%
- [X] T007 Crear `apps/extension/package.json` (dependencias `react`, `react-dom`, `zod`, `@nahual/protocol` workspace; dev `vite`, `@vitejs/plugin-react`, `@crxjs/vite-plugin`, `@types/chrome`, `vitest`, `@playwright/test`, `@axe-core/playwright`), `apps/extension/tsconfig.json`, `apps/extension/vite.config.ts` (crxjs + react, `build.target: "chrome120"`, sin sourcemaps inline; `--mode test` escribe en `dist-test`), scripts `build` (`vite build`), `build:test` (`vite build --mode test`), `test` y `verify:dist`, `apps/extension/vitest.config.ts` (entorno `node`, `include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"]`) y `apps/extension/vitest.dist.config.ts` (`include: ["tests/dist/**/*.test.ts"]`, usado por `verify:dist`)
- [X] T008 [P] Crear `apps/extension/playwright.config.ts` (proyecto único Chromium, `workers: 1`, `testDir: "e2e"`, `retries: 0`, trazas en fallo) y `apps/extension/e2e/fixtures/extension.ts` con un fixture que lance `chromium.launchPersistentContext` con `--disable-extensions-except` y `--load-extension` apuntando a `apps/extension/dist-test` (y, si la prueba lo pide, también a `apps/extension/e2e/fixtures/conflict-extension`), y exponga `extensionId` leyendo la URL del service worker
- [X] T009 [P] Crear `apps/extension/e2e/fixtures/servers.ts`: dos servidores HTTP de Node en puertos distintos (origen A: página de prueba con botones que hacen `fetch` a la API; origen B: API JSON con CORS para el origen A, endpoint `/redirect` que responde 302 y endpoint `/echo-headers` que devuelve los headers recibidos)
- [X] T010 [P] Crear `apps/extension/e2e/fixtures/conflict-extension/manifest.json` y `apps/extension/e2e/fixtures/conflict-extension/background.js`: extensión auxiliar MV3 (solo permiso `debugger`, sin código remoto) que define `globalThis.conflict = { attach(tabId), detach(tabId) }` en su service worker (sin listeners de mensajes ni `externally_connectable`), para actuar como segundo cliente de debugger en la E2E
- [X] T011 Instalar dependencias con `pnpm install` y commitear `pnpm-lock.yaml`; verificar que `package.json` de cada paquete solo tiene versiones exactas y que la lista coincide con la tabla de Dependencias de `specs/001-spike-cdp/plan.md`
- [X] T012 [P] Crear `scripts/build-zip.mjs`: empaqueta `apps/extension/dist` en `apps/extension/nahual.zip` con archivos ordenados y fecha fija tomada de `SOURCE_DATE_EPOCH`, e imprime su SHA-256
- [X] T013 [P] Crear `scripts/check-licenses.mjs`: lee `pnpm licenses list --json` y falla si alguna dependencia de producción no tiene licencia de la lista permitida (`MIT`, `Apache-2.0`, `ISC`, `BSD-2-Clause`, `BSD-3-Clause`, `0BSD`) o si una de desarrollo no está en esa lista ni en `MPL-2.0`; imprime el paquete y la licencia que fallan (FR-018a)
- [X] T014 Crear `.github/workflows/ci.yml` (push y PR; Node 24; `corepack enable`; `pnpm install --frozen-lockfile`; `pnpm lint`; `pnpm typecheck`; `pnpm test`; `pnpm audit --prod --audit-level high`; `node scripts/check-licenses.mjs`; `pnpm verify:dist`; build + `scripts/build-zip.mjs` dos veces con el mismo `SOURCE_DATE_EPOCH` y fallar si los SHA-256 difieren; `pnpm e2e` (sobre `dist-test`) con `xvfb-run`; permisos del workflow `contents: read`)

**Checkpoint**: `pnpm lint && pnpm typecheck && pnpm test` pasan con el smoke test; CI en verde.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: contratos de mensajes, i18n, manifest, adaptador CDP simulado y puerto validado.
Nada de US1 empieza antes de este checkpoint.

### Protocolo (pruebas primero)

- [ ] T015 [P] Escribir `packages/protocol/tests/envelope.test.ts`: acepta `{ v: 1, id: <uuid v4>, type, payload }`; rechaza `v ≠ 1`, `id` que no sea UUID v4, `correlationId` presente que no sea UUID v4, campos extra, `payload` ausente
- [ ] T016 [P] Escribir `packages/protocol/tests/panel-to-sw.test.ts` con un caso válido y varios inválidos por comando de `contracts/panel-protocol.md`: `hello { tabId: int ≥ 0 }`; `attach {}`; `detach {}`; `reconnect {}`; `setPatterns { patterns }` con "0–10 elementos", `urlPattern` "1–2 048 caracteres … sin espacios" y `stage` `"request" | "response"`; `setPauseTimeout { seconds: int 5–120 }` (rechaza 4, 121, 30.5); `continue { pausedId, headers?: HeaderEdit[] (≤ 50) }` con `name` "1–256 caracteres, token HTTP válido (RFC 9110)" y `value` "string | null", rechazando `\r` o `\n` en `value`, con `value` de hasta "0–8 192 caracteres"
- [ ] T017 [P] Escribir `packages/protocol/tests/sw-to-panel.test.ts`: `ack`, `error { code: ErrorCode, messageKey }` con los 8 `ErrorCode` del contrato, `state { status: "detached" | "attaching" | "attached" | "conflict", cause, attachedAt, patterns, pauseTimeoutSeconds }`, `paused` (campos de `PausedRequest` de `data-model.md` sin `state`), `resolved { pausedId, outcome: "continued" | "modified" | "timed_out" | "failed" | "abandoned", errorKey? }`; `type` desconocido ⇒ rechazado
- [ ] T018 Implementar `packages/protocol/src/envelope.ts` (schema del sobre y `PROTOCOL_VERSION = 1`) hasta que pase T015
- [ ] T019 [P] Implementar `packages/protocol/src/panel-to-sw.ts` (unión discriminada por `type`, schemas `InterceptionPattern`, `HeaderEdit`) hasta que pase T016
- [ ] T020 [P] Implementar `packages/protocol/src/sw-to-panel.ts` (unión discriminada, `ErrorCode`, `Header`, `PausedRequestView`) hasta que pase T017
- [ ] T021 Implementar `packages/protocol/src/index.ts` con `parsePanelMessage(raw): Result` y `parseSwMessage(raw): Result` que nunca lanzan, más helpers `makeCommand(type, payload)` / `makeEvent(type, payload, correlationId?)` que generan `id` con `crypto.randomUUID()`; verificar cobertura ≥ 85% en `packages/protocol`

### i18n y manifest

- [ ] T022 [P] Crear `apps/extension/public/_locales/es/messages.json` y `apps/extension/public/_locales/en/messages.json` con `extName`, `extDescription`, `panelTitle`, textos de estado ("adjunto", "desconectado", "en conflicto", "conectando"), cada causa de `data-model.md`, cada `ErrorCode` con causa y solución, y textos de botones, formulario y lista de pausados
- [ ] T023 [P] Crear `apps/extension/src/shared/i18n.ts` con `t(key, substitutions?)` sobre `chrome.i18n.getMessage` que, si la clave falta, devuelve la clave y hace `console.warn`
- [ ] T024 Escribir `apps/extension/tests/dist/manifest.test.ts` (falla primero; corre con `pnpm verify:dist`, que depende de `build` y `build:test`): lee `apps/extension/dist/manifest.json` y comprueba exactamente lo de `contracts/manifest.md` (`permissions` = `["debugger","storage"]`, CSP `script-src 'self'; object-src 'self'`, `default_locale: "es"`, `minimum_chrome_version: "120"`, ausencia de `host_permissions`, `optional_host_permissions`, `content_scripts`, `externally_connectable`, `web_accessible_resources`, `sandbox`) y que `_locales/es` y `_locales/en` tienen el mismo conjunto de claves; además, que ningún archivo de `apps/extension/dist` contiene la cadena `__nahualTestTabId` y que `apps/extension/dist-test` sí la contiene
- [ ] T025 Crear `apps/extension/manifest.config.ts` con `defineManifest` según `contracts/manifest.md` (SW `src/background/index.ts` tipo módulo, `devtools_page: "src/devtools/devtools.html"`) hasta que pase T024 tras `pnpm build`

### Adaptador CDP y CDP simulado

- [ ] T026 Crear `apps/extension/src/background/debugger-port.ts`: interfaz `DebuggerPort` con `attach(tabId)`, `detach(tabId)`, `send(tabId, method, params)`, `getTargets()`, `onEvent(listener)`, `onDetach(listener)`; tipos mínimos de `Fetch.requestPaused`, `Fetch.RequestPattern` y razones de detach
- [ ] T027 [P] Crear `apps/extension/tests/fakes/fake-debugger.ts`: implementación en memoria de `DebuggerPort` que registra cada `send`, permite emitir `Fetch.requestPaused` y `onDetach` con razón, simular errores de `attach` ("Another debugger is already attached", páginas restringidas) y de `send`, y exponer `getTargets()` con `extensionId`
- [ ] T028 [P] Crear `apps/extension/src/background/chrome-debugger.ts`: implementación de `DebuggerPort` sobre `chrome.debugger` (versión de protocolo `"1.3"`), que traduce `chrome.runtime.lastError`/rechazos a errores tipados (`already_attached`, `restricted_page`, `cdp_error`)

### Puerto validado (pruebas de seguridad primero)

- [ ] T029 Escribir `apps/extension/tests/integration/panel-port.test.ts` (debe fallar): con un `chrome.runtime` simulado comprueba que se cierra sin procesar mensajes un puerto con `name ≠ "nahual-panel"`, con `sender.id` distinto de `chrome.runtime.id` o con `sender.url` fuera de `chrome-extension://<id>/src/panel/`; que un mensaje antes de `hello` cierra el puerto; que un mensaje con `v ≠ 1`, `type` desconocido o `payload` inválido se descarta, se registra con `console.warn` sin URL ni headers y no recibe respuesta; que cada comando válido recibe exactamente un `ack` o `error` con `correlationId = id`; que un segundo `hello` para la misma pestaña desconecta el puerto anterior **sin** emitir `onPanelClosed` (solo lo emite la desconexión del puerto dueño actual)
- [ ] T030 Implementar `apps/extension/src/background/panel-port.ts` (solo `chrome.runtime.onConnect`, nunca `onConnectExternal`; enruta comandos a un handler inyectado; emite `onPanelClosed(tabId)` en `onDisconnect`) hasta que pase T029
- [ ] T031 Crear `apps/extension/src/devtools/devtools.html` y `apps/extension/src/devtools/devtools.ts` que crean el panel con `chrome.devtools.panels.create(t("panelTitle"), "", "src/panel/panel.html")`
- [ ] T032 Crear el shell del panel: `apps/extension/src/panel/panel.html`, `apps/extension/src/panel/main.tsx` y `apps/extension/src/panel/App.tsx` vacío con el título traducido; el `tabId` se toma de `chrome.devtools.inspectedWindow.tabId` o, solo si `import.meta.env.MODE === "test"`, del parámetro `?__nahualTestTabId=` (para la E2E, ver research D7); la rama de test debe eliminarse por completo en el build de producción (lo verifica T024)

**Checkpoint**: protocolo con cobertura ≥ 85%, puerto seguro probado, manifest verificado, `pnpm build` genera una extensión que se carga en Chrome y muestra el panel Nahual vacío.

---

## Phase 3: User Story 1 - Validar el ciclo adjuntar → pausar → continuar → soltar (Priority: P1) 🎯 MVP

**Goal**: adjuntar y soltar el debugger desde el panel, pausar en Request y Response con
patrones, continuar sin cambios o con headers, detectar desconexiones, sobrevivir a reinicios
del SW, y documentar los experimentos en `research.md`.

**Independent Test**: escenarios 1–12 de `specs/001-spike-cdp/quickstart.md` sobre la app de
pruebas, más la E2E y la prueba de robustez en verde.

### Bloque A — Sesión del debugger (pruebas primero)

- [ ] T033 [P] [US1] Escribir `apps/extension/tests/integration/session-registry.test.ts`: `add(tabId)`, `remove(tabId)`, `list()` y `clear()` sobre un `chrome.storage.session` simulado con la clave `nahual.sessions: number[]`, sin duplicados
- [ ] T034 [P] [US1] Escribir `apps/extension/tests/integration/debugger-manager.test.ts` con `fake-debugger.ts`, cubriendo las transiciones de `data-model.md`: `detached ──attach──▶ attaching ──ok──▶ attached` (con `attachedAt`); error `already_attached` ⇒ `conflict`; error de página restringida ⇒ `detached` con `cause: "restricted_page"`; `detach` del usuario ⇒ `detached` con `cause: "user"`; panel cerrado ⇒ `detached` con `cause: "panel_closed"`; `onDetach` `canceled_by_user` / `target_closed` ⇒ `detached` con esa causa y evento `state` emitido; tras un detach externo **no** hay reintento automático; `reconnect` desde `detached`/`conflict` ⇒ `attaching`; el registro se actualiza al entrar y salir de `attached`; dos pestañas son independientes
- [ ] T035 [P] [US1] Escribir `apps/extension/tests/integration/startup-cleanup.test.ts`: `cleanupOrphans()` hace detach de todo target con `attached && extensionId === chrome.runtime.id` y de cada pestaña del registro, ignora targets de otras extensiones, tolera errores de detach (pestaña ya cerrada) sin lanzar, y vacía el registro; los puertos no se aceptan hasta que termina
- [ ] T036 [P] [US1] Implementar `apps/extension/src/background/session-registry.ts` hasta que pase T033
- [ ] T037 [US1] Implementar `apps/extension/src/background/debugger-manager.ts` (mapa `tabId → DebuggerSession`, `attach`, `detach(cause)`, `reconnect`, `onStateChange`) hasta que pase T034
- [ ] T038 [US1] Implementar `cleanupOrphans()` y el arranque en `apps/extension/src/background/index.ts` (orden: limpieza ⇒ crear `DebuggerManager` ⇒ registrar `panel-port`; `onPanelClosed` ⇒ `detach("panel_closed")`, que `panel-port.ts` solo emite para el puerto dueño actual de la pestaña) hasta que pase T035

### Bloque B — Intercepción mínima (pruebas primero)

- [ ] T039 [US1] Escribir `apps/extension/tests/integration/fetch-interceptor.test.ts` con `fake-debugger.ts` y temporizadores falsos de Vitest:
  - sin patrones no se llama a `Fetch.enable`, y `patterns` vacío tras haberlos ⇒ `Fetch.disable` (FR-007);
  - `setPatterns` traduce `stage` a `requestStage` `"Request"`/`"Response"`, ignora duplicados exactos (`urlPattern` + `stage`) y rechaza más de 10;
  - `Fetch.requestPaused` ⇒ evento `paused` con `expiresAt = pausedAt + pauseTimeoutMs`;
  - `continue` sin cambios ⇒ `Fetch.continueRequest { requestId }` en Request y `Fetch.continueResponse { requestId }` en Response, con resultado `continued`;
  - `continue` con `HeaderEdit[]` ⇒ headers fusionados sin distinguir mayúsculas (`value: null` elimina), enviados como `headers` en Request o `responseHeaders` en Response, con resultado `modified`;
  - en Response con status 3xx no se llama a `Fetch.getResponseBody` y `bodyAvailable: false`; en Response no 3xx, si `Content-Length` es > 5 MB (5 242 880 bytes) no se llama y `bodySize` se toma del header; si no, se llama una vez y se rellena `bodySize` (bytes decodificados); si falla, se continúa con `bodyAvailable: false` sin bloquear la pausa;
  - si `continueRequest`/`continueResponse` o el timeout reciben el error CDP de interceptación inválida (request cancelado por navegación o cierre), la pausa se resuelve como `abandoned`, no como `failed`, y no se reintenta;
  - timeout por defecto de 30 000 ms ⇒ continuar sin cambios y `timed_out`; `setPauseTimeout` acepta 5–120 s, rechaza fuera de rango con `timeout_out_of_range` conservando el valor anterior, y aplica solo a pausas nuevas;
  - si `continueRequest` con headers falla, reintenta una vez sin cambios y resuelve `failed` con `errorKey`;
  - un segundo `continue` o un timeout tras resolver no llama a CDP (`unknown_paused_id`);
  - un detach resuelve todas las pausas de la pestaña como `abandoned` y vacía los patrones
- [ ] T040 [US1] Implementar `apps/extension/src/background/fetch-interceptor.ts` hasta que pase T039
- [ ] T041 [US1] Conectar en `apps/extension/src/background/index.ts` los comandos `setPatterns`, `setPauseTimeout` y `continue` del puerto con `FetchInterceptor`, y los eventos `paused`/`resolved`/`state` hacia el puerto de la pestaña; verificar con `pnpm --filter extension test`

### Bloque C — Panel mínimo

- [ ] T042 [P] [US1] Crear `apps/extension/src/panel/use-sw-connection.ts`: abre el puerto `nahual-panel`, envía `hello { tabId }`, valida cada mensaje con `parseSwMessage`, mantiene `state` y la lista de pausados, y expone `send(command)`; si el puerto se cae (reinicio del SW), lo reabre y repite `hello`
- [ ] T043 [P] [US1] Crear `apps/extension/src/panel/components/StatusBar.tsx`: estado traducido con texto e icono (sin depender solo del color) en una región `role="status"` con `aria-live="polite"`, causa con su solución, y botones Adjuntar / Soltar / Reconectar según el estado, con foco visible
- [ ] T044 [P] [US1] Crear `apps/extension/src/panel/components/PatternForm.tsx`: alta y baja de patrones (`urlPattern` + selector de etapa, máx. 10) y campo de timeout en segundos (5–120, 30 por defecto) que muestra el error de rango del SW
- [ ] T045 [P] [US1] Crear `apps/extension/src/panel/components/PausedList.tsx`: lista navegable con flechas (`role="listbox"`, una pausa seleccionada), por pausa muestra método, URL, etapa, status, tamaño del body (`bodySize`) o aviso de "body no disponible" como texto plano, con cuenta regresiva hasta `expiresAt` y botón Continuar; muestra el resultado de `resolved` (incluido `timed_out` y `failed` con su mensaje)
- [ ] T046 [P] [US1] Crear `apps/extension/src/panel/components/HeaderEditor.tsx`: lista editable de headers de la pausa (añadir, modificar, eliminar) que produce `HeaderEdit[]` y envía `continue` con ellos
- [ ] T047 [P] [US1] Crear `apps/extension/src/panel/theme.css` con variables de color para tema claro y oscuro (contraste AA) seleccionadas por `data-theme` según `chrome.devtools.panels.themeName` (`"dark"` ⇒ oscuro; otro ⇒ claro), estilos de foco visible y layout de una columna sin scroll horizontal a 320 px
- [ ] T048 [P] [US1] Crear `apps/extension/src/panel/use-shortcuts.ts`: atajos `Alt+Shift+A` (Adjuntar/Soltar según estado) y `Alt+Shift+C` (Continuar la pausa seleccionada sin cambios), ignorados mientras el foco está en un campo de texto; los atajos se muestran junto a cada botón vía `t()`
- [ ] T049 [US1] Componer `apps/extension/src/panel/App.tsx` con los cuatro componentes, `theme.css` y `use-shortcuts.ts`, orden de tabulación lógico, y estados vacío ("sin patrones: no se pausa nada"), carga (`attaching`) y error; todo texto vía `t()`

### Bloque D — E2E y robustez (Playwright)

- [ ] T050 [US1] Escribir `apps/extension/e2e/attach-pause-continue.spec.ts`: abre la página del origen A, abre `panel.html?__nahualTestTabId=<id>` en otra pestaña, adjunta (estado "adjunto"), configura `*echo-headers*` en Request, dispara el fetch, ve la pausa, continúa sin cambios (la página recibe 200), repite añadiendo `X-Nahual: 1` (la respuesta de `/echo-headers` lo contiene), configura etapa Response y añade un header de respuesta (visible en la página), pausa `/redirect` (body no disponible), pausa un request y navega la página de origen A (la pausa termina como `abandoned` a más tardar al vencer el timeout y la nueva página carga), y suelta (estado "desconectado", `getTargets()` sin sesión propia)
- [ ] T051 [US1] Escribir `apps/extension/e2e/detach-detection.spec.ts` (carga también `conflict-extension`; la prueba obtiene el service worker de la auxiliar con `context.serviceWorkers()` y la controla con `worker.evaluate((id) => conflict.attach(id), tabId)`): (1) con Nahual adjunto, cierra la pestaña objetivo ⇒ el panel muestra "desconectado" con causa `target_closed` en < 1 s; (2) con `conflict-extension` adjunta antes a la pestaña, Adjuntar ⇒ "en conflicto" con su causa; tras `detach` de la auxiliar, Reconectar ⇒ "adjunto" al primer intento; (3) con Nahual adjunto, la auxiliar intenta adjuntarse y se registra en el resultado de la prueba si Nahual sigue adjunto o recibe `onDetach` (dato para E3). La cancelación desde la barra de aviso queda en la validación manual (quickstart 8)
- [ ] T052 [US1] Escribir `apps/extension/e2e/sw-restart.spec.ts` (prueba de robustez): con un request pausado en Request, termina el service worker (variante 1: `chrome.runtime.reload()`, que cierra la pestaña del panel; variante 2: cerrar el target del worker vía CDP del navegador, con el panel abierto); en ambas verifica que la página recibe su respuesta sin cambios en < 5 s, que tras el arranque `chrome.debugger.getTargets()` no tiene sesiones con `extensionId` propio y que `nahual.sessions` está vacío; en la variante 1 reabre `panel.html` y comprueba "desconectado"; en la variante 2 comprueba que el panel abierto reconecta su puerto solo y muestra "desconectado"
- [ ] T053 [US1] Escribir `apps/extension/e2e/a11y.spec.ts`: con el panel en estados vacío, adjunto con pausas y error, en tema claro y oscuro, ejecuta axe con etiquetas WCAG 2.2 AA y falla ante violaciones `serious` o `critical`; a 320 px de ancho no hay scroll horizontal; recorre el ciclo adjuntar → pausar → continuar → soltar solo con teclado (Tab, flechas, Enter y los atajos de T048)
- [ ] T054 [US1] Ejecutar `pnpm e2e` hasta que T050–T053 pasen de forma estable (10 corridas seguidas sin fallos) y corregir lo necesario en `apps/extension/src/`

### Bloque E — Experimentos (entregable: `specs/001-spike-cdp/research.md`)

- [ ] T055 [US1] Registrar en la sección **Entorno** de `specs/001-spike-cdp/research.md` la app de pruebas del equipo (nombre, versión, orígenes de SPA y API), la versión de Chrome y el SO
- [ ] T056 [P] [US1] Crear `apps/extension/e2e/experiments/e1-preflight.spec.ts` según el método de E1 (patrón `*` en ambas etapas, request con preflight, registrar si llega `requestPaused` con `OPTIONS` y su `resourceType`, comparar con `Network.enable`) y anotar resultado y conclusión de **E1** en `specs/001-spike-cdp/research.md`
- [ ] T057 [US1] Crear `apps/extension/e2e/experiments/e2-cors-headers.spec.ts` con los casos A–D de E2 contra una API sin CORS en el fixture de servidores; anotar la tabla caso × resultado × mensaje de consola en **E2** y actualizar la decisión **D5** de `specs/001-spike-cdp/research.md` (depende de T056)
- [ ] T058 [US1] Ejecutar a mano los casos (a)–(e) de E3 con el panel en DevTools sobre la app de pruebas; anotar `onDetach.reason`, errores de attach y efecto en las pausas en **E3** de `specs/001-spike-cdp/research.md`, con el mapa causa ⇒ estado del panel; si difiere de lo implementado, abrir tarea de corrección en `apps/extension/src/background/debugger-manager.ts`
- [ ] T059 [P] [US1] Crear `apps/extension/e2e/experiments/e4-overhead.spec.ts` y `apps/extension/e2e/fixtures/load-page.html`: 500 `fetch` secuenciales más 10 de calentamiento descartados, tres corridas (sin debugger; con debugger sin Fetch; con Fetch que continúa al instante), Resource Timing `responseEnd - startTime` en la página y tiempo `requestPaused` ⇒ `continueRequest` en el SW; imprime p50 y p95 de cada corrida y del overhead (corrida 3 − corrida 1)
- [ ] T060 [US1] Ejecutar E4 sobre la app de pruebas del equipo (no solo el fixture) y anotar la tabla corrida × p50 × p95 en **E4** de `specs/001-spike-cdp/research.md`; si el p95 del overhead ≥ 20 ms, documentar la desviación y el plan de mitigación (SC-004)
- [ ] T061 [US1] Verificar el riesgo de D1 (modo dev de `@crxjs/vite-plugin` con CSP `script-src 'self'`) y anotar el resultado y el flujo de desarrollo elegido en **D1** de `specs/001-spike-cdp/research.md`
- [ ] T062 [P] [US1] Evaluar las candidatas de D2–D4 (Sucrase, esbuild-wasm, json-p3, jsonpath-plus, microdiff, jsondiffpatch) en un directorio temporal **fuera del workspace y sin commitear** (no son dependencias de 001): licencia según su `package.json` publicado, tamaño minificado + gzip, búsqueda de `eval(`/`new Function(` en el código publicado y carga en una página con CSP `script-src 'self'`; anotar una tabla por decisión en **D2**, **D3** y **D4** de `specs/001-spike-cdp/research.md`, reemplazar cada licencia "a confirmar" o `_pendiente_` y marcar cada decisión como firme o cambiarla

**Checkpoint**: US1 completa: pruebas unitarias, de integración y E2E en verde; E1–E4 y D1
documentados.

---

## Phase 4: Polish & Cross-Cutting Concerns

- [ ] T063 [P] Escribir `apps/extension/tests/dist/no-network.test.ts` (corre con `pnpm verify:dist`): analiza los bundles de `apps/extension/dist` y falla si contienen `fetch(`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `sendBeacon`, `eval(` o `new Function(` fuera de código de terceros permitido (lista explícita en el test), como garantía de "sin red propia" y "sin código evaluado" (FR-015)
- [ ] T064 [P] Añadir `README.md` en la raíz (qué es Nahual, estado "spike", requisitos, `pnpm install`, `pnpm build`, cargar la extensión, licencia Apache-2.0) con enlace a `specs/001-spike-cdp/quickstart.md`
- [ ] T065 Revisar el diff de la feature contra la tabla de amenazas de `specs/001-spike-cdp/plan.md` y la definición de terminado de `.specify/memory/constitution.md` (excepciones de UI acotadas por la spec); anotar cualquier hallazgo en `specs/001-spike-cdp/plan.md`
- [ ] T066 Ejecutar E5 (1 hora de uso continuo sobre la app de pruebas con ciclos de adjuntar, pausar, continuar, modificar header, soltar, cerrar DevTools y recargar la extensión) y anotar en **E5** de `specs/001-spike-cdp/research.md` el número de sesiones huérfanas (`chrome.debugger.getTargets()`) y requests sin resolver al final; criterio: 0 y 0 (SC-001)
- [ ] T067 **Checkpoint final**: demo de punta a punta siguiendo los escenarios 1–12 de `specs/001-spike-cdp/quickstart.md` (incluido SC-006: un dev ajeno completa el ciclo en < 3 min); confirmar que `specs/001-spike-cdp/research.md` no tiene ningún `_pendiente_` ni licencia "a confirmar", que D1 y D5 están confirmadas o actualizadas con los datos de los experimentos, y que D2–D4 son firmes con la evaluación de T062 (su validación final con uso real queda en 005, 002 y 004); CI en verde con build reproducible

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sin dependencias. T011 depende de T001, T005–T007. T014 depende de T011, T012 y T013.
- **Foundational (Phase 2)**: depende de Setup. Bloquea US1.
  - Protocolo: T015–T017 ⇒ T018–T020 ⇒ T021.
  - Manifest: T022 y T025 dependen de T007; T024 ⇒ T025.
  - Puerto: T021 y T026 ⇒ T029 ⇒ T030.
  - Panel shell: T031–T032 dependen de T023 y T025; T024 se completa cuando existen T025 y T032.
- **US1 (Phase 3)**: depende de Foundational.
  - Bloque A: T033–T035 ⇒ T036–T038.
  - Bloque B: T039 ⇒ T040 ⇒ T041 (T041 depende de T038).
  - Bloque C: T042–T048 dependen de T021 y pueden ir en paralelo con los bloques A y B; T049 depende de T042–T048.
  - Bloque D: depende de A, B y C completos; T051 depende además de T010.
  - Bloque E: T056, T057 y T059 dependen de T041; T058 y T060 dependen de T049; T061 depende de T007; T062 no depende de ninguna tarea de código.
- **Polish (Phase 4)**: depende de US1. T066 y T067 al final.

### Within US1

- Cada prueba (T033–T035, T039, T050–T053) se escribe y se ve fallar antes de su implementación.
- Adaptador ⇒ manager ⇒ interceptor ⇒ wiring ⇒ panel ⇒ E2E ⇒ experimentos.

### Parallel Opportunities

- Setup: T003, T004, T005, T006, T008, T009, T010, T012, T013.
- Foundational: T015–T017; luego T019 y T020; T022, T023, T027, T028.
- US1: T033–T035 juntos; T042–T048 juntos (en paralelo con los bloques A y B); T056, T059 y T062.
- Polish: T063, T064.

---

## Parallel Example: User Story 1

```bash
# Pruebas del bloque A, juntas:
Task: "Escribir session-registry.test.ts en apps/extension/tests/integration/"
Task: "Escribir debugger-manager.test.ts en apps/extension/tests/integration/"
Task: "Escribir startup-cleanup.test.ts en apps/extension/tests/integration/"

# Componentes del panel, en paralelo con los bloques A y B:
Task: "use-sw-connection.ts en apps/extension/src/panel/"
Task: "StatusBar.tsx en apps/extension/src/panel/components/"
Task: "PatternForm.tsx en apps/extension/src/panel/components/"
Task: "PausedList.tsx en apps/extension/src/panel/components/"
Task: "HeaderEditor.tsx en apps/extension/src/panel/components/"
```

---

## Implementation Strategy

### MVP (US1 es toda la feature)

1. Phase 1: Setup ⇒ CI en verde con el smoke test.
2. Phase 2: Foundational ⇒ la extensión se carga y muestra el panel vacío.
3. Phase 3, bloques A–C ⇒ ciclo manual funcionando (quickstart 1–11).
4. Bloque D ⇒ E2E y robustez estables.
5. Bloque E ⇒ experimentos documentados.
6. Phase 4 ⇒ prueba de 1 hora, demo y `research.md` completo.

### Incremental Delivery

- Commit por tarea o grupo lógico (Conventional Commits), en la rama de implementación de 001.
- Detenerse en cada checkpoint para validar antes de seguir.
- Si un experimento contradice el diseño (p. ej. E3 muestra otra causa de detach), corregir el
  código y su prueba antes de continuar con los experimentos siguientes.

---

## Notes

- [P] = archivos distintos, sin dependencias pendientes.
- No añadir permisos ni dependencias fuera de `plan.md` sin actualizar sus tablas.
- Nunca mostrar URLs, headers o bodies en logs de consola; solo en el panel y como texto.
