# Implementation Plan: CORS de desarrollo

**Branch**: `003-cors-desarrollo` | **Date**: 2026-10-23 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-cors-desarrollo/spec.md`

## Summary

Módulo CORS sobre 002, con la estrategia D5 de 001 ajustada por la clarificación del preflight.
En `packages/domain` (TDD): clasificador de causas a partir de `corsErrorStatus`, el request y
la respuesta; cálculo de los headers de relajación (origen exacto, credenciales, métodos y headers
solicitados, `Expose-Headers`, `Max-Age: 0`) y de si un preflight del servidor pasaría;
validador de relajaciones (nunca `*` con credenciales, nunca producción); orígenes de producción
con patrones; reporte para backend y ejemplos para Express, NestJS, AWS API Gateway y Cloud Run.
En el service worker, `CorsRelaxer` guarda relajaciones solo en memoria por pestaña y se conecta
al `RuleEngine` de 002 como último paso en la etapa Response: `continueResponse` con headers
relajados, o `fulfillRequest` 204 cuando el preflight del servidor fallaría. La detección sale de
`Network.loadingFailed`. Todo va por CDP: **sin permisos nuevos** (se descartan `alarms` y el
respaldo `declarativeNetRequest`, research R1/R2). Protocolo v3. En el panel: badge y filtro, sección CORS
del detalle con confirmación en línea (2 clics), indicador permanente con cuenta regresiva y
`Alt+Shift+R`, ajustes de duración y orígenes de producción, y reporte copiable.

## Technical Context

**Language/Version**: TypeScript 5.9 strict; Node.js 24; pnpm 10 (como 002).

**Primary Dependencies**: las de 002, **sin dependencias nuevas** (ver
[Dependencias](#dependencias-justificación)).

**Storage**: `chrome.storage.local` (`nahual.settings.v1` con dos campos nuevos,
[contracts/storage.md](./contracts/storage.md)). Relajaciones solo en memoria del SW.

**Testing**: Vitest (dominio ≥ 85%, protocolo, `CorsRelaxer` y `RuleEngine` con `FakeDebugger`
y temporizadores falsos); Playwright con el fixture ampliado a tres orígenes y rutas `/cors/*`;
`@axe-core/playwright`; experimentos X1–X4 y de overhead.

**Target Platform**: Chrome estable ≥ 120, Linux/macOS/Windows.

**Project Type**: Extensión MV3 en monorepo (sin cambios de estructura).

**Performance Goals**: overhead p95 < 20 ms por intercambio relajado (SC-007); cuenta regresiva
del indicador sin trabajo del SW (se calcula en el panel desde `expiresAt`).

**Constraints**: los de 001/002. ≤ 10 orígenes de API relajados por pestaña; duración ∈ {15, 60,
240, 480} min; ≤ 100 orígenes de producción; ≤ 30 `Expose-Headers`; reporte ≤ 50 endpoints.

**Scale/Scope**: una sección nueva del detalle, un indicador, un diálogo de reporte, dos ajustes;
~70 claves nuevas de i18n.

Sin `NEEDS CLARIFICATION`: resuelto en [research.md](./research.md) (R1–R17). Cuatro preguntas
de comportamiento de Chrome (X1–X4) se verifican con experimentos al inicio; el diseño no depende
de su resultado.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio | Verificación | Estado |
|---|---|---|
| I. Seguridad por defecto | **CORS acotado**: la relajación se aplica dentro de la sesión de debugger de **una** pestaña, solo a respuestas cuyo frame tiene el origen de la app y cuyo destino es el origen de la API (R4, FR-009); desactivada por defecto, creada solo por acción explícita; visible mientras existe (indicador); expira (≤ 8 h) y muere con el debugger o el SW. Nunca `*` con credenciales: lo impide `computeRelaxedHeaders` y lo verifica el validador (R7). Producción bloqueada en el SW, con falla cerrada si la lista es ilegible (R12). Sin permisos nuevos. Mensajería v3 validada; el `tabId` lo pone el SW a partir del remitente. Reporte solo con nombres (FR-035). Local-first: nada sale del navegador | ✅ |
| II. Fallar de forma segura | Error al calcular o aplicar la relajación ⇒ la respuesta continúa sin modificar y el detalle lo indica (FR-027). Vencida, suspendida o terminada ⇒ no se relaja. SW suspendido o reiniciado ⇒ la relajación termina (falla cerrada). Inyección de fallos de 002 ampliada al `CorsRelaxer` | ✅ |
| III. Usabilidad | Causa y solución en lenguaje claro (FR-004); 2 clics desde el detalle; indicador permanente con texto, icono y cuenta regresiva; atajo `Alt+Shift+R`; apagar sin confirmación (no destructivo, spec); quitar un origen de producción se deshace; estados vacío y error en sección, indicador y reporte; tema de DevTools, 320 px, `es`/`en` | ✅ |
| IV. Test-first | TDD en `packages/domain/src/cors/*` (tabla por `corsError`, combinaciones de headers incluyendo `*`, patrones de producción, reporte con valores sensibles sembrados). Integración del `CorsRelaxer` con CDP simulado. E2E que **intentan violar** el aislamiento: segunda pestaña, tercer origen, producción, expiración, cierre, detach y reinicio del SW (principio IV: "aislamiento CORS") | ✅ |
| V. Capas y dominio puro | Toda la lógica CORS en `packages/domain` sin `chrome.*`; el SW la usa a través de `DebuggerPort` y del `RuleEngine`; el panel genera el reporte con funciones del dominio y habla con el SW por protocolo v3 | ✅ |
| VI. Rendimiento | `Fetch.enable` solo suma `<origen de API>/*` en Response por relajación activa (R11); sin relajaciones ni reglas, solo `Network`. Medición de overhead (R17) | ✅ |
| VII. Cadena de suministro | Sin dependencias nuevas; los ejemplos por framework son texto generado, no paquetes | ✅ |
| VIII. Modelo de producto | Todo local y gratuito; los límites de CORS están en todos los planes | ✅ |

**Modelo de amenazas** (cambios que introduce 003):

| Amenaza | Aplica | Mitigación en 003 |
|---|---|---|
| CORS relajado expone al usuario | **Sí** | Alcance pestaña + origen de la app (por frame) + origen de la API; origen exacto, nunca `*`; `Allow-Credentials` solo con credenciales; expiración ≤ 8 h comprobada en cada request; indicador permanente; termina con detach, cierre y reinicio; sin persistencia; bloqueada en producción |
| CORS oculta un bug real | **Sí** | Reporte para backend con aviso "solo en este navegador"; el preflight llega al servidor y el detalle muestra su respuesta real y si Nahual la reemplazó; aviso "el servidor ya responde bien, puedes apagarla" |
| Fuga de credenciales | Sí | Reporte, diagnóstico y `CorsRelaxedInfo` solo con nombres de headers y `Access-Control-*`; prueba con tokens sembrados; registros redactados (002) |
| Abuso del permiso `debugger` | Sí | Sin cambios: la relajación depende de la sesión que ya exige el panel abierto |
| XSS en el panel | Sí | Diagnóstico, reporte y ejemplos se muestran como texto (`<pre>`, `<textarea>`); los valores del servidor (`failedParameter`, headers) nunca se interpretan |
| **Nueva:** permiso del navegador que sobrevive a la relajación | Sí | `Access-Control-Max-Age: 0` en el preflight local (FR-013); E2E de apagar y repetir de inmediato |
| **Nueva:** comando del panel que amplía el alcance | Bajo | El SW revalida todo (`validateRelaxation`) con sus propios ajustes; `tabId` del remitente; prueba que intenta relajar otra pestaña, producción y `null` |
| **Nueva:** lista de producción corrupta que deja pasar una relajación | Sí | Falla cerrada: con una entrada inválida no se permite relajar hasta guardar la lista (R12) |
| **Nueva:** relajación aplicada a una respuesta tardía | Sí | `expiresAt` y estado se comprueban al entregar cada respuesta, también tras pausas y retrasos de 002 (R9) |
| **Nueva:** el preflight llega al servidor (antes no, D5) | Bajo | Es el comportamiento sin Nahual; solo se reemplaza si fallaría. Documentado en research R1 |
| Página maliciosa manipula la extensión | Sí | La página no puede elegir el alcance: los orígenes salen de CDP (frame y URL), no de headers que controle; el header `Origin` solo se usa como respaldo y lo pone el navegador |
| Dependencia comprometida | No | Sin dependencias nuevas |

Resultado: **PASA**. Sin violaciones; tabla de complejidad vacía.

### Permisos (justificación)

**Ninguno nuevo** (FR-040). La entrada proponía `alarms` y, como respaldo,
`declarativeNetRequestWithHostAccess`; ambos se descartan (research R2):

| Permiso | Decisión | Motivo |
|---|---|---|
| `alarms` | No | La relajación no debe sobrevivir al SW (FR-016); `setTimeout` para terminarla y avisar + `expiresAt` comprobado en cada request garantizan que no se relaja nada vencido |
| `declarativeNetRequestWithHostAccess` | No | 001-E1: el preflight es interceptable con `Fetch`; DNR no puede decidir según la respuesta del servidor ni acotar por frame, y exigiría permisos de host |
| `declarativeNetRequest` | No | Ídem; además es más amplio |
| `tabs` | No | El cierre de la pestaña ya llega como `onDetach` (`target_closed`) |
| `clipboardWrite` | No | Copia dentro del gesto del usuario (R14) |

Ver [contracts/manifest.md](./contracts/manifest.md).

### Dependencias (justificación)

**Ninguna nueva.** Se descartan: una librería de CORS para clasificar (Chrome ya da
`corsErrorStatus`), una de plantillas para los ejemplos (son cadenas con datos validados) y una
de portapapeles (R14).

## Project Structure

### Documentation (this feature)

```text
specs/003-cors-desarrollo/
├── plan.md              # Este archivo
├── research.md          # R1–R17, experimentos X1–X4
├── data-model.md        # CorsDiagnosis, CorsRelaxedInfo, Relaxation, Settings, CorsReport
├── quickstart.md        # Validación de punta a punta
├── contracts/
│   ├── panel-protocol.md   # Protocolo v3
│   ├── storage.md          # Campos nuevos de ajustes; relajaciones nunca persistidas
│   └── manifest.md         # Sin cambios (versión 0.3.0)
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
packages/domain/src/
├── cors/
│   ├── origin.ts            # parseOrigin/normalize, ProductionOriginEntry, matchProductionOrigin (R12)
│   ├── classify.ts          # classifyCorsFailure: corsError ⇒ CorsCause (R3)
│   ├── request-headers.ts   # headers solicitados: no safelisted, sin los del navegador
│   ├── headers.ts           # computeRelaxedHeaders, preflightPasses (R7, R8)
│   ├── relaxation.ts        # schemas, validateRelaxation, applyRelaxation (R9, R10)
│   ├── link-preflight.ts    # linkPreflights (R6)
│   ├── report.ts            # buildCorsReport, renderCorsReport (R13)
│   └── snippets.ts          # express, nestjs, aws_api_gateway, cloud_run
├── schemas/                 # settings.ts (+2 campos), exchange.ts (+cors, +appOrigin), limits.ts
└── fetch-patterns.ts        # + relaxedApiOrigins (R11)
packages/domain/tests/cors/  # una prueba por módulo, escrita antes

packages/protocol/src/       # v3: relaxCors, endRelaxation, relaxations, kind "cors"

apps/extension/src/background/
├── cors-relaxer.ts          # relajaciones por pestaña, timers, estados, fin con causa (R10)
├── frame-origins.ts         # frameId ⇒ origin por pestaña (R4)
├── network-capture.ts       # + corsErrorStatus ⇒ CorsDiagnosis; preflight por initiator (R3, R6)
├── rule-engine.ts           # relajación como último paso en Response (R9)
├── action-executor.ts       # continueResponse con headers finales
├── app.ts                   # wiring: patrones, eventos relaxations, detach/navegación/pausa global
├── settings-store.ts        # campos nuevos, falla cerrada de productionOrigins
└── test-hooks.ts            # + __nahualCorsTimeScale (solo build de pruebas)
apps/extension/src/panel/
├── store/cors.ts            # relajaciones, aviso de reinicio
├── cors-commands.ts         # relaxCors / endRelaxation
├── components/
│   ├── traffic/CorsSection.tsx     # diagnóstico, qué pidió / qué respondió, confirmación en línea
│   ├── traffic/TrafficGrid.tsx     # badge
│   ├── traffic/Filters.tsx         # filtro CORS
│   ├── cors/RelaxIndicator.tsx     # banda permanente, cuenta regresiva, apagar
│   ├── cors/CorsReport.tsx         # <dialog>, framework, textarea, copiar (R14)
│   └── SettingsPanel.tsx           # duración por defecto, ProductionOrigins
├── use-shortcuts.ts         # + Alt+Shift+R
└── _locales/{es,en}         # claves nuevas
apps/extension/tests/        # cors-relaxer, rule-engine (relajación), network-capture (diagnóstico), protocolo
apps/extension/e2e/
├── fixtures/servers.ts      # tercer origen y rutas /cors/* (R16)
├── cors-diagnosis.spec.ts   # US1: cada causa, no-CORS, preflight relacionado
├── cors-relax.spec.ts       # US2: 2 clics, credenciales, preflight 401, Max-Age, producción, indicador, atajo
├── cors-isolation.spec.ts   # SC-002: segunda pestaña y tercer origen
├── cors-lifecycle.spec.ts   # SC-003: expiración, apagar, cerrar pestaña, detach, reinicio del SW
├── cors-report.spec.ts      # US3: contenido, valores sensibles, copiar, estado vacío
├── a11y.spec.ts             # + sección CORS, indicador, confirmación, ajustes, reporte
├── storage-privacy.spec.ts  # + sin relajaciones en storage
└── experiments/             # x1-cors-credentials, x2-preflight-network, x4-network-headers, e4-overhead-cors
```

**Structure Decision**: la de 002 sin paquetes nuevos. La lógica CORS va a
`packages/domain/src/cors/` (principio V); el SW suma `CorsRelaxer` y `frame-origins`, ambos con
fakes.

## Diseño clave

- **Flujo de una respuesta en el alcance** (R9): `Fetch.requestPaused` (Response) ⇒
  `RuleEngine` elige la regla de 002 ⇒ resuelve la acción ⇒ antes de entregar, pide a
  `CorsRelaxer.decide(tabId, ctx)`: `none` | `headers` (respuesta real) | `preflight204`
  (preflight que fallaría). `ctx` lleva frame, URL, método, headers del request y de la respuesta,
  status y los `Access-Control-*` que fijó el dev. El resultado se emite como `ExchangeUpdate`
  `kind: "cors"` con `CorsRelaxedInfo`.
- **Detección** (R3): `NetworkCapture` en `loadingFailed` con `corsErrorStatus` ⇒
  `classifyCorsFailure` ⇒ `kind: "cors"` con `CorsDiagnosis`. Si la pestaña tiene una relajación
  del mismo origen de API y el error es `InvalidAllowCredentials`, el `CorsRelaxer` aprende
  credenciales (R5) y emite `notice cors_credentials_learned`.
- **Patrones**: `applyPatterns` de 002 recibe también los orígenes relajados activos; se recalcula
  al crear, terminar, suspender o reanudar una relajación.
- **Fin de una relajación**: un solo método `end(tabId, id | "all", cause)` llamado desde el
  temporizador, `endRelaxation`, `onSessionEnded` (detach y cierre), el cambio de
  `productionOrigins` y la comprobación por request. Emite `relaxations`, `notice` y recalcula
  patrones.
- **Única fuente de verdad**: relajaciones en el SW; el panel recibe `relaxations` y calcula la
  cuenta regresiva desde `expiresAt`. El reporte se genera en el panel con el historial.

## Complexity Tracking

Sin violaciones de la constitución que justificar.
