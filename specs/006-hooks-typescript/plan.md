# Implementation Plan: Hooks en TypeScript

**Branch**: `006-hooks-typescript` | **Date**: 2026-10-25 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/006-hooks-typescript/spec.md`, con la indicación
de `/speckit-plan`: "la interfaz tiene que coincidir con DevTools".

## Summary

Acción de regla **Modificar con hook**. El SW elige la cadena de reglas con hook
(`selectChain`, R8), carga los bodies y envía al panel un único `hookRun` (protocolo v5, R14).
El panel (`HookHost`) enmascara los valores sensibles según los permisos de cada regla (R5) y
ejecuta la cadena en una página **`sandbox.pages`** embebida, que transpila con **Sucrase** (R3)
y corre cada hook en **su propio Worker** sin red, cortado a los 2 s con `terminate()` (R2).
Valida y combina cada resultado (R6), gestiona `state` con reintentos (R7) y la suspensión tras
5 errores (R9), y devuelve un único `hookResult`. El SW lo vuelve a validar y lo aplica con el
ejecutor de 002; la relajación CORS de 003 actúa después (R15). La lógica pura vive en un paquete
nuevo, **`packages/hook-runtime`**, con TDD. El editor es **CodeMirror 6** con el servicio de
lenguaje de TypeScript en un Worker del panel, cargado solo al abrir un hook (R4). Toda la
interfaz copia a su equivalente de DevTools: editor de Sources, Console en el cajón, contador de
errores y pestañas de Network (R13, [contracts/panel-ui.md](./contracts/panel-ui.md)). Tres
experimentos al inicio (X1–X3).

## Technical Context

**Language/Version**: TypeScript 5.9 strict; Node.js 24; pnpm 10 (como 005).

**Primary Dependencies**: las de 005 más **Sucrase 3.35.1** (sandbox), **TypeScript 5.9.3** como
dependencia de ejecución (Worker de tipos, hoy solo de desarrollo) y **CodeMirror 6**
(`@codemirror/state` 6.7.6, `view` 6.43.15, `commands` 6.11.1, `language` 6.13.1,
`autocomplete` 6.20.4, `lint` 6.9.7, `lang-javascript` 6.2.5). Justificación en
[Dependencias](#dependencias-justificación). Versiones exactas sujetas a X3.

**Storage**: sin claves nuevas. Las reglas con hook viven en `nahual.rules.v1` con su código
(≤ 100 KB por hook, ≤ 5 MB en total). `state`, consola, ejecuciones y suspensiones solo en
memoria del panel ([contracts/storage.md](./contracts/storage.md)).

**Testing**:
- Vitest con TDD en `packages/hook-runtime`: contexto, enmascarado y su combinación, validación
  del resultado, permiso de destino, plegado de la cadena, `state` con versiones, archivo `.ts`
  de ida y vuelta, plantillas.
- Vitest con TDD en `packages/domain`: `selectChain`, acción `hook`, límites.
- Integración del SW con el CDP simulado: `hookRun`/`hookResult`, timeouts y cierre del puerto,
  aplicación de `edit`/`respond`, orden con la relajación CORS, efectos en Tráfico.
- Integración del panel: `HookHost` con un sandbox simulado (cadena, reintentos, suspensión,
  consola).
- Playwright:
  - E2E por historia.
  - Suite de escape (`hooks-escape.spec.ts`).
  - Bucle infinito.
  - Privacidad del almacenamiento.
  - axe del editor, la consola y la pestaña Hooks en claro y oscuro a 320 px.
  - Recorridos solo con teclado.
  - Capturas de regresión visual.
  - `@perf` del overhead.
  - Experimentos X1–X3.

**Target Platform**: Chrome estable ≥ 120, Linux/macOS/Windows.

**Project Type**: Extensión MV3 en monorepo; **un paquete nuevo** (`packages/hook-runtime`).

**Performance Goals**:
- Hook trivial < 10 ms p95 de overhead (SC-002).
- Diagnósticos y autocompletado < 1 s en un hook de 200 líneas (SC-005).
- Apertura del panel sin cambios (≤ 10 %) y carga inicial sin el editor (SC-007).
- Sucrase < 50 ms por hook típico (pendiente de D2).
- Sin reglas con hook, el camino del tráfico no cambia.

**Constraints**:
- Los de 001–005.
- 2 s por hook; `state` ≤ 1 MB; 1,000 entradas de consola.
- `eval` solo en el sandbox.
- Sin permisos nuevos.
- 320 px, WCAG 2.2 AA, `es`/`en`.
- Interfaz igual a DevTools (indicación del usuario).

**Scale/Scope**:
- Un paquete nuevo con ~8 módulos puros.
- Cambios de dominio: acción, `selectChain`, límites y resultados.
- ~3 módulos del SW, una página sandbox con su runtime de Worker y el `HookHost` del panel.
- ~10 componentes, ~120 claves de i18n y ~7 specs E2E nuevas.

Sin `NEEDS CLARIFICATION`: todo está resuelto en [research.md](./research.md) (R1–R17). X1–X3
verifican supuestos de Chrome y del tamaño del editor al inicio, y cada uno tiene respaldo.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio | Verificación | Estado |
|---|---|---|
| I. Seguridad por defecto | **Ejecución:** el código del dev corre solo en `sandbox.pages` (CSP con `connect-src 'none'`, sin `allow-same-origin`) y, dentro, en un Worker por hook: sin red, sin `chrome.*`, sin DOM y sin poder navegar (R2). **Canal:** `MessageChannel` iniciado con `targetOrigin` explícito (nunca `"*"`) y verificación de `event.source`/`origin`; Zod en panel, sandbox y SW; el Worker valida la forma de lo que recibe con comprobaciones propias, sin Zod, porque su canal es privado al sandbox y su runtime es una función serializada (desvío justificado, contracts/sandbox-messaging.md). **Interpretación de `sandbox.pages`:** el Worker nace de la página sandbox y hereda su CSP; es una ejecución más estricta que la página sola, no una salida de ella. **Valores sensibles:** se enmascaran **antes** de entrar al sandbox salvo permiso por regla (R5); cambiar el destino exige otro permiso, comprobado en el panel y otra vez en el SW (R6). **Importación:** desactivada, sin permisos y con vista previa (FR-037). **`eval`:** solo en el bundle del sandbox (`tests/dist`). **Redacción en logs:** los registros de la consola redactan por defecto valores sensibles por nombre (headers, JSON, query), con "Mostrar valores sensibles" solo en memoria (FR-030, R11). **Almacenamiento:** consola y `state` solo en memoria. **Pruebas:** la suite de escape intenta cada vector (R17) | ✅ |
| II. Fallar de forma segura | Excepción, resultado inválido, conflicto, acceso denegado o 2 s ⇒ ese hook no aporta y el intercambio sigue con lo anterior (FR-020). Los 2 s son visibles en la ayuda del editor y en el error de tiempo agotado. El sandbox se precalienta y su arranque no cuenta en los 2 s del hook (R2). El SW tiene su propio límite (`2 s × hooks + 3 s`) y continúa sin cambios si el panel no responde o se cierra (R1). `terminate()` corta bucles sin tocar otros hooks (R2). Suspensión tras 5 errores para no retrasar la página (R9) | ✅ |
| III. Usabilidad | "Vaciar estado" y "Limpiar consola" se deshacen durante 10 s; importar siempre crea una regla nueva (nunca reemplaza código). Editor con autocompletado, tipos y errores en su línea; plantillas; consola con causa, línea y request; estados vacío, cargando el editor y error; contador visible; teclado completo (Esc + Tab para salir del editor); temas de DevTools; 320 px; `es`/`en`; **interfaz copiada de DevTools** (R13) | ✅ |
| IV. Test-first | TDD en `hook-runtime` y en el dominio nuevo; integración del SW y del `HookHost` antes de la UI; pruebas que intentan violar las garantías: escape, mensajes falsos, valores sensibles, cambio de destino, almacenamiento | ✅ |
| V. Capas y dominio puro | Contexto, enmascarado, validación, cadena, `state` y archivo en `packages/hook-runtime` sin `chrome.*`; `selectChain` en el dominio; CDP detrás del ejecutor de 002; el panel habla con el SW por el protocolo v5 y con el sandbox por su contrato | ✅ |
| VI. Rendimiento | Hook trivial < 10 ms p95 medido como E4 (R16); sin reglas con hook no se crea el sandbox ni se carga Sucrase; editor y TypeScript fuera de la carga inicial (R4) | ✅ |
| VII. Cadena de suministro | Dependencias nuevas justificadas abajo, versiones exactas, licencias MIT/Apache-2.0 (permitidas por `check-licenses.mjs`); sin `@typescript/vfs` (host propio) | ✅ |
| VIII. Modelo de producto | Todo local y gratuito; las bibliotecas de equipo quedan para features de pago (007+) | ✅ |

**Modelo de amenazas** (cambios que introduce 006):

| Amenaza | Aplica | Mitigación en 006 |
|---|---|---|
| Hook o configuración importados con código malicioso | **Sí (principal)** | Sandbox + Worker sin red ni `chrome.*`; importado desactivado, sin permisos y con vista previa del código y la configuración; límite de 100 KB; activar exige compilar sin errores |
| **Nueva:** filtrar credenciales cambiando el destino del request | **Sí** | Permiso por regla, desmarcado al importar, comprobado en panel y SW; Tráfico muestra origen y destino (clarificación Q2) |
| **Nueva:** filtrar credenciales copiándolas a la respuesta (p. ej. una cookie `HttpOnly` al body) | **Sí** | Sin permiso de lectura, los valores sensibles no entran en el sandbox (R5, SC-011) |
| **Nueva:** escape del sandbox (red, navegación, `parent`) | **Sí** | CSP de sandbox estricta; Worker sin `location` navegable ni `parent`; iframe que navega ⇒ destruido; suite de escape (SC-001) |
| **Nueva:** un hook envenena a otro (globales compartidos) | **Sí** | Un Worker por hook (R2) |
| **Nueva:** mensaje falsificado hacia el panel | **Sí** | Canal privado `MessagePort`; `hello` aceptado una vez con `source` y `origin` comprobados; `runId`/`execId` conocidos; Zod |
| Pérdida de control de la página | **Sí** | 2 s por hook, límite del SW, suspensión, continuar sin cambios |
| XSS en el panel | Sí | Registros, errores y código importado como texto; CodeMirror no interpreta HTML |
| Fuga de credenciales en logs | Sí | Consola solo en memoria; valores sensibles enmascarados salvo permiso; nada se exporta |
| Dependencia comprometida | **Sí** | 9 paquetes nuevos (más transitivos de Lezer) con versión exacta, lockfile, auditoría y licencias; Sucrase solo en el sandbox y TypeScript solo en un Worker sin red |
| Página maliciosa manipula la extensión | No cambia | La página no habla con el panel ni con el sandbox |

Resultado: **PASA**. Sin permisos nuevos; `unsafe-eval` solo en la CSP de `sandbox`, que es lo
que prevé la constitución. Tabla de complejidad: un paquete nuevo (ver abajo).

### Permisos (justificación)

**Ningún permiso nuevo.** El manifest suma `sandbox.pages` y la CSP de `sandbox`
([contracts/manifest.md](./contracts/manifest.md)), que no son permisos ni muestran avisos al
instalar. `'unsafe-eval'` se limita a la CSP de `sandbox`, requisito para evaluar el JavaScript
transpilado del hook (constitución: "eval solo en el sandbox").

### Dependencias (justificación)

| Paquete | Versión | Licencia | Dónde se carga | Por qué | Alternativas rechazadas |
|---|---|---|---|---|---|
| `sucrase` | 3.35.1 | MIT | Solo el bundle del sandbox, al haber hooks activos | Quitar tipos de TypeScript conservando las líneas, sin `eval` ni WASM (D2 de 001) | esbuild-wasm (~3,8 MB, `wasm-unsafe-eval`); `transpileModule` de TypeScript en el sandbox (todo el compilador) |
| `typescript` | 5.9.3 (ya en el monorepo como dev) | Apache-2.0 | Solo el Worker de tipos del panel, al abrir un hook | Autocompletado y errores de tipo antes de guardar (FR-015, FR-016) | Sin tipos (incumple US1-3); servicio remoto (sin red propia) |
| `@codemirror/state`, `view`, `commands`, `language`, `autocomplete`, `lint`, `lang-javascript` | ver Technical Context | MIT | Chunk del editor, al abrir un hook | Editor accesible y modular, tematizable con los tokens de DevTools, ~150 KB frente a varios MB de Monaco (R4, X3) | Monaco (pesado, tema y CSS propios); textarea (sin autocompletado) |

**Zod 4.6.5 ⇒ 4.6.6** (parche de una dependencia existente, en todos los paquetes): `pnpm audit`
marcó GHSA-mrhx-c7xc-m3w5 (agotar memoria al validar colecciones enormes con límites), ya
presente en `main`. Con 006 Zod valida la salida de código no confiable del sandbox, así que el
parche es obligatorio. Sin cambios de API.

Transitivos: `@lezer/common`, `@lezer/highlight`, `@lezer/lr`, `@lezer/javascript`, `style-mod`,
`w3c-keyname`, `crelt` (MIT). Los de Sucrase para su CLI (`commander`, `tinyglobby`, `mz`,
`pirates`) se instalan pero no entran en el bundle del sandbox (se importa solo `transform`);
`tests/dist` lo comprueba por tamaño. `@typescript/vfs` se evita con un host en memoria propio.

## Project Structure

### Documentation (this feature)

```text
specs/006-hooks-typescript/
├── plan.md              # Este archivo
├── research.md          # R1–R17, experimentos X1–X3
├── data-model.md        # Acción hook, HookContextData, HookOutcome/Effect, cadena, state, consola
├── quickstart.md        # Validación de punta a punta
├── contracts/
│   ├── hook-api.md          # HookContext (lo que ve el dev) y plantillas
│   ├── panel-protocol.md    # v5: hookRun, hookResult, importHook, resultados nuevos
│   ├── sandbox-messaging.md # panel ↔ sandbox ↔ Worker
│   ├── hook-file.md         # formato .ts con configuración
│   ├── panel-ui.md          # interfaz copiada de DevTools
│   ├── manifest.md          # sandbox.pages, CSP de sandbox, 0.6.0
│   └── storage.md           # sin claves nuevas; lo que vive en memoria
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
packages/hook-runtime/                # NUEVO, puro (TDD)
├── src/
│   ├── hook-context.d.ts             # API pública (contracts/hook-api.md); se descarga como nahual-hooks.d.ts
│   ├── context.ts                    # buildHookContext(view, stage) (FR-003, FR-005, FR-006)
│   ├── mask.ts                       # maskSensitive / mergeMasked (FR-004, R5)
│   ├── validate.ts                   # validateHookResult + destino (FR-010, FR-011, R6)
│   ├── chain.ts                      # foldChain (FR-010, FR-012, R8)
│   ├── state.ts                      # HookStateStore con versiones y límite (FR-008, FR-009, R7)
│   ├── suspension.ts                 # cuenta de errores seguidos (FR-022, R9)
│   ├── console.ts                    # anillo de 1,000 y agrupado (FR-027)
│   ├── hook-file.ts                  # serialize/parseHookFile (contracts/hook-file.md)
│   ├── templates.ts                  # addHeader, changeJsonField, emptyList (FR-017)
│   ├── hash.ts                       # hashSource (FNV-1a)
│   └── schemas.ts                    # HookContextData, HookOutcome, HookEffect, mensajes del sandbox
└── tests/                            # una prueba por módulo, escritas antes

packages/domain/src/
├── schemas/action.ts                 # + acción hook
├── schemas/exchange.ts               # + resultados hooked, hook_* ; RuleEffect.durationMs/destination
├── schemas/limits.ts                 # + límites de data-model.md
└── evaluate.ts                       # + selectChain (R8)

packages/protocol/src/                # v5 (R14): hookRun, hookResult, importHook

apps/extension/
├── manifest.config.ts                # + sandbox.pages, CSP de sandbox, 0.6.0
├── src/sandbox/                      # NUEVO
│   ├── hook-sandbox.html             # sin UI
│   ├── sandbox.ts                    # canal, caché de Sucrase, Workers por hook, cortes (R2, R3)
│   └── worker-runtime.ts             # runtime fijo del Worker: utilidades, new Function, log, errores
├── src/background/
│   ├── hook-runner.ts                # NUEVO: hookRun/hookResult, timeouts, validación, aplicar
│   ├── rule-engine.ts                # usa selectChain; deriva las cadenas a hook-runner
│   ├── rule-store.ts                 # límites de hooks, activación con check, importHook
│   └── app.ts                        # cableado y comandos v5
├── src/panel/
│   ├── hooks/
│   │   ├── hook-host.ts              # recibe hookRun, enmascara, ejecuta la cadena, state, suspensión
│   │   ├── sandbox-client.ts         # iframe, hello, MessagePort, ejecuciones y timeouts
│   │   ├── hook-types.worker.ts      # servicio de lenguaje de TypeScript (R4)
│   │   └── types-client.ts           # diagnósticos, completado y hover hacia el editor
│   ├── store/hooks.ts                # ejecuciones por intercambio, consola, errores sin leer, suspensiones
│   ├── components/hooks/
│   │   ├── HookEditor.tsx            # slot ancho: barra, CodeMirror, problemas, permisos (lazy)
│   │   ├── codemirror-setup.ts       # extensiones, tema de Sources, teclado
│   │   ├── ImportHookDialog.tsx      # vista previa (contracts/panel-ui.md)
│   │   ├── HookConsole.tsx           # DRAWER_SLOT, como Console
│   │   ├── HookErrorCounter.tsx      # STATUS_ITEMS, como el contador de DevTools
│   │   └── HooksTab.tsx              # pestaña hooks del detalle
│   ├── components/rules/ActionEditor.tsx  # + "Modificar con hook"
│   ├── components/traffic/detail-tabs.ts  # + hooks
│   ├── theme.css                     # tokens de sintaxis y de consola de DevTools
│   └── _locales/{es,en}
├── tests/integration/
│   ├── hook-runner.test.ts           # SW con CDP simulado
│   └── hook-host.test.ts             # panel con sandbox simulado
├── tests/dist/                       # manifest 0.6.0, CSP, new Function solo en sandbox, tamaños
└── e2e/
    ├── hooks-write.spec.ts           # US1
    ├── hooks-failsafe.spec.ts        # US2, suspensión
    ├── hooks-share.spec.ts           # US3
    ├── hooks-escape.spec.ts          # SC-001
    ├── hooks-perf.spec.ts            # @perf SC-002
    ├── a11y.spec.ts, storage-privacy.spec.ts, visual/  # ampliadas
    └── experiments/x1-sandbox.spec.ts, x2-hook-latency.spec.ts, x3-editor.spec.ts
```

**Structure Decision**: un paquete nuevo, `packages/hook-runtime`, como pide la entrada. Separa
la API pública de los hooks (su `.d.ts` es un contrato con el dev) y la lógica que comparten
el panel y, en parte, el SW, sin mezclarla con las reglas de `packages/domain`. El sandbox es un
punto de entrada nuevo de la extensión. El panel sigue el patrón de 004/005: slots, store y
componentes.

## Diseño clave

- **Orden de trabajo**:
  1. Experimentos X1–X3.
  2. `hook-runtime` y dominio con TDD.
  3. Protocolo v5.
  4. SW (`hook-runner`, `selectChain`, almacén).
  5. Sandbox y `HookHost` con la suite de escape.
  6. Panel US1: acción, editor, plantillas, pestaña Hooks.
  7. US2: consola, contador, suspensión.
  8. US3: importar, exportar y tipos.
  9. a11y, capturas visuales, `@perf` y privacidad.
- **Un intercambio con hooks, de punta a punta**:
  1. `Fetch.requestPaused` ⇒ `selectChain` ⇒ cadena.
  2. El SW carga los bodies y envía `hookRun`.
  3. `HookHost`, por cada hook no suspendido: enmascara según sus permisos y pide `run` al
     sandbox, que transpila si no tiene el código en caché y ejecuta en el Worker del hook.
  4. Cada `outcome` se valida y se combina con `mergeMasked`. Si cambió `state`, se guarda o se
     reintenta. Se registra la ejecución y sus `log()`.
  5. Plegado ⇒ `hookResult`.
  6. El SW valida y aplica con el ejecutor de 002, que pasa por la relajación CORS.
  7. Tráfico marca el intercambio; la pestaña Hooks lee las ejecuciones del store del panel.
- **Editor**:
  - Al elegir la acción, `import()` del chunk del editor y del Worker de tipos.
  - Cada cambio va al Worker con 300 ms de espera ⇒ diagnósticos, completado y `check`.
  - Guardar envía `setRule` con `check`, y el SW verifica el hash.
- **Interfaz**: ninguna vista se da por terminada sin comparar su captura con la de DevTools en
  el mismo tema (Sources, Console, contador de errores, Network); es parte de la definición de
  terminado de cada historia en este plan.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| Paquete nuevo `packages/hook-runtime` | La API de hooks es un contrato público (su `.d.ts` se descarga y se versiona en repos de terceros) y su lógica se usa en panel, sandbox y SW | Meterla en `packages/domain` mezcla un contrato externo con las reglas internas y haría que el sandbox cargara todo el dominio |
