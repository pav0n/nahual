# Implementation Plan: Captura de tráfico e intercept condicional

**Branch**: `002-captura-intercept` | **Date**: 2026-10-22 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-captura-intercept/spec.md`

## Summary

Primera versión usable de Nahual sobre la base de 001. `packages/domain` deja de estar vacío:
schemas Zod de `Rule`, `Condition`, `Action`, `Settings`, `CapturedExchange` y `PausedItem`, el
evaluador puro de condiciones (status, headers, query, JSONPath con json-p3, GraphQL), la
selección por prioridad, el cálculo mínimo de patrones de `Fetch.enable`, las plantillas y la
detección de headers sensibles, todo con TDD. En el service worker, `NetworkCapture` (captura
pasiva con `Network.enable`), `RuleEngine` (evalúa reglas del sitio actual sobre
`Fetch.requestPaused`), `PauseQueue` (cola ≤ 100 con timeout y limpieza al navegar, cerrar o
soltar), `ActionExecutor` (continuar, editar, mock, fallar, retrasar) y `RuleStore`/`SettingsStore`
sobre `chrome.storage.local` con validación al leer. El protocolo pasa a v2. El panel React se
rehace con Zustand + Immer: lista de tráfico virtualizada, detalle, editor de reglas, cola con
cuenta regresiva, onboarding e indicador de estado, con componentes nativos accesibles. Sin
permisos nuevos.

## Technical Context

**Language/Version**: TypeScript 5.9 strict (como 001); Node.js 24; pnpm 10.

**Primary Dependencies**: las de 001 más `json-p3`, `zustand`, `immer` y
`@tanstack/react-virtual` (ver [Dependencias](#dependencias-justificación)).

**Storage**: `chrome.storage.local` para reglas y ajustes ([contracts/storage.md](./contracts/storage.md));
`chrome.storage.session` para el registro de sesiones de 001. Historial solo en memoria del panel.

**Testing**: Vitest (dominio con cobertura ≥ 85%, protocolo, SW con `FakeDebugger` ampliado a
Network, Page y las respuestas de Fetch); Playwright con la extensión cargada y el fixture de dos
orígenes; `@axe-core/playwright`; experimento de overhead.

**Target Platform**: Chrome estable ≥ 120, Linux/macOS/Windows.

**Project Type**: Extensión MV3 en monorepo (sin cambios de estructura).

**Performance Goals**: overhead p95 < 20 ms por request interceptado sin pausa (SC-002); filtro
de 2,000 entradas < 300 ms y scroll fluido (SC-004); estado en el panel < 1 s tras un detach.

**Constraints**: los de 001 (sin `eval`, sin red propia, CSP estricta, fallo seguro). Body
evaluable ≤ 5 MB; historial 2,000 por pestaña; cola ≤ 100; retraso ≤ 60 s; timeout 5–300 s;
≤ 500 reglas; mock guardado ≤ 1 MB.

**Scale/Scope**: una pestaña por panel; ~6 vistas del panel (tráfico, detalle, reglas, editor,
cola, onboarding); ~55 claves nuevas de i18n.

Sin `NEEDS CLARIFICATION`: todo resuelto en [research.md](./research.md) (R1–R20).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio | Verificación | Estado |
|---|---|---|
| I. Seguridad por defecto | Local-first: reglas en `storage.local`, nunca `storage.sync`; historial y bodies solo en memoria. Sin permisos nuevos. Mensajería v2 validada con Zod + remitente (como 001); reglas validadas al guardar y al leer. Bodies como texto (`<pre>`/`<textarea>`); sin librería de editor que exija relajar la CSP. Headers sensibles enmascarados en la UI y redactados en registros. Debugger solo con el panel abierto: el adjunto automático lo pide el panel al abrirse (R17) | ✅ |
| II. Fallar de forma segura | Excepción del motor, comando CDP fallido, mensaje inválido o detach ⇒ continuar sin cambios (reintento único de 001). Timeout visible por item (60 s, 5–300 s). Navegación, cierre y "Soltar" vacían la cola. Cola llena ⇒ continuar. Condición no evaluable ⇒ `false` sin retraso | ✅ |
| III. Usabilidad | Onboarding ≤ 3 pasos, plantillas, estados vacío/carga/error con causa y acción, deshacer en limpiar historial y eliminar regla, atajos (R16), solo teclado, grid accesible (R13), `<dialog>` nativo, tema de DevTools, 320 px, `es`/`en`. Prueba moderada de primer uso (SC-001) | ✅ |
| IV. Test-first | TDD en `packages/domain` (evaluador por caso, prioridad, patrones, validación, plantillas, sensibles); protocolo antes de mensajería; integración `requestPaused ⇒ acción` con CDP simulado; E2E por historia; pruebas que intentan violar garantías (regla inválida, mensaje ajeno, item ya resuelto, red propia, datos de tráfico en storage). Cobertura ≥ 85% en `packages/*` | ✅ |
| V. Capas y dominio puro | Toda la lógica de reglas en `packages/domain` sin `chrome.*`; el SW la usa vía adaptadores (`DebuggerPort`, `StoragePort`); el panel solo habla con el SW por protocolo v2 | ✅ |
| VI. Rendimiento | Sin reglas activas: solo `Network`. `Fetch.enable` con patrones mínimos de reglas activas del sitio (R3). Body solo si una regla candidata lo necesita (R4). Medición de overhead (R20). Límites 5 MB / 2,000 | ✅ |
| VII. Cadena de suministro | Cuatro dependencias nuevas, exactas, ≥ 14 días, MIT, justificadas abajo; se descartan Radix, Monaco y CodeMirror en 002 para minimizar superficie (R14, R15); `check-licenses` y `audit` en CI | ✅ |
| VIII. Modelo de producto | Todo local y gratuito; nada cloud | ✅ |

**Modelo de amenazas** (cambios que introduce 002):

| Amenaza | Aplica | Mitigación en 002 |
|---|---|---|
| Página maliciosa manipula la extensión | Sí | Sigue sin content scripts; el tráfico entra por CDP. Los valores de la página (URLs, headers, bodies) se tratan como datos: validados con límites de tamaño y mostrados como texto |
| XSS en el panel | Sí | Bodies en `<pre>` y `<textarea>`; nada se interpreta como HTML; regla ESLint de 001 |
| Fuga de credenciales | Sí | Headers sensibles enmascarados por defecto (FR-004a); registros sin valores (FR-036); historial no persiste |
| Abuso del permiso `debugger` | Sí | Adjunto automático solo tras consentimiento y con el panel abierto; ajuste para desactivarlo; indicador permanente con "Soltar" |
| Pérdida de control de la página | Sí | Timeout por item; cola ≤ 100; retraso ≤ 60 s; limpieza en navegación, detach y cierre |
| **Nueva:** reglas corruptas o manipuladas en `storage.local` | Sí | Validación Zod regla por regla al leer; las inválidas no se usan; aviso |
| **Nueva:** regla demasiado amplia que bloquea el sitio | Sí | Plantillas de mock/retraso exigen prefiltro; "Pausar Nahual"; "Continuar todos"; cola llena ⇒ continuar |
| **Nueva:** regex con backtracking catastrófico bloquea el SW | Sí | Longitud ≤ 512, compilada al guardar, texto evaluado acotado (R19). Riesgo residual aceptado: la regex es del propio dev y se recupera con "Pausar Nahual" o soltando |
| **Nueva:** mock local a otro origen descartado por CORS, o relajación de CORS por la puerta de atrás | Sí | Solo en respuestas sintéticas de mocks: ACAO con el origen exacto de la página, nunca `*`, solo si el mock no define CORS; los preflight no se mockean (research R21). Las respuestas reales no se tocan (eso es 003) |
| **Nueva:** mensaje gigante del panel agota memoria del SW | Bajo | Puerto solo de la propia extensión; límite de 6 MB descartado antes de parsear |
| Dependencia comprometida | Sí | 4 dependencias nuevas sin transitivas (salvo `iregexp-check` y `virtual-core`), exactas, auditadas, licencias verificadas |

Resultado: **PASA**. Sin violaciones; tabla de complejidad vacía.

### Permisos (justificación)

Ninguno nuevo (FR-034). `storage` ya cubre `storage.local`; `Network`, `Page` y `Fetch` son
dominios de CDP bajo `debugger`. Se descartaron `tabs` y `webNavigation` (el sitio y la
navegación salen de CDP, R9) y `unlimitedStorage` (R10). Ver
[contracts/manifest.md](./contracts/manifest.md).

### Dependencias (justificación)

Además de las de 001. Versiones publicadas hace ≥ 14 días al 2026-10-22.

| Dependencia | Versión | Ámbito | Paquete | Motivo | Licencia |
|---|---|---|---|---|---|
| `json-p3` | 3.0.0 | prod | `packages/domain` | Condiciones JSONPath RFC 9535 sin `eval` (001-D3, R5). Transitiva: `iregexp-check` (MIT) | MIT |
| `zod` | 4.6.5 | prod | `packages/domain` | Schemas de dominio (ya en el repo; se añade al paquete) | MIT |
| `zustand` | 5.0.15 | prod | `apps/extension` | Store del panel (pedido en la entrada, R12) | MIT |
| `immer` | 11.1.21 | prod | `apps/extension` | Actualizaciones inmutables del store (R12) | MIT |
| `@tanstack/react-virtual` | 3.14.13 | prod | `apps/extension` | Lista virtualizada de 2,000 entradas (SC-004, R13). Transitiva: `@tanstack/virtual-core` 3.17.11 (MIT) | MIT |

Descartadas: Radix UI (R15), Monaco y CodeMirror (R14), librería de GraphQL (R6), librería de
glob (R3). `packages/protocol` pasa a depender de `@nahual/domain` (workspace).

## Project Structure

### Documentation (this feature)

```text
specs/002-captura-intercept/
├── plan.md              # Este archivo
├── research.md          # R1–R20 + resultados por registrar
├── data-model.md        # Rule, Condition, Action, Settings, CapturedExchange, PausedItem
├── quickstart.md        # Validación de punta a punta y prueba moderada
├── contracts/
│   ├── panel-protocol.md   # Protocolo v2
│   ├── storage.md          # chrome.storage.local
│   └── manifest.md         # Sin cambios respecto a 001
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
packages/domain/src/
├── index.ts
├── schemas/            # rule.ts, condition.ts, action.ts, settings.ts, exchange.ts, paused.ts, limits.ts
├── match/              # glob.ts, prefilter.ts, status.ts, headers.ts, query.ts
├── jsonpath.ts         # envoltorio de json-p3 + semántica de operadores (R5)
├── graphql.ts          # detección, operationName, errors (R6)
├── evaluate.ts         # evaluateRule / selectRule (R4)
├── fetch-patterns.ts   # computeFetchPatterns (R3)
├── validate.ts         # validación con issues por campo (FR-013)
├── templates.ts        # cuatro plantillas (FR-018)
├── sensitive.ts        # isSensitiveHeader / redact (FR-004a, FR-036)
└── body.ts             # detección de binario, tamaño, decodificación base64
packages/domain/tests/  # una prueba por módulo, escrita antes

packages/protocol/src/  # v2: panel-to-sw.ts, sw-to-panel.ts, envelope.ts (PROTOCOL_VERSION = 2)

apps/extension/src/background/
├── index.ts                 # wiring
├── debugger-manager.ts      # de 001 (+ Network/Page al adjuntar, sitio de la pestaña)
├── network-capture.ts       # Network.* ⇒ ExchangeUpdate en lotes de 50 ms (R1, R2, R11)
├── rule-engine.ts           # selectRule sobre requestPaused; pide body si hace falta (R4)
├── fetch-interceptor.ts     # de 001: Fetch.enable con computeFetchPatterns; despacha al RuleEngine
├── pause-queue.ts           # cola, timeout, navegación, detach (R8)
├── action-executor.ts       # continue/fulfill/fail/delay y ediciones (R7)
├── rule-store.ts            # storage.local + validación + deshacer eliminar (R10)
├── settings-store.ts
├── storage-port.ts          # interfaz sobre chrome.storage (para FakeStorage)
├── logger.ts                # registros redactados (FR-036)
└── panel-port.ts            # de 001, protocolo v2
apps/extension/src/panel/
├── store/                   # zustand: connection, traffic, rules, queue, settings, ui
├── components/
│   ├── StatusBar.tsx        # indicador permanente (FR-028)
│   ├── Onboarding.tsx       # <dialog>, ≤ 3 pasos
│   ├── traffic/             # TrafficGrid (virtual), Filters, ExchangeDetail, BodyView, HeaderList
│   ├── rules/               # RuleList, RuleEditor, ConditionEditor, ActionEditor, Templates
│   ├── queue/               # PauseQueue, PausedEditor, Countdown
│   └── common/              # Tabs, Toast (deshacer), Switch, EmptyState
├── components/SettingsPanel.tsx   # timeout, adjunto automático (FR-022, FR-027a)
├── use-sw-connection.ts     # de 001, v2 + adjunto automático (R17)
└── use-shortcuts.ts         # R16
apps/extension/tests/        # fakes ampliados (FakeDebugger: Network, Page, Fetch con bodies)
apps/extension/e2e/
├── fixtures/servers.ts      # rutas de la app de prueba (quickstart)
├── traffic.spec.ts          # US1
├── conditional-pause.spec.ts# US2
├── first-use.spec.ts        # US3
├── rule-actions.spec.ts     # US4
├── no-hang.spec.ts          # SC-003: navegación, cierre, detach, timeout, errores con cola
├── a11y.spec.ts             # todos los estados, ambos temas, 320 px
└── experiments/e4-overhead-rules.spec.ts   # R20
```

Se eliminan `PatternForm.tsx` y los comandos `setPatterns`/`setPauseTimeout` de 001 (los
reemplazan reglas y ajustes); `HeaderEditor.tsx` y `PausedList.tsx` evolucionan a `queue/`.

**Structure Decision**: la de 001 sin paquetes nuevos. La lógica nueva va a `packages/domain`
(principio V); el SW suma adaptadores pequeños, cada uno probado con fakes.

## Diseño clave

- **Flujo de un request con reglas** (R3, R4, R7, R8): `Fetch.requestPaused` ⇒ `RuleEngine`
  arma la vista del intercambio y llama a `selectRule` con las reglas activas del sitio para esa
  etapa ⇒ sin regla: `continue*` inmediato (camino rápido, medido en R20) ⇒ con regla: la acción
  la ejecuta `ActionExecutor` o entra en `PauseQueue`. Cada resultado se emite como `effect` en
  el lote de `exchanges`.
- **Sitio y reglas activas**: el SW conoce el sitio de cada pestaña (R9); al cambiar sitio,
  reglas o "pausar Nahual", recalcula patrones y llama a `Fetch.enable`/`Fetch.disable`.
  Requests ya pausados no se reevalúan.
- **Única fuente de verdad**: reglas y ajustes viven en el SW (memoria + storage); el panel
  recibe copias por eventos. El historial vive solo en el panel.
- **Adjunto automático** (R17): decisión del panel tras `hello`; el SW nunca se adjunta solo.
- **Edición con headers sensibles**: el editor parte de los valores reales; la máscara es solo
  visual (FR-004b), y la prueba E2E comprueba que el servidor recibe el valor original.

## Revisión de implementación (T108)

Revisión del diff de 002 contra el modelo de amenazas y la definición de terminado:

| Punto | Resultado |
|---|---|
| Permisos | Sin cambios: `debugger` y `storage`, sin host permissions (`tests/dist/manifest.test.ts`). `storage.local`, `Network`, `Page` y `Fetch` no piden permisos nuevos |
| Dependencias | Las cuatro de la tabla, exactas y ≥ 14 días; `check-licenses` y `pnpm audit` en verde. `verify:dist` comprueba que están en los bundles revisados sin `eval`, `new Function` ni red propia. Se añadió a la lista permitida el texto `WebSocket`/`EventSource` de la enumeración `Network.ResourceType` |
| Mensajería v2 | `onConnect` únicamente, remitente verificado, Zod en ambos extremos, mensajes del panel > 6 MB descartados sin parsear; `saveRule` y `resolvePaused` validan en el SW y devuelven `issues` por campo sin valores |
| Registros | `logger.ts` redacta headers sensibles, URLs y textos largos aunque se le pasen (`tests/unit/logger.test.ts`) |
| Enmascarado | Headers sensibles enmascarados en detalle y cola; en el editor la máscara es solo visual y el valor real viaja (E2E: la `Cookie` llega al servidor con su valor) |
| Contenido como texto | Bodies en `<pre>`/`<textarea>`; E2E con `/api/html` (marcado y `onerror` en body y header) sin ejecución ni violaciones de CSP |
| Storage | Solo `nahual.rules.v1` y `nahual.settings.v1`; sin datos de tráfico tras una sesión completa (`storage-privacy.spec.ts`). Reglas corruptas descartadas sin borrarlas del disco |
| Fallo seguro | Timeout por item, reintento sin cambios, `injectedFault` en captura, motor y aplicación de cambios; navegación, cierre, Soltar y reinicio del SW sin páginas colgadas (`no-hang.spec.ts`, `sw-restart.spec.ts`) |
| **Nueva:** mocks locales y CORS | Hallazgo de la implementación (research R21): un mock a otro origen necesita `Access-Control-Allow-Origin`. Se añade con el origen exacto de la página, nunca `*`, solo si el mock no lo define; los preflight no se mockean. Añadido al modelo de amenazas |
| **Nueva:** fallos inyectables en el build de pruebas | `test-hooks.ts` solo existe con `--mode test`; `verify:dist` comprueba que `__nahualFaults` no está en producción |
| Rendimiento | Overhead p95 2,5–2,6 ms con reglas que no se cumplen (R20); filtro de 2,000 entradas medido en la E2E (SC-004); bundles +48,8 KB gzip |
| Definición de terminado | Por historia: unitarias, integración y E2E en verde; axe sin violaciones serias en ambos temas a 320 px, incluido el onboarding; textos `es`/`en`; estados vacío, carga y error. Pendientes que necesitan personas: la prueba moderada de SC-001 (T109) y la demo en Chrome estable (T110) |

## Complexity Tracking

Sin violaciones de la constitución que justificar.
