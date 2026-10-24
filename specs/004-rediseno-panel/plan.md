# Implementation Plan: Rediseño del panel e integración visual con DevTools

**Branch**: `004-rediseno-panel` | **Date**: 2026-10-23 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-rediseno-panel/spec.md`

## Summary

Rediseño del panel de Nahual sobre lo construido en 002 y 003, sin cambiar el service worker, el
protocolo v3, el almacenamiento de `chrome.storage.local` ni el manifest. El panel pasa a un
`AppShell` de filas fijas (barra superior con secciones y estado, franja de indicadores y avisos,
área principal con `SplitPane`, cajón opcional) con los colores, la tipografía y las medidas de
DevTools medidos en Chrome estable (research R1, experimento D1) y tema en vivo con
`setThemeChangeHandler` (R2). Ajustes se vuelve un diálogo con guardado por campo (R8); los
pausados se marcan y editan en Tráfico (R10); las acciones de un request salen de un catálogo
único que alimenta la cabecera del detalle y el menú contextual (R5, R6), con una función pura
nueva del dominio para crear una regla a partir de un request (R7, TDD). Los lugares para 005–007
son listas declarativas ([contracts/panel-shell.md](./contracts/panel-shell.md)) verificadas con
un gancho solo de pruebas (R13). Las E2E de 002 y 003 se migran primero por sus helpers (R16) y
se añaden capturas de regresión visual (R14). Sin permisos ni dependencias nuevas.

## Technical Context

**Language/Version**: TypeScript 5.9 strict; Node.js 24; pnpm 10 (como 003).

**Primary Dependencies**: las de 003 (React 19, Zustand + Immer, `@tanstack/react-virtual`, Zod
4), **sin dependencias nuevas** (ver [Dependencias](#dependencias-justificación)).

**Storage**: `chrome.storage.local` sin cambios. Nuevo: `localStorage` del panel con la clave
`nahual.ui.v1` solo para preferencias de interfaz ([contracts/storage.md](./contracts/storage.md)).

**Testing**: Vitest (dominio `ruleDraftFromExchange` con TDD; panel: catálogo de acciones,
unicidad de atajos, `UiPrefs`, y la lógica pura de teclado y posición de `SplitPane` y `Menu`,
sin entorno DOM nuevo); Playwright con las E2E de 002
y 003 migradas, E2E nuevas de estructura, y un proyecto `e2e:visual` con `toHaveScreenshot`;
`@axe-core/playwright` en claro y oscuro; experimentos D1 (tokens de DevTools) y D2 (Escape en
paneles de extensión).

**Target Platform**: Chrome estable ≥ 120, Linux/macOS/Windows.

**Project Type**: Extensión MV3 en monorepo (sin cambios de estructura de paquetes).

**Performance Goals**: filtrar 2,000 entradas < 300 ms con el detalle abierto (SC-007);
desplazamiento fluido con la lista virtualizada; sin trabajo nuevo en el SW ni en el camino del
tráfico.

**Constraints**: los de 001–003; 320 px de ancho mínimo; umbral de dos columnas 600 px (R4);
WCAG 2.2 AA en ambos temas; `es`/`en`; ningún elemento visible de funciones que no existen
(FR-002).

**Scale/Scope**: reorganización de ~30 componentes del panel, ~10 componentes nuevos de
estructura, una función de dominio, ~60 claves de i18n nuevas o movidas, migración de 16 specs
E2E.

Sin `NEEDS CLARIFICATION`: resuelto en [research.md](./research.md) (R1–R17). Dos preguntas
sobre DevTools (D1, D2) se verifican al inicio; el diseño tiene respaldo para cualquier resultado.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio | Verificación | Estado |
|---|---|---|
| I. Seguridad por defecto | Sin permisos nuevos; protocolo v3 y validación del SW intactos. "Crear regla desde un request" solo prellena el editor: la regla se valida y guarda por el camino de 002 (FR-023). "Permitir CORS" desde el menú usa la misma confirmación y las mismas protecciones de 003 (producción, lista ilegible) (FR-024). `UiPrefs` no guarda datos de tráfico y se valida al leer. El estado de sesión ya no suelta con un clic accidental (clarificación 3). Ganchos de prueba ausentes en producción (`verify:dist`) | ✅ |
| II. Fallar de forma segura | Preferencias inválidas o `localStorage` inaccesible ⇒ defaults. Pausado que vence mientras se edita ⇒ continúa sin cambios (002) y el detalle lo indica. Un fallo del panel no afecta al SW ni al tráfico | ✅ |
| III. Usabilidad | Es el objetivo de la feature: tema de DevTools en vivo, 320 px, teclado completo (divisor, menús, diálogos con patrones APG), avisos con causa y solución, atajos en un solo lugar sin choques, `es`/`en`. Acción destructiva (soltar la pestaña) a un paso de menú; quitar origen de producción conserva deshacer | ✅ |
| IV. Test-first | TDD en `ruleDraftFromExchange`; pruebas puras del catálogo, atajos y `UiPrefs` antes de los componentes; E2E migradas antes de mover componentes (R16); E2E que intenta romper la estructura con los lugares reservados llenos (R13); regresión visual (R14) | ✅ |
| V. Capas y dominio puro | La única lógica de dominio nueva (regla a partir de un request) va a `packages/domain`; la aplicabilidad de acciones es pura y sin `chrome.*`; el panel sigue hablando con el SW solo por el protocolo v3 | ✅ |
| VI. Rendimiento | Sin cambios en el SW ni en `Fetch`/`Network`; lista virtualizada conservada; medición de filtrado con detalle abierto (R17) | ✅ |
| VII. Cadena de suministro | Sin dependencias nuevas; los valores de DevTools se copian como datos con su origen (BSD), no código | ✅ |
| VIII. Modelo de producto | Todo local y gratuito; los lugares reservados no anticipan funciones de pago | ✅ |

**Modelo de amenazas** (cambios que introduce 004):

| Amenaza | Aplica | Mitigación en 004 |
|---|---|---|
| Fuga de credenciales | Bajo | Sin cambios en enmascarado de 002; la columna Nombre muestra ruta y query como hoy la URL; `UiPrefs` sin datos de tráfico (prueba en `storage-privacy.spec.ts`) |
| XSS en el panel | Sí | Ruta, host y avisos se renderizan como texto; el menú contextual no interpreta datos del request; ninguna API nueva inserta HTML |
| Acción no intencionada | **Nueva** | Soltar la pestaña pasa a un menú (clarificación 3); "Crear regla" no guarda ni activa nada solo; el menú contextual solo aparece sobre filas |
| Página maliciosa manipula la extensión | No | El panel no recibe nada nuevo de la página |
| Abuso del permiso `debugger` | No | Sin cambios |
| Dependencia comprometida | No | Sin dependencias nuevas |

Resultado: **PASA**. Sin violaciones; tabla de complejidad vacía.

### Permisos (justificación)

**Ninguno nuevo.** `setThemeChangeHandler` y `themeName` son parte de `chrome.devtools.panels`,
disponible por el `devtools_page` de 001. Se descartan `contextMenus` (no funciona dentro de
DevTools, R5) y cualquier permiso para leer los estilos de DevTools (no existe API, R1). Ver
[contracts/manifest.md](./contracts/manifest.md).

### Dependencias (justificación)

**Ninguna nueva.** Se descartan: librería de paneles redimensionables (R4), de menús o
componentes accesibles (los patrones APG necesarios son pocos y ya hay `Tabs` propio), de
componentes con estilo de Chrome (R1) y de catálogo visual de componentes (R13).

## Project Structure

### Documentation (this feature)

```text
specs/004-rediseno-panel/
├── plan.md              # Este archivo
├── research.md          # R1–R17, experimentos D1–D2
├── data-model.md        # ruleDraftFromExchange, secciones, acciones, atajos, UiPrefs, estados
├── quickstart.md        # Validación de punta a punta
├── contracts/
│   ├── panel-shell.md   # Regiones, puntos de extensión para 005–007, componentes compartidos
│   ├── storage.md       # localStorage nahual.ui.v1; storage.local sin cambios
│   └── manifest.md      # Sin permisos nuevos (versión 0.4.0)
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
packages/domain/src/
└── rule-from-exchange.ts    # ruleDraftFromExchange (R7)
packages/domain/tests/
└── rule-from-exchange.test.ts   # escrita antes; resultado ⊂ RuleDraftSchema y coincide con su URL

apps/extension/src/panel/
├── App.tsx                  # monta AppShell; deja de tener la estructura en línea
├── theme.css                # tokens --nh-* claro/oscuro (R1), densidad DevTools
├── theme.ts                 # + setThemeChangeHandler (R2)
├── shortcuts.ts             # inventario único de atajos (R12)
├── use-shortcuts.ts         # lee de shortcuts.ts
├── ui-prefs.ts              # UiPrefs en localStorage, schema y debounce (R3)
├── shell/
│   ├── AppShell.tsx         # filas fijas: barra, franja, principal, cajón (R4)
│   ├── TopBar.tsx           # secciones con contador + STATUS_ITEMS + pausar, ajustes, ayuda
│   ├── sections.ts          # SECTIONS
│   ├── status-items.ts      # STATUS_ITEMS (session)
│   ├── SessionStatus.tsx    # estado + menú Soltar/Adjuntar/Reconectar (clarificación 3)
│   ├── IndicatorStrip.tsx   # pausa, CORS relajado (RelaxIndicator compacto), avisos y "N avisos" (R9)
│   └── Drawer.tsx           # cajón reservado (sin contenido en producción)
├── actions/
│   ├── request-actions.ts   # REQUEST_ACTIONS: createRule, relaxCors (R6)
│   └── batch-actions.ts     # BATCH_ACTIONS vacío (FR-028)
├── settings/
│   ├── SettingsDialog.tsx   # diálogo con navegación por secciones (FR-014)
│   ├── sections.ts          # SETTINGS_SECTIONS
│   ├── AutoSaveField.tsx    # guardado al confirmar, "Guardado", error por campo (R8)
│   └── ShortcutsList.tsx    # desde shortcuts.ts
├── components/
│   ├── common/SplitPane.tsx     # separator accesible, mínimos, persistencia (R4)
│   ├── common/Menu.tsx          # APG menu, posición ajustada (R5)
│   ├── common/Dialog.tsx        # <dialog> modal común (Ajustes, Ayuda, reporte)
│   ├── common/Toolbar.tsx, ToggleButton.tsx, IconButton.tsx, icons.tsx
│   ├── traffic/TrafficView.tsx  # filtros + SplitPane(lista | detalle)
│   ├── traffic/Filters.tsx      # una fila: búsqueda + regex, tipos, CORS, contador, limpiar (FR-009)
│   ├── traffic/TrafficGrid.tsx  # columnas nuevas, marcas, contextmenu, selección múltiple condicionada (R11)
│   ├── traffic/RowMenu.tsx      # menú contextual desde REQUEST_ACTIONS
│   ├── traffic/ExchangeDetail.tsx # cabecera con acciones + pestañas por caso (FR-018)
│   ├── traffic/detail-tabs.ts   # DETAIL_TABS y pestaña inicial
│   ├── queue/*                  # PausedEditor reutilizado en "Editar"; PauseQueue en SplitPane
│   ├── rules/*                  # RulesView en SplitPane; abre borradores de ruleDraftFromExchange
│   └── (se retiran) SettingsPanel.tsx, StatusBar.tsx, Notices.tsx — su contenido pasa a settings/ y shell/
├── test-slots.ts            # __nahualUiSlots: entradas simuladas en todas las listas (solo build de pruebas, R13)
├── store/ui.ts              # PanelSection con "paused"; sección activa; borrador de regla entrante
└── _locales/{es,en}         # claves nuevas y movidas
apps/extension/tests/unit/
├── request-actions.test.ts, shortcuts.test.ts, ui-prefs.test.ts, detail-tabs.test.ts
└── split-pane.test.ts, menu.test.ts   # lógica pura de teclado y posición (sin DOM; el DOM lo cubre la E2E)
apps/extension/e2e/
├── fixtures/panel.ts        # helpers migrados primero (R16)
├── panel-structure.spec.ts  # barra, franja, Ajustes como diálogo (0 px), avisos, sesión, columnas, divisor
├── request-actions.spec.ts  # menú contextual (ratón, tecla de menú, Shift+F10), crear regla, permitir CORS
├── paused-in-traffic.spec.ts # pausado marcado, Editar en Tráfico, vencimiento con detalle abierto
├── ui-slots.spec.ts         # lugares reservados llenos a 320/800/1280 sin desbordes (SC-009)
├── a11y.spec.ts             # todas las vistas y estados en ambos temas
├── storage-privacy.spec.ts  # + nahual.ui.v1 sin datos de tráfico
├── visual/*.spec.ts         # proyecto e2e:visual (R14)
└── experiments/d1-devtools-tokens.spec.ts
apps/extension/playwright.config.ts   # + proyecto "visual"
apps/extension/tests/dist/            # + __nahualUiSlots ausente
```

**Structure Decision**: la de 003 sin paquetes nuevos. La estructura del panel se separa en
`shell/`, `actions/` y `settings/` para que los puntos de extensión de 005–007 tengan un lugar
fijo; la única lógica de dominio nueva va a `packages/domain`.

## Diseño clave

- **Orden de trabajo para no romper la suite**: (1) helpers E2E por rol y nombre (R16) con la UI
  actual; (2) tokens y tema (R1, R2) sin mover componentes; (3) `AppShell`, barra y franja; (4)
  Ajustes como diálogo; (5) Tráfico con `SplitPane`, columnas y filtros; (6) catálogo de
  acciones y menú contextual; (7) pausados en Tráfico; (8) lugares reservados y gancho de
  pruebas; (9) regresión visual y a11y.
- **Sección activa y selección**: el store `ui` guarda la sección activa (`traffic` | `rules` |
  `paused`), el exchange seleccionado (sube desde `TrafficView` para que el menú contextual, la
  cabecera del detalle y Pausados compartan la selección) y un "borrador entrante" para Reglas
  cuando se crea una regla desde un request.
- **Pestaña inicial del detalle**: función pura `initialDetailTab(exchange, pausedItem)` (FR-018),
  con prueba unitaria.
- **Contadores**: derivados del store existente (`rules` activas, `paused.length`); no hay datos
  nuevos del SW.
- **Reporte CORS**: el diálogo de 003 pasa al `Dialog` común sin cambiar su contenido.
- **Densidad**: texto base 12 px y alto de fila de Network (D1) en todo el panel; los campos de
  formulario conservan el área de clic mínima de WCAG 2.2 (24 × 24 px).

## Revisión de implementación (T070)

Revisión del diff de 004 contra el modelo de amenazas y la definición de terminado:

| Punto | Resultado |
|---|---|
| Permisos | Sin cambios: `debugger` y `storage`, sin host permissions ni `contextMenus`; versión `0.4.0` (`tests/dist/manifest.test.ts`) |
| Dependencias | Ninguna nueva (`package.json` solo cambia la versión y los scripts `e2e`/`e2e:visual`); bundles del panel +27 KB de JS (+9 KB gzip), research "Resultados" |
| Fuga de credenciales | `nahual.ui.v1` solo guarda `version`, `split` y `drawerHeight` (`ui-prefs.ts` copia campo por campo; `storage-privacy.spec.ts` lo comprueba tras una sesión con tráfico y reglas); `chrome.storage.local` sigue con `nahual.rules.v1` y `nahual.settings.v1`. El enmascarado de headers de 002 no cambia |
| XSS en el panel | Ruta, host, avisos, menús y la cabecera del detalle se renderizan como texto; no hay `dangerouslySetInnerHTML` ni HTML de datos capturados (`traffic.spec.ts` FR-032 sigue en verde) |
| Acción no intencionada | Soltar la pestaña pasa a un menú (clarificación 3, `panel-structure.spec.ts`); "Crear regla desde este request" solo prellena el editor y, con un borrador sin guardar, pide confirmación; el menú contextual solo existe sobre filas (sobre el área vacía de la lista no hay menú); "Permitir CORS" desde el menú lleva a la misma confirmación de 003 y se oculta para preflights, diagnósticos no relajables, orígenes de producción y pares ya relajados |
| Ganchos de prueba | `__nahualUiSlots` (y su contenido simulado) no existe en el build de producción (`tests/dist/no-network.test.ts`), como los de 002 y 003 |
| Desvíos visuales | Error, aviso, borde de campos y selección sin foco (research R1 y "Decisiones tomadas al implementar"); colores no medidos en D1 (texto sobre la selección, hover, primario) quedan para la comparación de T071 |
| D1 / D2 | D1 midió los tokens, la fuente y las medidas en Chrome 156 por CDP. D2 mostró que Escape en un diálogo del panel abría el cajón de la consola de DevTools: `Dialog`, `Menu`, el detalle y la lista de avisos detienen su propagación, así que no hay efecto conocido en FR-031 (a confirmar a mano en T071) |
| Rendimiento | Filtrar 2,000 entradas: 2,7 ms con el detalle abierto y 2,5 ms con selección múltiple (SC-007); el SW y el camino del tráfico no cambian |
| Definición de terminado | Por historia: pruebas puras primero (atajos, `UiPrefs`, divisor, menú, pestañas del detalle, franja, catálogo de acciones; `ruleDraftFromExchange` en el dominio), E2E de la historia, axe sin violaciones serias en ambos temas (US1 a 320/800/1280 px; US2–US3 a 320 px), textos `es`/`en`; la suite de 002 y 003 sin cambiar lo que verifica (solo sus helpers). Capturas de referencia de Linux en `e2e/visual` (otras plataformas generan las suyas). Pendiente que necesita personas: la demo y la comparación lado a lado con Network en Chrome estable y la prueba de comprensión (T071) |

## Complexity Tracking

Sin violaciones de la constitución que justificar.
