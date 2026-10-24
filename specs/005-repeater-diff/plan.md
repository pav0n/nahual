# Implementation Plan: Repeater y diff de respuestas

**Branch**: `005-repeater-diff` | **Date**: 2026-10-24 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-repeater-diff/spec.md`

## Summary

Sección **Repeater** en el panel (punto de extensión `SECTIONS` de 004) con pestañas en memoria,
editor de request, historial y vista de diff; acción "Enviar al repeater" en `REQUEST_ACTIONS`.
El SW envía en dos modos: **contexto de página** con una plantilla fija ejecutada por
`Runtime.callFunctionOn` en un mundo aislado del marco principal, con el request solo como
argumento (R1), reconocido en la captura por su `initiator` (R2) para tomar la respuesta con los
límites de 002 (R3) y pasar por reglas y CORS; y **contexto limpio** con `fetch` del SW sin
credenciales y un permiso de host opcional pedido por origen (R5). El diff (JSON estructural con
arrays por identidad, por líneas con Myers, status y headers), los ignorados y la redacción son
funciones puras nuevas de `packages/domain` con TDD, sin dependencias (R7–R11), que el panel
ejecuta en un Web Worker (R12). Protocolo v4 (R15). Tres experimentos al inicio (X1–X3).

## Technical Context

**Language/Version**: TypeScript 5.9 strict; Node.js 24; pnpm 10 (como 004).

**Primary Dependencies**: las de 004 (React 19, Zustand + Immer, `@tanstack/react-virtual`,
Zod 4), **sin dependencias nuevas** (diff propio, R7/R8; ver
[Dependencias](#dependencias-justificación)).

**Storage**: `chrome.storage.local` suma `nahual.repeater.ignores.v1` (solo rutas y nombres,
claves hash). El repeater no persiste nada más ([contracts/storage.md](./contracts/storage.md)).

**Testing**: Vitest con TDD en el dominio (diff JSON, líneas, respuestas, ignorados, redacción,
request desde un intercambio, validación, headers prohibidos); integración del SW con el CDP
simulado (plantilla fija, envíos, correlación, cancelación, pérdida de contexto, permiso);
Playwright: E2E de reenvío en ambos modos, prueba de inyección, diff, privacidad del
almacenamiento, axe en claro y oscuro, capturas visuales nuevas, medición `@perf`; experimentos
X1–X3.

**Target Platform**: Chrome estable ≥ 120, Linux/macOS/Windows.

**Project Type**: Extensión MV3 en monorepo (sin paquetes nuevos).

**Performance Goals**: diff de JSON de 1 MB < 1 s sin tareas largas > 50 ms en el panel
(SC-003); del request capturado a reenviado < 10 s (SC-001); sin regresión en el camino del
tráfico (> 1 ms p95, R18).

**Constraints**: los de 001–004; body ≤ 5 MB; 20 pestañas y 50 envíos por pestaña; 320 px;
WCAG 2.2 AA; `es`/`en`; nada del repeater en disco salvo los ignorados.

**Scale/Scope**: ~8 funciones de dominio con sus schemas, ~4 módulos del SW, ~12 componentes del
panel, un worker, ~80 claves de i18n, 6 specs E2E nuevas.

Sin `NEEDS CLARIFICATION`: resuelto en [research.md](./research.md) (R1–R18). X1–X3 verifican
supuestos de Chrome al inicio; cada uno tiene respaldo.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio | Verificación | Estado |
|---|---|---|
| I. Seguridad por defecto | Plantilla fija en `Runtime.callFunctionOn` con datos solo como argumentos y en un mundo aislado (R1); prueba de inyección por URL, headers y body (SC-004). Contexto limpio con `credentials: "omit"` (SC-005). Permiso de host **opcional**, por origen exacto y en un clic del dev, revocable (R5, justificado abajo). Redacción de headers, campos JSON y query en el diff, en el dominio (R11). Nada del repeater en disco salvo ignorados sin valores ni URLs (R10, SC-005a). Mensajes nuevos validados por Zod en el receptor (v4) y también los del worker del diff en
ambos sentidos, aceptando solo los de la instancia creada (R12). El permiso de host se pide por
origen en la acción del dev que lo necesita (enviar en contexto limpio); se interpreta como el
"solicitarse por dominio" del principio I, que la constitución redacta para reglas. Contenido siempre como texto. `verify:dist` acota el único `fetch` (R14) | ✅ |
| II. Fallar de forma segura | Todo envío termina: respuesta, error con causa, cancelado o `timeout` a 5 min (R4); pérdida de contexto ⇒ `context_lost`. Un envío del repeater pausado por una regla respeta el timeout de 002. Los envíos en contexto de
página van de uno en uno por pestaña (R2). Ignorados ilegibles ⇒ lista vacía. El worker del diff con timeout de 10 s ⇒ resultado truncado con explicación. Un fallo del repeater no toca el tráfico de la app | ✅ |
| III. Usabilidad | Modo visible siempre; estados vacío, en curso, error (con solución) y "Sin diferencias"; deshacer al cerrar pestaña (10 s); `Ctrl/Cmd+Enter`, `J`/`K` en el inventario de atajos (R17); `+`/`−`/`~` además del color; teclado completo, 320 px, temas de DevTools, `es`/`en` | ✅ |
| IV. Test-first | TDD en todo el dominio nuevo; integración del SW antes del panel; pruebas que intentan violar las garantías: inyección, cookies en contexto limpio, valores sensibles en el diff, datos en almacenamiento, `fetch` no autorizado en el build | ✅ |
| V. Capas y dominio puro | Diff, ignorados, redacción, validación y headers prohibidos en `packages/domain` sin `chrome.*`; CDP y `fetch` detrás de `background/repeater/*`; el panel habla con el SW solo por el protocolo v4 | ✅ |
| VI. Rendimiento | Diff fuera del hilo principal y fuera del SW (R12); reconocer el `initiator` es una comparación de texto en `requestWillBeSent`, medida contra E4 (R18); `Fetch` sigue habilitado solo por reglas y relajaciones | ✅ |
| VII. Cadena de suministro | Sin dependencias nuevas (diff propio frente a microdiff/jsondiffpatch/jsdiff, R7/R8) | ✅ |
| VIII. Modelo de producto | Todo local y gratuito; la redacción no se cobra; nada de nube | ✅ |

**Modelo de amenazas** (cambios que introduce 005):

| Amenaza | Aplica | Mitigación en 005 |
|---|---|---|
| Inyección en el repeater | **Sí** | `PAGE_SEND`/`PAGE_ABORT` son constantes con hash fijo en las pruebas; el request va en `arguments`; ningún dato en `functionDeclaration` ni en `expression`; E2E con cargas de inyección (contracts/panel-protocol.md) |
| Página maliciosa manipula la extensión | **Sí** | Mundo aislado: la página no puede reemplazar `fetch`/`Headers` que usa la plantilla ni leer el request (X1). La plantilla no devuelve nada de la página salvo status y nombre del error |
| Fuga de credenciales | **Sí** | Repeater en memoria (FR-020a); ignorados sin valores y con claves hash; redacción por defecto en el diff (headers, JSON, query) y revelado solo en memoria por diff; headers sensibles enmascarados en el editor (002) |
| Abuso del permiso de host | **Nueva** | Opcional, sin concesión al instalar, por origen exacto, solo tras un clic del dev en "Enviar" en contexto limpio, listado y revocable en Ajustes; usado solo por `clean-send.ts` (`verify:dist`) |
| Contexto limpio hereda sesión | **Nueva** | `credentials: "omit"`, `cache: "no-store"`; prueba con el eco del servidor (SC-005) |
| XSS en el panel | Sí | Respuestas, diff y valores como texto; el worker recibe y devuelve datos validados, nunca HTML |
| Abuso del permiso `debugger` | Bajo | El contexto de página solo con el panel abierto y adjunto (FR-012); sin cambios en cuándo se adjunta |
| Dependencia comprometida | No | Sin dependencias nuevas |

Resultado: **PASA**. El permiso opcional se justifica abajo y no viola el principio I (es su
patrón previsto: opcional y por dominio). Tabla de complejidad vacía.

### Permisos (justificación)

**`optional_host_permissions: ["http://*/*", "https://*/*"]`** (nuevo, opcional). Motivo: el
contexto limpio (FR-011) envía desde el SW, fuera de la pestaña; sin permiso de host, el
navegador aplica CORS a la extensión y la mayoría de las APIs no dejan leer su respuesta
(clarificación 3). Alcance: ningún host concedido al instalar; el panel pide un **origen exacto**
en el clic de "Enviar" (FR-011a), el dev puede negarlo (el envío falla con causa y propone el
contexto de página) y revocarlo en Ajustes. Uso: solo `background/repeater/clean-send.ts`.
Alternativas rechazadas: sin permiso (contexto limpio inútil con APIs sin CORS abierto);
`host_permissions` fijos (advertencia al instalar y acceso permanente a todo); enviar el
contexto limpio desde la pestaña sin cookies (sale con el origen de la app y su CORS, no es
"limpio"). La entrada de `/speckit-plan` pedía "ningún permiso nuevo"; prevalece la
clarificación posterior. Ver [contracts/manifest.md](./contracts/manifest.md).

`Page.createIsolatedWorld` y `Runtime.callFunctionOn` usan el permiso `debugger` existente.

### Dependencias (justificación)

**Ninguna nueva.** Rechazadas: microdiff (no empareja arrays por identidad, 001 D4 lo dejó
pendiente), jsondiffpatch (17 KB y `diff-match-patch`), `diff`/jsdiff (diff por líneas en ~120
líneas propias con Myers), librerías de pestañas o de editor de código (el editor de body de 002
basta). Ver R7 y R8.

## Project Structure

### Documentation (this feature)

```text
specs/005-repeater-diff/
├── plan.md              # Este archivo
├── research.md          # R1–R18, experimentos X1–X3
├── data-model.md        # RepeaterRequest/Send/Tab, ComparableResponse, DiffResult, IgnoreList
├── quickstart.md        # Validación de punta a punta
├── contracts/
│   ├── panel-protocol.md  # v4: repeaterSend/Cancel/Result, ignores, marca repeater
│   ├── manifest.md        # optional_host_permissions, versión 0.5.0
│   └── storage.md         # nahual.repeater.ignores.v1; lo que no se guarda
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
packages/domain/src/
├── schemas/repeater.ts      # RepeaterRequest, RepeaterBody, RepeaterSend, RepeaterResponse, IgnoreList
├── schemas/diff.ts          # ComparableResponse, DiffResult, JsonChange, PathSegment
├── schemas/limits.ts        # + límites de data-model
├── repeater/
│   ├── from-exchange.ts     # repeaterRequestFromExchange (FR-002, FR-002a)
│   ├── validate.ts          # validateRepeaterRequest (FR-007)
│   ├── forbidden-headers.ts # forbiddenHeaders (FR-008, R6)
│   └── endpoint.ts          # endpointKeyInput (R10)
├── diff/
│   ├── json.ts              # diffJson con arrays por identidad (R7)
│   ├── lines.ts             # diffLines, Myers (R8)
│   ├── responses.ts         # diffResponses (R9)
│   ├── ignores.ts           # applyIgnores (R10)
│   ├── redact.ts            # redactDiff (R11)
│   └── path.ts              # formatPath
└── sensitive.ts             # + isSensitiveName (headers + password)
packages/domain/tests/
├── diff-json.test.ts, diff-lines.test.ts, diff-responses.test.ts   # suite de SC-002, escrita antes
├── diff-ignores.test.ts, diff-redact.test.ts                       # SC-006 en el dominio
└── repeater-from-exchange.test.ts, repeater-validate.test.ts, forbidden-headers.test.ts

packages/protocol/src/           # v4 (R15): comandos y eventos nuevos, ExchangeFields.repeater

apps/extension/
├── manifest.config.ts           # + optional_host_permissions; versión 0.5.0
├── src/background/
│   ├── repeater/
│   │   ├── page-template.ts     # PAGE_SEND y PAGE_ABORT como constantes (R1, R4)
│   │   ├── page-send.ts         # mundo aislado, callFunctionOn, espera del intercambio marcado (R1–R4)
│   │   ├── clean-send.ts        # único fetch del SW, credentials omit, corte a 5 MB (R5)
│   │   ├── repeater-service.ts  # valida, elige modo, pendientes por sendId, cancelación, timeouts
│   │   └── ignores-store.ts     # nahual.repeater.ignores.v1 con hash y límites (R10)
│   ├── network-capture.ts       # + marca repeater por initiator (R2) y aviso al envío pendiente
│   └── app.ts                   # cablea el servicio y los comandos v4
├── src/panel/
│   ├── shell/sections.ts        # + repeater (contador de pestañas)
│   ├── actions/request-actions.ts # + sendToRepeater
│   ├── shortcuts.ts             # + repeaterSend (Ctrl/Meta+Enter), nextChange (J), prevChange (K)
│   ├── store/repeater.ts        # pestañas, envíos, diffs abiertos, recentlyClosed (R13)
│   ├── repeater/
│   │   ├── diff.worker.ts       # diffResponses + applyIgnores + redactDiff fuera del hilo (R12)
│   │   └── diff-client.ts       # cola, cancelación y timeout del worker
│   ├── components/repeater/
│   │   ├── RepeaterView.tsx     # pestañas + SplitPane(editor | respuesta/historial)
│   │   ├── RepeaterTabs.tsx     # renombrar, duplicar, cerrar con deshacer
│   │   ├── RequestEditor.tsx    # método, URL, HeadersEditor (002) con activar/desactivar, body o "original"
│   │   ├── ModeSwitch.tsx       # contexto de página / limpio, con motivo si está deshabilitado
│   │   ├── SendResult.tsx       # respuesta, reglas que actuaron, preflight/CORS, headers no enviados
│   │   ├── SendHistory.tsx      # lista de envíos; elegir dos para comparar
│   │   ├── PastedResponse.tsx   # respuesta pegada
│   │   └── DiffView.tsx         # resumen, cambios con +/−/~, J/K, ignorar, mostrar sensibles
│   ├── settings/GeneralSettings.tsx # + orígenes con acceso concedido (FR-011a)
│   └── _locales/{es,en}
├── tests/integration/
│   ├── repeater-page-send.test.ts   # plantilla fija, argumentos, correlación, contexto perdido
│   ├── repeater-clean-send.test.ts  # credentials omit, permiso, corte a 5 MB
│   └── ignores-store.test.ts
├── tests/unit/                      # store del repeater, aplicabilidad de sendToRepeater, atajos
├── tests/dist/                      # manifest 0.5.0, fetch único marcado, hash de PAGE_SEND
└── e2e/
    ├── repeater-send.spec.ts        # US1 en ambos modos, historial, pestañas, navegación, reglas
    ├── repeater-injection.spec.ts   # SC-004
    ├── repeater-diff.spec.ts        # US2: original, envíos, pegado, ignorados, ids, texto, redacción
    ├── repeater-perf.spec.ts        # @perf: SC-003
    ├── a11y.spec.ts, storage-privacy.spec.ts   # ampliadas
    ├── visual/panel.visual.spec.ts  # + repeater y diff
    └── experiments/x1-isolated-send.spec.ts, x2-clean-send.spec.ts, x3-worker.spec.ts
```

**Structure Decision**: la de 004 sin paquetes nuevos. El repeater del SW vive en
`background/repeater/` detrás de un servicio con interfaz (principio V); el panel sigue el
patrón de 004 (sección + store + componentes) y el diff corre en un worker del panel con la
lógica del dominio.

## Diseño clave

- **Orden de trabajo**: (1) experimentos X1–X3; (2) dominio con TDD (diff, redacción, ignorados,
  repeater); (3) protocolo v4; (4) SW: contexto de página, contexto limpio, ignorados, marca en
  la captura; (5) panel US1 (sección, editor, envío, historial, pestañas); (6) panel US2 (worker,
  diff, ignorados, pegado, sensibles); (7) a11y, visual, `@perf`, privacidad.
- **Un envío, de punta a punta (contexto de página)**: el panel genera `sendId`, guarda el envío
  `pending` y manda `repeaterSend`; el SW valida, asegura el mundo aislado, llama a `PAGE_SEND`
  con el request como argumento; la captura ve `requestWillBeSent` con el `initiator` marcado,
  etiqueta el intercambio y avisa al servicio; al completarse, el servicio arma `repeaterResult`
  con la respuesta de la captura (`getBody`), los efectos de reglas, preflight y CORS.
- **Contexto limpio**: el SW comprueba `chrome.permissions.contains` para el origen; si falta,
  responde `permission_required`; el panel llama a `chrome.permissions.request` en el mismo
  gesto (o reintenta tras el clic en el aviso si el gesto ya se consumió, X2) y reenvía.
- **Diff**: el panel arma dos `ComparableResponse` (pide los bodies que falten con `getBody`) y
  los ignorados del endpoint (`getIgnores`), y manda todo al worker, que devuelve el
  `DiffResult` ya filtrado y redactado más los valores reales de lo sensible por separado; el
  panel los muestra solo tras "Mostrar valores sensibles".
- **Disponibilidad del contexto de página**: derivada del estado de sesión del store (adjunto y
  sitio actual igual al del envío); el SW lo vuelve a comprobar.

## Complexity Tracking

Sin violaciones de la constitución que justificar.
