# Implementation Plan: Spike CDP y base del proyecto

**Branch**: `001-spike-cdp` | **Date**: 2026-10-22 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-spike-cdp/spec.md`

## Summary

Validar con datos el ciclo adjuntar → pausar → continuar → soltar sobre `chrome.debugger` + CDP
y dejar el esqueleto del proyecto. Se construye un monorepo pnpm + Turborepo con tres paquetes:
`packages/domain` (vacío, con pruebas configuradas), `packages/protocol` (contratos Zod de los
mensajes panel ↔ service worker) y `apps/extension` (manifest MV3, service worker, `devtools_page`
y panel React mínimo). El service worker tiene tres piezas: `DebuggerManager` (sesiones por
pestaña, detección de detach, limpieza de huérfanas al arrancar, reconexión explícita),
`FetchInterceptor` (Fetch.enable con patrones y etapa, pausa con timeout configurable,
continuar con o sin headers modificados) y `PanelPort` (puerto validado con Zod y con
verificación de remitente). Los experimentos de CORS, DevTools nativas y overhead se ejecutan
durante la implementación y sus resultados completan `research.md`.

## Technical Context

**Language/Version**: TypeScript 5.x en modo `strict` (+ `noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`); Node.js 24 LTS para herramientas; pnpm 10.

**Primary Dependencies**: React 19 + React DOM (panel), Zod (contratos), Vite + `@crxjs/vite-plugin`
(build MV3 por contexto), Turborepo (orquestación). Ver la justificación en
[Dependencias](#dependencias-justificación).

**Storage**: `chrome.storage.session` solo para el registro de pestañas con debugger adjunto
(limpieza de huérfanas). Sin `storage.local` ni almacenamiento persistente en esta feature.

**Testing**: Vitest (unitarias y de integración con un CDP simulado), `@vitest/coverage-v8`
(umbral 85% en `packages/*`), Playwright con Chromium y la extensión cargada (E2E y robustez).

**Target Platform**: Chrome estable ≥ 120 (MV3, service worker con sesiones de debugger que
lo mantienen vivo), Linux/macOS/Windows.

**Project Type**: Extensión de navegador (MV3) en monorepo con paquetes de librería.

**Performance Goals**: Overhead de interceptar sin pausar p95 < 20 ms por request (principio VI),
medido sobre ≥ 500 requests (FR-020). Detección de desconexión en el panel < 1 s (SC-002).

**Constraints**: Sin `eval`, sin código remoto, sin tráfico de red propio; CSP
`script-src 'self'; object-src 'self'`; debugger adjunto solo con el panel abierto; tráfico
continúa sin cambios ante cualquier error; Fetch habilitado solo con patrones configurados.

**Scale/Scope**: Una pestaña por panel, varias pestañas independientes; ~1 pantalla de panel;
sin persistencia de reglas.

Sin `NEEDS CLARIFICATION`: las incógnitas técnicas se resolvieron en [research.md](./research.md)
o quedan como experimentos con método definido.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio | Verificación | Estado |
|---|---|---|
| I. Seguridad por defecto | Local-first, sin red propia ni telemetría. Permisos solo `debugger` y `storage` (justificados abajo); sin host permissions. CSP estricta. Mensajería validada con Zod + `sender.id`. Debugger solo con el panel abierto (desconexión del puerto ⇒ detach). Contenido capturado como texto; ESLint prohíbe `eval`, `innerHTML`, `dangerouslySetInnerHTML` | ✅ |
| II. Fallar de forma segura | Todo error durante una pausa ⇒ `continueRequest`/`continueResponse` sin cambios. Timeout visible y configurable (30 s, 5–120 s). Detach ⇒ Chrome libera las pausas de esa sesión | ✅ |
| III. Usabilidad | Panel mínimo pero conforme (FR-016a): estados vacío/carga/error con causa y acción, textos `es`/`en` vía `chrome.i18n`, operable solo con teclado con foco visible, atajos para Adjuntar/Soltar y Continuar, tema según `chrome.devtools.panels.themeName`, layout a 320 px, axe sin violaciones serias/críticas en la E2E | ✅ |
| IV. Test-first | Pruebas de `packages/protocol` antes de la mensajería; `DebuggerManager` y `FetchInterceptor` con pruebas de integración sobre un CDP simulado escritas antes de implementar; E2E con Playwright; pruebas que intentan violar la mensajería (remitente ajeno, mensaje inválido). Cobertura 85% en `packages/*` | ✅ |
| V. Capas y dominio puro | La lógica de CDP vive detrás de la interfaz `DebuggerPort`; el panel solo habla con el SW por mensajes de `packages/protocol`. `packages/domain` queda vacío (no hay lógica de reglas aún) | ✅ |
| VI. Rendimiento | Experimento de overhead con método reproducible; Fetch solo con patrones; sin patrones no se llama a `Fetch.enable` | ✅ |
| VII. Cadena de suministro | Versiones exactas (`save-exact`), lockfile commiteado, `pnpm audit` y verificación de licencias contra una lista permitida en CI (FR-018a), build reproducible verificado (dos builds ⇒ mismo hash). SBOM y publicación quedan para 006 | ✅ |
| VIII. Modelo de producto | Nada cloud ni de pago en esta feature | ✅ |

**Modelo de amenazas** (cambios que introduce esta feature):

| Amenaza | Aplica | Mitigación en 001 |
|---|---|---|
| Página maliciosa manipula la extensión | Sí | Sin content scripts; la página no tiene canal hacia la extensión |
| Abuso del permiso `debugger` | Sí | Adjuntar solo por acción explícita en el panel; detach al cerrar el panel; estado visible; barra de Chrome no se oculta |
| Pérdida de control de la página | Sí | Timeout por pausa; errores ⇒ continuar sin cambios; limpieza al arrancar |
| XSS en el panel | Sí | React con texto plano; regla ESLint; CSP |
| Dependencia comprometida | Sí | Dependencias mínimas, exactas, auditadas |
| **Nueva:** mensaje de otra extensión o página al puerto | Sí | `onConnect` (no `onConnectExternal`); verificar `port.sender.id === chrome.runtime.id` y URL del panel; validar con Zod; descartar y registrar |
| **Nueva:** sesión de debugger huérfana tras reinicio | Sí | Al arrancar: `chrome.debugger.getTargets()` ⇒ detach de los que tengan `extensionId` propio + registro en `storage.session` |

Resultado: **PASA**. Sin violaciones; tabla de complejidad vacía.

### Permisos (justificación)

| Permiso | Para qué | Por qué no hay alternativa |
|---|---|---|
| `debugger` | Adjuntar CDP a la pestaña inspeccionada y usar el dominio Fetch | Es el núcleo del producto; `declarativeNetRequest` no permite pausar ni editar respuestas |
| `storage` | `chrome.storage.session`: pestañas con sesión activa, para limpiar huérfanas al arrancar | La memoria del SW se pierde en un reinicio; `storage.session` no persiste en disco |

**Host permissions**: no se declaran en 001, ni siquiera como opcionales. `chrome.debugger` no
las necesita y ningún flujo de 001 las solicita. Se añadirán como `optional_host_permissions`
por dominio en la feature que las use (002/003), con su justificación.

### Dependencias (justificación)

Todas con versión exacta fijada en el lockfile al instalar. Las librerías de JSONPath, diff y
transpilación **no** se instalan en 001: solo se decide cuál usar (ver research.md).

| Dependencia | Ámbito | Motivo | Licencia |
|---|---|---|---|
| `typescript` | dev | Lenguaje (constitución) | Apache-2.0 |
| `turbo` | dev | Orquestación y caché de tareas del monorepo | MIT |
| `vite`, `@vitejs/plugin-react` | dev | Build de panel, devtools page y SW | MIT |
| `@crxjs/vite-plugin` | dev | Manifest como código, bundles por contexto MV3, `_locales` | MIT |
| `react`, `react-dom` | prod | Panel (constitución) | MIT |
| `zod` | prod | Validación de mensajes (constitución, principio I) | MIT |
| `vitest`, `@vitest/coverage-v8` | dev | Pruebas unitarias/integración y cobertura | MIT |
| `@playwright/test` | dev | E2E con la extensión real (constitución) | Apache-2.0 |
| `@axe-core/playwright` | dev | Verificación WCAG 2.2 AA en la E2E (definición de terminado) | MPL-2.0 (solo herramienta de pruebas; no se empaqueta en la extensión) |
| `eslint`, `typescript-eslint`, `eslint-plugin-react-hooks`, `prettier` | dev | Calidad y reglas de seguridad | MIT |
| `@types/chrome` | dev | Tipos de las APIs `chrome.*` | MIT |

Fuera de estas, cualquier dependencia nueva requiere actualizar esta tabla.

## Project Structure

### Documentation (this feature)

```text
specs/001-spike-cdp/
├── plan.md              # Este archivo
├── research.md          # Decisiones + experimentos (se completa en implementación)
├── data-model.md        # Entidades y máquinas de estado
├── quickstart.md        # Guía de validación de punta a punta
├── contracts/
│   ├── panel-protocol.md   # Mensajes panel ↔ service worker
│   └── manifest.md         # Contrato del manifest MV3 de 001
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
package.json                 # scripts raíz, packageManager pnpm@10
pnpm-workspace.yaml
turbo.json
tsconfig.base.json
eslint.config.js             # incluye reglas no-eval / innerHTML / dangerouslySetInnerHTML
.prettierrc
.npmrc                       # save-exact=true, engine-strict=true
.nvmrc                       # 24
LICENSE                      # Apache-2.0
.github/workflows/ci.yml     # lint, typecheck, test, audit, build reproducible

packages/
├── domain/
│   ├── src/index.ts         # vacío en 001
│   ├── tests/smoke.test.ts
│   └── vitest.config.ts     # cobertura 85%
└── protocol/
    ├── src/
    │   ├── envelope.ts      # versión, tipo, id, correlationId
    │   ├── panel-to-sw.ts   # comandos del panel
    │   ├── sw-to-panel.ts   # eventos del SW
    │   └── index.ts         # parse seguro: parsePanelMessage / parseSwMessage
    ├── tests/
    └── vitest.config.ts

apps/extension/
├── manifest.config.ts       # defineManifest (crxjs)
├── public/_locales/
│   ├── es/messages.json
│   └── en/messages.json
├── src/
│   ├── background/
│   │   ├── index.ts                 # arranque: limpieza de huérfanas, wiring
│   │   ├── debugger-port.ts         # interfaz DebuggerPort (adaptador CDP)
│   │   ├── chrome-debugger.ts       # implementación sobre chrome.debugger
│   │   ├── debugger-manager.ts      # sesiones por pestaña y estados
│   │   ├── fetch-interceptor.ts     # Fetch.enable, requestPaused, continue*, timeout
│   │   ├── panel-port.ts            # onConnect, validación, verificación de remitente
│   │   └── session-registry.ts      # chrome.storage.session
│   ├── devtools/
│   │   ├── devtools.html
│   │   └── devtools.ts              # chrome.devtools.panels.create
│   ├── panel/
│   │   ├── panel.html
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── use-sw-connection.ts     # puerto + reconexión del puerto
│   │   └── components/              # StatusBar, PatternForm, PausedList, HeaderEditor
│   └── shared/i18n.ts               # t(key) sobre chrome.i18n.getMessage
├── tests/
│   ├── fakes/fake-debugger.ts       # CDP simulado
│   ├── dist/                        # verify:dist: manifest, sin red propia, sin parámetro de test
│   ├── unit/
│   └── integration/
└── e2e/
    ├── fixtures/extension.ts        # contexto persistente con --load-extension
    ├── fixtures/servers.ts          # app (origen A) + API (origen B) locales
    ├── fixtures/conflict-extension/ # extensión auxiliar: segundo cliente de debugger
    ├── a11y.spec.ts                 # axe, teclado, 320 px, temas
    ├── attach-pause-continue.spec.ts
    ├── sw-restart.spec.ts
    ├── detach-detection.spec.ts
    └── experiments/                 # CORS, DevTools, overhead (salida para research.md)
```

**Structure Decision**: monorepo con dos paquetes de librería (`packages/domain`,
`packages/protocol`) y una app (`apps/extension`), tal como fija la constitución. La lógica de
CDP queda en `apps/extension/src/background` detrás de `DebuggerPort` para poder probarla con
`fake-debugger.ts`; cuando aparezca lógica de reglas (002) irá a `packages/domain`.

## Diseño clave

- **Ciclo de vida del puerto**: el panel abre `chrome.runtime.connect({ name: "panel" })` y su
  primer mensaje es `hello { tabId }` (de `chrome.devtools.inspectedWindow.tabId`). Al
  desconectarse el puerto (panel o DevTools cerrados), el SW hace detach de esa pestaña
  (FR-004). Un puerto por pestaña; un segundo panel para la misma pestaña reemplaza al anterior.
  El SW solo hace detach cuando se desconecta el puerto **dueño actual** de la pestaña; cerrar
  el puerto reemplazado no suelta el debugger.
- **Builds**: `build` (producción, el que se empaqueta y se verifica en `verify:dist`) y
  `build:test` (`--mode test`, salida `dist-test`, solo para la E2E). Solo `build:test` acepta
  el parámetro `__nahualTestTabId` para abrir el panel fuera de DevTools; `verify:dist`
  comprueba que el build de producción no lo contiene.
- **Arranque del SW**: antes de aceptar puertos, `cleanupOrphans()` hace detach de todo target
  con `attached && extensionId === chrome.runtime.id` y de las pestañas del registro en
  `storage.session`; luego vacía el registro. El detach libera las pausas pendientes (Chrome
  continúa los requests de una sesión cerrada). Verificado por `sw-restart.spec.ts`.
- **Detach externo**: `chrome.debugger.onDetach` ⇒ estado `disconnected` con causa
  (`canceled_by_user`, `target_closed`) y evento `state` al panel en < 1 s. Un `attach` que falla
  porque otro cliente ya está adjunto ⇒ `conflict`. Reconexión solo por comando `reconnect`.
- **Pausa**: `Fetch.requestPaused` ⇒ se registra `PausedRequest` con vencimiento
  `now + timeoutMs`, se notifica al panel y se arma un temporizador. El primer evento entre
  `continue`, timeout, error o detach lo resuelve; los demás se ignoran (idempotente por id).
- **Continuar con headers**: Request ⇒ `Fetch.continueRequest { headers }`; Response ⇒
  `Fetch.continueResponse { responseHeaders }`. Si el comando CDP falla, se reintenta una vez
  sin cambios y se informa el error al panel.
- **Body**: en etapa Response se consulta `Fetch.getResponseBody` solo para mostrar tamaño y
  disponibilidad; en redirecciones (3xx) no se llama y se marca `bodyAvailable: false`.

## Complexity Tracking

Sin violaciones de la constitución que justificar.
