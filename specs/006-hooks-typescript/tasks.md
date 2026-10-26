---
description: "Lista de tareas de 006-hooks-typescript"
---

# Tasks: Hooks en TypeScript

**Input**: Design documents from `/specs/006-hooks-typescript/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ (hook-api,
panel-protocol, sandbox-messaging, hook-file, panel-ui, manifest, storage), quickstart.md

**Tests**: obligatorias. La constitución (principio IV, NO NEGOCIABLE) exige TDD en la lógica
pura y pruebas que intenten violar las garantías. La entrada pide además que **la suite de
escape del sandbox exista antes del runtime** (T022 antes de T023–T027). Cada prueba de dominio,
de `hook-runtime` y de integración se escribe, se ejecuta y **falla** antes de su implementación.

**Interfaz**: cada vista nueva sigue a su equivalente de DevTools (contracts/panel-ui.md,
research R13; indicación del usuario en `/speckit-plan`). Ninguna tarea de UI está terminada si
usa botones con borde sueltos, filas de botones de texto o estilos fuera de los tokens `--nh-*`
en lugar de `Toolbar`, `IconButton`, `Tabs`, `Drawer` y el patrón `.detail` de 004.

**Organization**: una fase por historia, en el orden de la spec: US1 escribir un hook (P1), US2
fallar de forma segura (P1) y US3 compartir hooks (P2). El runtime de ejecución (sandbox,
`HookHost`, `hook-runner`) es común a las tres y va en Foundational.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: se puede hacer en paralelo (archivos distintos, sin dependencias pendientes)
- **[USn]**: tarea de la historia de usuario n
- "Prueba primero" = escribir la prueba, verla fallar y solo entonces implementar
- Rutas abreviadas: `hr/` = `packages/hook-runtime/src/`; `hrtests/` =
  `packages/hook-runtime/tests/`; `domain/` = `packages/domain/src/`; `dtests/` =
  `packages/domain/tests/`; `bg/` = `apps/extension/src/background/`; `sb/` =
  `apps/extension/src/sandbox/`; `panel/` = `apps/extension/src/panel/`; `e2e/` =
  `apps/extension/e2e/`; `tests/` = `apps/extension/tests/`; locales =
  `apps/extension/public/_locales/{es,en}/messages.json`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: paquete nuevo, dependencias, manifest con sandbox, servidor de prueba y
experimentos X1–X3.

- [X] T001 Crear `packages/hook-runtime/` como `packages/domain`: `package.json` (`@nahual/hook-runtime`, privado, `type: module`, `exports: { ".": "./src/index.ts", "./hook-context.d.ts": "./src/hook-context.d.ts" }`, dependencias `@nahual/domain: workspace:*` y `zod` 4.6.5, scripts `typecheck` y `test` con cobertura), `tsconfig.json`, `vitest.config.ts` con umbral 85 % en líneas, funciones, ramas y sentencias, `src/index.ts` vacío y `tests/`; añadir `@nahual/hook-runtime: workspace:*` a `apps/extension/package.json`; `pnpm install` y comprobar que `pnpm typecheck && pnpm test` siguen en verde
- [X] T002 [P] Añadir a `apps/extension/package.json` con versión exacta (plan.md "Dependencias"): `sucrase` 3.35.1, `typescript` 5.9.3 (pasa a `dependencies`), `@codemirror/state` 6.7.6, `@codemirror/view` 6.43.15, `@codemirror/commands` 6.11.1, `@codemirror/language` 6.13.1, `@codemirror/autocomplete` 6.20.4, `@codemirror/lint` 6.9.7, `@codemirror/lang-javascript` 6.2.5; `pnpm install`; `node scripts/check-licenses.mjs --prod` en verde; `pnpm audit` sin vulnerabilidades altas
- [X] T003 Manifest (contracts/manifest.md): versión `0.6.0` en `apps/extension/package.json`; en `apps/extension/manifest.config.ts` añadir `sandbox: { pages: ["src/sandbox/hook-sandbox.html"] }` y `content_security_policy.sandbox` exactamente `"sandbox allow-scripts; default-src 'none'; script-src 'self' 'unsafe-eval' blob:; worker-src blob:; connect-src 'none'; img-src 'none'; style-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'"`, sin tocar `extension_pages` ni permisos; crear `sb/hook-sandbox.html` (sin UI, carga `sb/sandbox.ts`) y `sb/sandbox.ts` vacío; si crxjs no empaqueta la página, añadirla a `rollupOptions.input` en `apps/extension/vite.config.ts`; actualizar `tests/dist/manifest.test.ts`: `permissions` exactamente `["debugger", "storage"]`, la CSP de `sandbox` literal, `extension_pages` sin `unsafe-eval` y la página sandbox fuera de `web_accessible_resources`
- [X] T004 [P] Servidor de prueba `e2e/fixtures/servers.ts`: `/hooks/items` (JSON `{ "status": "ok", "items": [1, 2, 3] }`), `/hooks/slow?ms=` y `/leak` en la API y en el tercer origen, que registra cada request recibido (método, URL, headers) y lo expone en `GET /leak/log` sin registrarse a sí mismo; reutilizar `/echo`
- [X] T005 [P] Experimento X1 en `e2e/experiments/x1-sandbox.spec.ts` (research R2): página de prueba del build de pruebas que embebe `hook-sandbox.html`; comprobar (a) que la página existe en `dist-test` y aplica la CSP de T003; (b) canal `MessageChannel` con `hello` y `event.origin === "null"`; (c) Worker desde `Blob` con `new Function`; (d) desde el Worker fallan `fetch`, XHR, WebSocket, `EventSource`, `importScripts`, Worker anidado y `chrome` (y `/leak/log` queda vacío); (e) `terminate()` corta un `while (true)`; (f) un `Error` del código evaluado conserva la línea en la pila
- [X] T006 [P] Experimento X2 en `e2e/experiments/x2-hook-latency.spec.ts` (research R16): ida y vuelta SW ⇒ panel ⇒ sandbox ⇒ Worker con un hook trivial (500 iteraciones, p50/p95) y con un body JSON de 1 MB; tiempo de Sucrase para un hook de 50 líneas (pendiente de D2 de 001)
- [X] T007 [P] Experimento X3 en `e2e/experiments/x3-editor.spec.ts` y medición del build (research R4): página de prueba con CodeMirror + servicio de lenguaje de TypeScript en Worker, y otra con `monaco-editor` ESM (solo en el directorio temporal del experimento, sin añadirlo al lockfile); medir tamaño gzip de cada uno, que funcionen con `script-src 'self'` sin `unsafe-eval` y la latencia de diagnósticos y completado en un hook de 200 líneas
- [X] T008 Ejecutar X1–X3 (`EXPERIMENTS=1 pnpm --filter @nahual/extension e2e e2e/experiments/x*`) y registrar resultados y respaldos en una sección "Resultados" de `specs/006-hooks-typescript/research.md`; si alguno obliga a un respaldo (R2 iframe sin Worker, R4 Monaco, R16 precalentado), actualizar ese apartado, `plan.md` y las tareas afectadas antes de seguir

**Checkpoint**: `pnpm lint && pnpm typecheck && pnpm test && pnpm verify:dist` en verde; X1–X3
registrados.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: dominio, lógica pura de `hook-runtime`, protocolo v5, la suite de escape y el
runtime completo de ejecución (sandbox, `HookHost`, `hook-runner`), sin interfaz de edición. Las
pruebas instalan hooks directamente en el almacén.

**⚠️ CRITICAL**: ninguna historia empieza antes de terminar esta fase.

### Dominio (prueba primero)

- [X] T009 Añadir a `LIMITS` en `domain/schemas/limits.ts`: `hookSourceBytesMax: 102_400`, `hookTotalBytesMax: 5_242_880`, `hookTimeoutMs: 2_000`, `hookStateBytesMax: 1_048_576`, `hookStateAttempts: 3` (intentos en total), `hookSuspendAfterErrors: 5`, `hookConsoleEntriesMax: 1_000`, `hookLogEntryChars: 10_240`, `hookWorkerIdleMs: 60_000` (data-model)
- [X] T010 Prueba primero en `dtests/schemas.test.ts` y luego en `domain/schemas/action.ts`: miembro `hook` de `ActionSchema` `{ kind: "hook", source: string ≤ hookSourceBytesMax bytes UTF-8 (error "hook_error_too_large"), imported: boolean, permissions: { changeDestination: boolean, readSensitive: boolean }, check: { hash: string hex, ok: boolean } }`, válido en etapa Request y Response; las reglas existentes sin hook siguen validando igual
- [X] T011 [P] Prueba primero y luego en `domain/schemas/exchange.ts`: `RULE_RESULTS` suma `hooked`, `hook_unchanged`, `hook_failed`, `hook_responded`, `hook_skipped_suspended`; `RuleEffectSchema` suma `durationMs?: number ≥ 0` y `destination?: { from: string, to: string }`
- [X] T012 Prueba primero en `dtests/select-chain.test.ts` y luego `selectChain(rules, view, context)` en `domain/evaluate.ts` (research R8, FR-012): primera regla que cumple de otra acción ⇒ `{ kind: "match", rule }` como `selectRule`; primera que cumple con hook ⇒ `{ kind: "chain", rules }` con todas las reglas con hook que cumplen en orden de prioridad, saltando las de otras acciones; `needsBody` si alguna lo necesita; `globalPaused` o sitio nulo ⇒ `none`; casos: hook arriba y Mock abajo, Mock arriba y hook abajo, tres hooks con uno que no cumple, regla desactivada

### `hook-runtime` (prueba primero, cada módulo con su test en `hrtests/`)

- [X] T013 [P] `hr/hash.ts`: `hashSource(text)` FNV-1a de 64 bits en hex, estable entre Node y navegador; pruebas con vectores conocidos y textos con caracteres no ASCII
- [X] T014 [P] `hr/schemas.ts` (data-model): `HookBodySchema` (`text{text, json?}` | `binary|tooLarge|none{contentType: string|null, size: number|null}`), `HookContextDataSchema`, `HookOutcomeSchema` (`ok{context, respond?, state?, logs ≤ 1,000 de ≤ 10,240 caracteres, durationMs}` | `error{type: exception|invalid_result|timeout|state_conflict|state_too_large|access_denied, message, line?, field?, logs, durationMs}`), `HookEffect` y los mensajes de contracts/sandbox-messaging.md (`hello`, `run`, `dispose`, `result`, `ready`); pruebas de límites y formas inválidas
- [X] T015 [P] `hr/hook-context.d.ts` exactamente como contracts/hook-api.md (`HookContext`, `HookRequest`, `HookResponse`, `BodyInfo`, `respond`, utilidades, globales permitidos) y `hrtests/types.test.ts` que compila con `tsc --noEmit` tres hooks válidos y comprueba que `fetch`, `document`, `window` y `ctx.response.status = "x"` son errores de tipo (lib `es2022`, sin `dom`)
- [X] T016 `hr/context.ts`: `buildHookContext(view, stage, site)` (FR-003, FR-005, FR-006): request con método, URL, headers como objeto en minúsculas (repetidos unidos con `", "`, `set-cookie` con `"\n"`), body texto con `json` si es JSON válido o `BodyInfo` si no; `graphql.operationName` con la detección de 002; `response` en etapa Response con el request de solo lectura; `toHeaderList(record, original)` inversa que conserva orden y mayúsculas de los que no cambian; prueba de ida y vuelta
- [X] T017 [P] `hr/mask.ts`: `maskSensitive(ctx, readSensitive)` reemplaza por `MASK` el valor de cada header con `isSensitiveHeader` (request y response) si `readSensitive` es `false`; `mergeMasked(original, returned)`: `MASK` sin cambiar ⇒ original, valor nuevo ⇒ nuevo, ausente ⇒ quitado (FR-004, R5); pruebas con `Authorization`, `Cookie`, `Set-Cookie` múltiple y `x-api-key`
- [X] T018 `hr/validate.ts`: `validateHookResult(before, after, stage, permissions)` ⇒ `HookEffect` (R6, FR-010, FR-011): forma por etapa, campos de solo lectura sin cambios (`invalid_result` con `field`), `validatePausedEdit` de 002 para Request/Response, `validateQueueMock` para `respond` (solo etapa Request; en Response ⇒ `invalid_result`), cambio de origen sin `changeDestination` ⇒ `destination_not_allowed`, ruta o query sin permiso ⇒ válido, body de texto nuevo sobre uno binario ⇒ reemplazo; `parts` cambiadas
- [X] T019 `hr/chain.ts`: `foldChain(original, steps)` (R8, FR-010, FR-012): cada paso recibe el contexto acumulado; `edit` acumula; `error` no aporta y sigue; `respond` termina; suspendidos se saltan con `hook_skipped_suspended`; resultado final `unchanged`/`edit`/`respond` como la diferencia con el original y un resumen por regla; prueba con tres hooks donde el del medio falla (SC-009)
- [X] T020 [P] `hr/state.ts`: `createHookState()` con `snapshot()` ⇒ `{ value, version }`, `commit(version, value)` ⇒ `saved | conflict | too_large` (≤ `hookStateBytesMax` del JSON en UTF-8), `clear()` que devuelve la copia anterior y `restore(copia)` para "Deshacer" (FR-008); prueba de 20 ejecuciones simultáneas que incrementan un contador con hasta 3 intentos en total por ejecución hasta 20 (SC-012) y de que un error no guarda (FR-023)
- [X] T021 Protocolo v5 en `packages/protocol/src/` (contracts/panel-protocol.md): `PROTOCOL_VERSION = 5`; evento `hookRun { runId, exchangeId, stage, chain: 1..500 × { ruleId, ruleName, source, permissions }, context }` en `sw-to-panel.ts`; comandos `hookResult { runId, final, executions }` e `importHook { config | null, source }` (siempre regla nueva) en `panel-to-sw.ts`; pruebas en `packages/protocol/tests/` (un `v: 4` se descarta; `final.kind` desconocido rechazado; `chain` vacía rechazada)

### Suite de escape primero (la entrada lo exige antes del runtime)

- [X] T022 Escribir `e2e/hooks-escape.spec.ts` **antes** de T023–T027 (research R17, FR-031, FR-032, SC-001) y verla fallar: helper `installHook(panel, { stage, prefilter, source, permissions? })` en `e2e/fixtures/panel.ts` que guarda la regla por el gancho de pruebas de `panel/test-slots.tsx` con `check: { hash: hashSource(source), ok: true }`; un caso por vector: `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `importScripts`, `navigator.sendBeacon`, `chrome.runtime`, `parent.postMessage`, `top`, `opener`, `document.cookie`, `localStorage`, `indexedDB`, `new Worker`, `location.href = …`, `import("…")` dinámico, todos hacia `/leak` de la API y del tercer origen; cada caso: el request de la app llega sin cambios, `GET /leak/log` vacío y la ejecución termina en error de tipo `access_denied` o `exception`

### Runtime de ejecución

- [X] T023 `sb/sandbox.ts` (contracts/sandbox-messaging.md, R2, R3): `hello` a `PANEL_ORIGIN` sacado de `location.href` con un `MessagePort`; validar con Zod cada mensaje del puerto; caché de transpilación por `codeHash` con Sucrase (`transforms: ["typescript", "imports"]`, solo `transform` importado); un Worker por `ruleId + codeHash` creado desde `Blob` con el runtime de T024, cerrado tras `hookWorkerIdleMs` o con `dispose`; corte a `timeoutMs` contado desde que envía `exec` (sin su propio arranque ni la carga de Sucrase), con `terminate()` y `timeout` para cada ejecución en curso de ese Worker; mensaje `ready { sucraseMs }` al terminar de arrancar
- [X] T024 `sb/worker-runtime.ts`: función fija serializada a `Blob`; `load { codeHash, js }` evalúa una vez con `new Function("exports", "require", js + "\n//# sourceURL=hook.js")` (`require` lanza "los hooks no pueden importar"); comprobaciones de forma propias (sin Zod) para `load` y `exec` y descarte de cualquier otro mensaje, con prueba de un mensaje mal formado; `exec` arma `HookContext` con utilidades (`json()` copia, `setHeader`, `removeHeader`, `respond`, `log` convertido a texto con límite convertido a texto JSON (la redacción la hace el panel en T045, research R11), `console.*` ⇒ `log`, `state` copia), mide `stateChanged`, devuelve `HookOutcome`; línea del error = línea de `hook.js:L` en la pila menos las líneas de `new Function` (X1(f)); `TypeError`/`ReferenceError`/`SecurityError` sobre globales bloqueados ⇒ `access_denied`
- [X] T025 Prueba primero en `tests/unit/sandbox-client.test.ts` y luego `panel/hooks/sandbox-client.ts`: precalienta el iframe al abrir el panel si hay reglas con hook activas (o al activar la primera) y no envía `run` antes de `ready` (R2); acepta solo el primer `hello` con `event.source === iframe.contentWindow` y `event.origin === "null"` y deja de escuchar `window`; `run(execId, …)` ⇒ promesa con `HookOutcome` validado; `execId` desconocido o mensaje inválido ⇒ descartado y registrado; iframe que dispara `load` otra vez ⇒ destruido, ejecuciones en curso `access_denied` y recreado; se destruye al cerrar el panel
- [X] T026 Prueba primero en `tests/integration/hook-host.test.ts` (sandbox simulado) y luego `panel/hooks/hook-host.ts` (R1, R5–R7): recibe `hookRun`, por cada hook enmascara (`maskSensitive`), ejecuta con `state` (`snapshot`/`commit`, hasta 3 intentos en total dentro de 2 s ⇒ `state_conflict`), valida (`validateHookResult`), combina (`mergeMasked`, `foldChain`) y envía `hookResult`; ejecuciones en paralelo entre intercambios; guarda cada `HookExecution` (data-model) en `panel/store/hooks.ts`; pruebas: cadena de tres, `respond` corta la cadena, valores sensibles nunca llegan al sandbox sin `readSensitive` (SC-011), destino sin permiso, `state` concurrente (SC-012)
- [X] T027 Prueba primero en `tests/integration/hook-runner.test.ts` (CDP simulado) y luego `bg/hook-runner.ts` (contracts/panel-protocol.md): `run(tabId, chain, event, view)` carga bodies como `pause()` de `rule-engine`, envía `hookRun` y espera `hookResult` hasta `2 s × chain.length + 3 s` (cubre un arranque en frío del sandbox); vencido o puerto cerrado ⇒ `continueUnchanged` y `hook_failed` por regla; valida `final` otra vez (`validatePausedEdit`/`validateQueueMock` y origen con `changeDestination` de la regla que dio `hooked`); aplica `edit` ⇒ `continueEdited`, `respond` ⇒ `respond` con `mockHeadersFor`, `unchanged` ⇒ `continueUnchanged`; un `RuleEffect` por ejecución con `durationMs` y `destination`; `runId` desconocido descartado; un `hookResult` falsificado con el origen cambiado y ninguna regla de la cadena con `changeDestination` se rechaza y el request sale sin cambios (SC-010); prueba de que con la relajación CORS activa los headers `Access-Control-*` de la relajación prevalecen sobre los que quita un hook y de que un preflight respondido localmente no genera `hookRun` (FR-013, R15)
- [X] T028 `bg/rule-engine.ts`: usar `selectChain`; `chain` ⇒ `hookRunner.run`; `match` ⇒ comportamiento de 002 sin cambios; actualizar `tests/integration/rule-engine.test.ts` (una regla de otra acción arriba sigue ganando; los hooks no se ejecutan con "pausar Nahual")
- [X] T029 Prueba primero en `tests/integration/rule-store.test.ts` y luego `bg/rule-store.ts` (FR-016, FR-034, FR-037): rechazar hook > 100 KB (`hook_error_too_large`), suma de hooks > 5 MB (`hook_error_total_size` con `[usado, límite]` en KB/MB) sin cambiar lo guardado, y `enabled: true` sin `check.ok` o con `check.hash !== hashSource(source)` (`hook_error_not_checked`); claves i18n de estos errores en locales
- [X] T030 Cablear en `bg/app.ts` (hook-runner, comando `hookResult`) y en el panel (`panel/store/dispatch.ts` deriva `hookRun` al `HookHost`; `panel/store/hooks.ts` con ejecuciones por intercambio, que se descartan cuando el intercambio sale del historial de 002); el gancho de pruebas de T022 en `panel/test-slots.tsx` (ausente en producción, comprobado en `tests/dist/no-network.test.ts`)
- [X] T031 Ejecutar `e2e/hooks-escape.spec.ts` hasta verde (SC-001); añadir a `tests/dist/` que `new Function` y `sucrase` aparecen solo en los chunks del sandbox, que los paquetes de la CLI de Sucrase (`commander`, `tinyglobby`, `mz`, `pirates`) no están en ningún chunk y que la CSP de `extension_pages` no tiene `unsafe-eval`

**Checkpoint**: un hook instalado por el gancho de pruebas cambia un request real de la app;
la suite de escape está en verde; `pnpm test && pnpm verify:dist` en verde.

---

## Phase 3: User Story 1 - Escribir un hook (Priority: P1) 🎯 MVP

**Goal**: el dev escribe un hook en TypeScript con autocompletado y errores de tipo, desde cero
o desde una plantilla, lo activa y ve su efecto en la app y en el detalle del request.

**Independent Test**: plantilla "Cambiar un campo del JSON" en `/hooks/items`, etapa Response,
activar y recargar: la página recibe la respuesta real con el campo cambiado y el resto intacto;
la pestaña Hooks del detalle muestra regla, resultado, duración y "body".

### Lógica (prueba primero)

- [X] T032 [P] [US1] `hr/templates.ts` (contracts/hook-api.md, FR-017): `addHeader` (Request), `changeJsonField` (Response), `emptyList` (Response), con comentarios en `es` y `en`; `hrtests/templates.test.ts` comprueba que cada una compila sin errores contra `hook-context.d.ts` (como T015) y se transpila con Sucrase
- [X] T033 [US1] Prueba primero en `tests/unit/hook-types.test.ts` (lógica del servicio como módulo, en Node) y luego `panel/hooks/hook-types.worker.ts` + `panel/hooks/types-client.ts` (R4): host en memoria propio (sin `@typescript/vfs`) con `lib.es2022` y `hook-context.d.ts` como texto (`?raw`); diagnósticos, completado y descripción; diagnósticos propios para `enum`, decoradores, `require`, `import` distinto de `import type` de `./nahual-hooks` y `export` distinto de `export default`; espera de 300 ms; `check = { hash: hashSource(source), ok }`; respuesta para un hook de 200 líneas < 1 s (SC-005)

### Panel

- [X] T034 [P] [US1] Tokens de DevTools en `panel/theme.css` para claro y oscuro (contracts/panel-ui.md, R13): `--nh-syntax-keyword`, `-string`, `-number`, `-comment`, `-property`, `-type`, `--nh-editor-gutter`, `--nh-editor-active-line`, `--nh-console-error-bg`, `--nh-console-error-text`, `--nh-console-warning-bg`, con los valores del tema de DevTools y contraste AA comprobado
- [X] T035 [US1] `panel/components/hooks/codemirror-setup.ts`: `lang-javascript` con TypeScript, tema con los tokens de T034 y la fuente/tamaño de Sources, números de línea, línea activa, `indentWithTab`, `lint` y `autocomplete` alimentados por `types-client`, hover con descripción, resumen de diagnósticos en una región `aria-live`
- [X] T036 [US1] `panel/components/hooks/HookEditor.tsx` registrado en `RULE_EDITOR_SLOTS` y cargado con `import()` solo al elegir la acción (FR-019): `Toolbar` con menú "Plantillas", `IconButton` de importar/exportar/descargar tipos (los handlers llegan en US3) y el uso "Hooks: X de 5 MB" en gris; editor; ayuda "Tab inserta una tabulación. Pulsa Esc y luego Tab para salir del editor. Cada hook tiene 2 s para terminar."; lista de problemas "Línea N: …"; casillas "Este hook puede cambiar el destino del request" y "Este hook puede leer valores sensibles" con explicación en gris; estado "Cargando editor…"; `Ctrl/Cmd+S` guarda (añadir `saveRule` al inventario de `panel/shortcuts.ts` y a la ayuda)
- [X] T037 [US1] `panel/components/rules/ActionEditor.tsx` y `rule-form.ts`: acción "Modificar con hook" en ambas etapas, con la función de ejemplo al elegirla; plantillas que exigen prefiltro antes de guardar como en 002; guardar con `check` del editor; interruptor de activación deshabilitado con el motivo al lado si `check.ok` es `false` (FR-016); los errores de T029 junto al editor
- [X] T038 [US1] Pestaña `hooks` en `panel/components/traffic/detail-tabs.ts` (visible si el intercambio tiene ejecuciones) y `panel/components/hooks/HooksTab.tsx` como la pestaña Timing (contracts/panel-ui.md): tabla con regla, resultado con icono y texto, duración, partes cambiadas, "Destino: original → nuevo" si lo hubo, registros debajo como filas de Console y "Cadena: N hooks, X ms"; actualizar `tests/unit/detail-tabs.test.ts`
- [X] T039 [P] [US1] Tráfico y detalle muestran los resultados nuevos de `RuleEffect` (`hooked`, `hook_unchanged`, `hook_failed`, `hook_responded`) con su texto en `panel/components/traffic/TrafficGrid.tsx` y `ExchangeDetail.tsx`, y la redirección con origen y destino (FR-014)
- [X] T040 [P] [US1] Claves i18n de US1 en locales (acción, editor, plantillas, problemas, permisos, ayuda de teclado, pestaña Hooks, resultados, errores de validación del resultado y `destination_not_allowed`)

### E2E y checkpoint

- [X] T041 [US1] `e2e/hooks-write.spec.ts` con la UI: escenarios 1–14 de US1 (editor y ejemplo; autocompletado de `ctx.`; error de tipo bloquea activar; header añadido en Request llega al eco; campo JSON cambiado en Response; sin retorno = sin cambios; asíncrono; contador en `state` que sigue tras recargar; las tres plantillas; cadena de dos hooks; destino sin y con permiso; `respond` en Request sin llegar a la API; `Authorization` enmascarado sin permiso; pestaña Hooks); el chunk del editor no se descarga hasta elegir la acción (FR-019)
- [X] T042 [US1] Ampliar `e2e/a11y.spec.ts`: axe sin violaciones serias en el editor (con errores y con sugerencias abiertas) y en la pestaña Hooks, en claro y oscuro a 320 px; recorrido solo con teclado: elegir la acción, escribir, aceptar una sugerencia, salir con Esc + Tab, marcar un permiso y guardar con `Ctrl+S`
- [X] T043 [US1] Capturas de US1 en `e2e/visual/panel.visual.spec.ts` (editor con código, con error y con sugerencias; pestaña Hooks) en claro y oscuro a 320, 800 y 1280 px; revisar cada una junto a una captura de Sources y de la pestaña Timing de DevTools en el mismo tema y anotar en research.md "Resultados" cualquier diferencia que quede

**Checkpoint (demostrable)**: pasos 1–10 de quickstart.md; `pnpm e2e` en verde.

---

## Phase 4: User Story 2 - Fallar de forma segura (Priority: P1)

**Goal**: un hook con errores nunca rompe ni retrasa la app sin explicación: el tráfico sigue
sin cambios, la consola muestra causa, línea y request, y un hook que falla siempre se suspende.

**Independent Test**: hooks que lanzan, devuelven status 999, tardan 5 s y hacen `while(true)`:
la página recibe lo original en ≤ 2,5 s, la consola muestra el error con línea y request, el
contador de la barra aumenta, y tras 5 errores seguidos el hook se suspende.

### Lógica (prueba primero)

- [X] T044 [P] [US2] `hr/suspension.ts` (FR-022, R9): cuenta de errores seguidos por regla; al llegar a `hookSuspendAfterErrors` (5) ⇒ suspendida; una ejecución correcta pone la cuenta a cero; `resume(ruleId)` y `sourceChanged(ruleId)` la quitan; pruebas
- [X] T045 [P] [US2] `hr/console.ts` (FR-026, FR-027): anillo de `hookConsoleEntriesMax` (1,000) entradas; agrupar errores consecutivos del mismo hook con el mismo mensaje con `count`; recorte a `hookLogEntryChars` (10,240); filtros por nivel, regla y texto; `unreadErrors` y `markRead`; `clear()` devuelve las entradas para `restore` ("Deshacer"); cada entrada se redacta por nombre con `redactText` de 005 (pares JSON, query, líneas de header) y guarda aparte el texto real (`revealed`, solo memoria) (FR-030); pruebas

### Panel

- [X] T046 [US2] Integrar en `panel/hooks/hook-host.ts`: suspensión (los suspendidos no se envían al sandbox y responden al instante, SC-013), registros y errores a la consola con regla y request, `reanudar`; ampliar `tests/integration/hook-host.test.ts` (quinto error suspende; correcta pone a cero; guardar el hook reanuda)
- [X] T047 [US2] `panel/components/hooks/HookConsole.tsx` en `DRAWER_SLOT` con nombre "Consola de hooks", como Console de DevTools (contracts/panel-ui.md): `Toolbar` con `IconButton` "Limpiar consola", campo "Filtrar", `ToggleButton` "Registros"/"Errores", menú de regla, `ToggleButton` "Mostrar valores sensibles" (FR-030) y "Vaciar estado" (`state.clear()`); "Limpiar consola" y "Vaciar estado" con el aviso de 004 y "Deshacer" durante 10 s; valores redactados como `••••••` con la etiqueta "redactado"; filas con icono de nivel, texto monoespaciado, colores de T034, burbuja de repeticiones y enlace "Regla · MÉTODO /ruta" que abre el request en Tráfico; estado vacío; lista navegable con flechas y Enter
- [X] T048 [P] [US2] `panel/components/hooks/HookErrorCounter.tsx` en `STATUS_ITEMS`: icono de error + número como el contador de DevTools, nombre accesible "N errores de hooks sin leer", oculto sin errores; clic abre el cajón filtrado a errores y los marca leídos (FR-028)
- [X] T049 [US2] Suspensión visible: toast de 004 "El hook «X» se suspendió tras 5 errores seguidos." con "Reanudar"; etiqueta "suspendido" con motivo y acción en `panel/components/rules/RuleList.tsx` (FR-022)
- [X] T050 [P] [US2] Errores con tipo, mensaje y "Línea N" y la acción "Abrir regla" en `HooksTab.tsx` (FR-024); el de tiempo agotado dice "Superó el límite de 2 s" (principio II, timeout visible); claves i18n de US2 en locales (tipos de error, consola, contador, suspensión, vaciar estado)

### E2E y checkpoint

- [X] T051 [US2] `e2e/hooks-failsafe.spec.ts`: escenarios 1–7 de US2 (excepción con línea exacta, resultado inválido con campo, 5 s y `while(true)` ⇒ original en ≤ 2,5 s y el siguiente request normal (SC-003), `state` descartado tras error, `log()` en consola y pestaña Hooks, contador de errores, "pausar Nahual"); 20 requests simultáneos con un contador ⇒ 20 (SC-012); `while(true)` en 6 recargas ⇒ suspendido tras el quinto error y los requests siguientes sin espera (SC-013); errores en < 1 s en la consola (SC-008); primera ejecución tras abrir el panel con un hook activo sin "tiempo agotado" (arranque precalentado); un hook que registra un objeto con `access_token`, los headers con `Authorization` (con permiso de lectura) y una URL con `?token=` los muestra redactados hasta "Mostrar valores sensibles" (SC-014); "Vaciar estado" y "Limpiar consola" se deshacen
- [X] T052 [US2] Ampliar `e2e/a11y.spec.ts` y `e2e/visual/panel.visual.spec.ts`: axe de la consola (vacía, con registros, con errores agrupados) y del contador en claro y oscuro a 320 px; recorrido con teclado por las filas hasta abrir un request; capturas a 3 anchos y 2 temas revisadas junto a Console de DevTools en el cajón

**Checkpoint (demostrable)**: pasos 11–14 de quickstart.md; `pnpm e2e` en verde.

---

## Phase 5: User Story 3 - Compartir hooks (Priority: P2)

**Goal**: exportar e importar hooks como `.ts` con su configuración, sin que un archivo de un
tercero actúe sin revisión, y descargar los tipos.

**Independent Test**: exportar un hook, borrar la regla e importar el archivo: vista previa con
configuración y código; la regla queda desactivada, "importado" y sin permisos; al activarla
funciona igual.

### Lógica (prueba primero)

- [X] T053 [P] [US3] `hr/hook-file.ts` (contracts/hook-file.md): `serializeHookFile(rule)` con el bloque `/* @nahual-hook 1` + JSON (`name` 1–80 con el schema de `Rule.name`, `stage`, `prefilter`, `resourceTypes`, `conditions`) + `*/` y el código; toda `/` precedida de `*` escrita como `\/`; nunca permisos, sitio, `id`, `order`, `enabled` ni `check`; `parseHookFile(text)` ⇒ `{ config | null, configError?, source }`; pruebas: ida y vuelta idéntica, prefiltro `*/api/*`, bloque ausente, JSON inválido, schema inválido, `import type` de `./nahual-hooks` admitido, nombre de 81 caracteres rechazado
- [X] T054 [US3] Prueba primero en `tests/integration/rule-store.test.ts` y luego comando `importHook` en `bg/app.ts` y `bg/rule-store.ts`: crea siempre una regla **nueva** en el sitio actual: con `config` si es válida, si no con una configuración vacía para que el dev la complete; nunca reemplaza el código de una regla existente; siempre `enabled: false`, `imported: true`, permisos en `false`, `check.ok: false`; límites de T029 (FR-036, FR-037)

### Panel

- [X] T055 [US3] `panel/components/hooks/ImportHookDialog.tsx` (`Dialog` de 004, contracts/panel-ui.md) y el handler "Importar hook…" de `HookEditor.tsx`: `<input type=file accept=".ts">`; rechazo si `File.size > 102,400`, si `TextDecoder("utf-8", { fatal: true })` falla o no se puede leer (FR-038); vista previa con la configuración como lista de definición o el aviso "El archivo no trae configuración…" con el motivo, el código en un `pre` de solo lectura con números de línea y el aviso "Se guardará como regla nueva y desactivada…"; "Importar" envía `importHook` (siempre regla nueva, FR-036)
- [X] T056 [P] [US3] "Exportar hook" y "Descargar tipos" en `HookEditor.tsx`: `Blob` + enlace `download` (`<nombre>.ts` con `serializeHookFile`; `nahual-hooks.d.ts` desde `hook-context.d.ts?raw`), sin red (FR-035, FR-039)
- [X] T057 [P] [US3] Etiqueta "importado" en `RuleList.tsx` y en el editor; claves i18n de US3 en locales

### E2E y checkpoint

- [X] T058 [US3] `e2e/hooks-share.spec.ts`: escenarios 1–7 de US3 (exportar y comprobar el bloque y el código descargados; importar con vista previa; regla desactivada, "importado" y sin permisos, 0 ejecuciones hasta activarla (SC-006); archivo sin bloque; > 100 KB y binario rechazados; importado con errores no se activa; tipos descargados compilan un hook con `tsc`)
- [X] T059 [US3] axe del diálogo de importación en claro y oscuro a 320 px y recorrido con teclado (abrir, revisar, importar, cancelar) en `e2e/a11y.spec.ts`; capturas del diálogo en `e2e/visual/panel.visual.spec.ts`

**Checkpoint (demostrable)**: pasos 15–17 de quickstart.md; `pnpm e2e` en verde.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T060 [P] `e2e/hooks-perf.spec.ts` (tag `@perf`, método de E4): overhead p95 de una regla con hook trivial frente a la misma regla con "Solo registrar" < 10 ms (SC-002); el camino sin reglas con hook sin regresión frente a 005; registrar en "Resultados" de research.md
- [X] T061 [P] SC-007: en `tests/dist/` comprobar que los chunks de la carga inicial del panel no crecen más de 10 % frente a 005 y que CodeMirror, TypeScript y Sucrase están en chunks aparte; medir la apertura del panel (5 aperturas, mediana) frente a 005; tamaños de cada chunk nuevo en research.md "Tamaño de los bundles"
- [X] T062 [P] Ampliar `e2e/storage-privacy.spec.ts` (contracts/storage.md): tras una sesión con un hook que registra un token (y el dev pulsa "Mostrar valores sensibles"), lo guarda en `state` y lee un `Authorization` con permiso, ningún valor aparece en `chrome.storage.local`, `storage.session`, `localStorage`, `sessionStorage` ni IndexedDB; `nahual.rules.v1` solo suma la acción `hook`
- [X] T063 [P] Actualizar `README.md` (hooks, permisos por regla, consola, compartir) y la ayuda del panel (`panel/components/Onboarding.tsx` en modo ayuda) con el flujo de los hooks
- [X] T064 Revisión de implementación en `specs/006-hooks-typescript/plan.md` (sección "Revisión de implementación"): manifest y CSP, `eval` solo en el sandbox, dependencias y licencias con tamaños reales, modelo de amenazas (importado malicioso, destino, valores sensibles, escape, envenenamiento entre hooks, mensajes falsos), coherencia visual con DevTools vista por vista, definición de terminado por historia
- [ ] T065 Ejecutar la suite completa 3 veces seguidas (`pnpm e2e`) y la visual; registrar estabilidad en "Resultados" de research.md
- [ ] T066 **Checkpoint final**: demo de punta a punta con los pasos 1–18 de `specs/006-hooks-typescript/quickstart.md` en Chrome estable, con DevTools abierto al lado para comparar editor, consola, contador y pestaña Hooks con Sources, Console y Network en ambos temas; prueba de SC-004 (un dev que no usó hooks, < 3 min desde una plantilla) con el tiempo en research.md; `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm verify:dist && pnpm e2e && pnpm --filter @nahual/extension e2e:visual` en verde; research.md sin "por registrar"; recordar la deuda de 001 (E5/T066, T067, "en conflicto"), la intermitencia de 003 y la feature futura de edición de bodies no textuales

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sin dependencias. T008 depende de T005–T007; sus resultados pueden cambiar
  R2, R4 o R16 (y T023–T025, T033, T035) antes de la fase 2.
- **Foundational (Phase 2)**: depende de Setup. T010–T012 dependen de T009; T016–T020 de T014;
  T018 de T016 y T017; T019 de T018; T021 de T010 y T014; **T022 antes de T023–T027**; T023 y T024
  van juntos (el sandbox carga el runtime del Worker); T026 de T016–T020 y T025; T027 de T012 y T021; T028 de T027; T030 de
  T026–T029; T031 al final. Bloquea las tres historias.
- **US1 (Phase 3)**: depende de Foundational.
- **US2 (Phase 4)**: depende de Foundational; usa `HooksTab.tsx` de T038 solo en T050 (si US1 no
  está, T050 crea el componente mínimo). Puede ir en paralelo con US1.
- **US3 (Phase 5)**: depende de Foundational y de `HookEditor.tsx` (T036) para sus botones.
- **Polish (Phase 6)**: depende de las tres historias.

### Within Each User Story

- Pruebas de lógica e integración antes de su implementación (deben fallar primero).
- Lógica pura → SW → panel → E2E → axe y capturas → checkpoint.
- T033 → T035 → T036 → T037 (servicio de tipos, editor, slot, acción).

### Parallel Opportunities

- Setup: T002, T004–T007 en paralelo tras T001.
- Foundational: T011 con T010; T013–T015 en paralelo; T017 y T020 en paralelo con T016.
- US1: T032, T034, T039 y T040 en paralelo con T033.
- US2: T044 y T045 en paralelo; T048 y T050 en paralelo con T047.
- US3: T053 en paralelo con todo US1/US2; T056 y T057 en paralelo con T055.
- Polish: T060–T063 en paralelo.

## Parallel Example: Foundational (`hook-runtime`)

```text
Task: "T013 hashSource FNV-1a en packages/hook-runtime/src/hash.ts"
Task: "T014 schemas de contexto, outcome y mensajes en packages/hook-runtime/src/schemas.ts"
Task: "T015 hook-context.d.ts y prueba de tipos en packages/hook-runtime/src/hook-context.d.ts"
Task: "T017 maskSensitive/mergeMasked en packages/hook-runtime/src/mask.ts"
Task: "T020 estado con versiones en packages/hook-runtime/src/state.ts"
```

## Implementation Strategy

### MVP First (User Story 1)

1. Setup con X1–X3 registrados (ajustar el diseño si algún respaldo aplica).
2. Foundational: dominio, `hook-runtime`, protocolo v5, suite de escape y runtime completo.
3. US1: editor, plantillas, acción, pestaña Hooks.
4. **Parar y validar**: pasos 1–10 de quickstart.md, con DevTools al lado para comparar el
   editor con Sources.

### Incremental Delivery

1. US1 ⇒ demo de escribir y activar hooks.
2. US2 ⇒ demo de fallos seguros, consola y suspensión (pasos 11–14).
3. US3 ⇒ demo de compartir (pasos 15–17).
4. Polish ⇒ rendimiento, tamaño, privacidad, revisión y checkpoint final.

### Notes

- [P] = archivos distintos, sin dependencias pendientes.
- Nunca dos procesos de Playwright a la vez (cada uno borra `test-results/`).
- No ejecutar prettier sobre `specs/`.
- Commit por tarea o grupo lógico; cada checkpoint deja la suite en verde.
