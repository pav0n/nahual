---
description: "Lista de tareas de 004-rediseno-panel"
---

# Tasks: Rediseño del panel e integración visual con DevTools

**Input**: Design documents from `/specs/004-rediseno-panel/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/panel-shell.md,
contracts/storage.md, contracts/manifest.md, quickstart.md

**Tests**: obligatorias. La constitución (principio IV, NO NEGOCIABLE) exige TDD: la función de
dominio (`ruleDraftFromExchange`) y toda la lógica pura del panel (atajos, preferencias, catálogo
de acciones, pestaña inicial del detalle, teclado y posición de `SplitPane` y `Menu`) se prueban
primero; cada prueba se escribe, se ejecuta y **falla** antes de su implementación. Las E2E de
002 y 003 se migran **antes** de mover componentes y no cambian lo que verifican (SC-008).

**Organization**: una fase por historia, en el orden de la entrada: US1 integración visual (P1),
US2 estructura (P1), US3 acciones del request (P1), US4 lugar para lo que viene (P2). Cada
historia incluye sus E2E, su revisión axe y un checkpoint demostrable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: se puede hacer en paralelo (archivos distintos, sin dependencias pendientes)
- **[USn]**: tarea de la historia de usuario n
- Rutas relativas a la raíz del repo, según la estructura de `plan.md`
- "Prueba primero" = escribir la prueba, verla fallar y solo entonces implementar
- Rutas del panel abreviadas: `panel/` = `apps/extension/src/panel/`; `e2e/` =
  `apps/extension/e2e/`; `tests/` = `apps/extension/tests/`; locales =
  `apps/extension/public/_locales/{es,en}/messages.json`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: versión, experimentos de DevTools (D1, D2) y proyecto de regresión visual.

- [X] T001 [P] Subir la versión a `0.4.0` en `apps/extension/package.json` y comprobar que `apps/extension/tests/dist/manifest.test.ts` sigue exigiendo solo `["debugger", "storage"]`, sin host permissions ni `contextMenus` (contracts/manifest.md)
- [X] T002 [P] Escribir el experimento D1 en `apps/extension/e2e/experiments/d1-devtools-tokens.spec.ts` (research R1): abrir Chrome con DevTools desacoplado (`--auto-open-devtools-for-tabs`), localizar por CDP el destino `devtools://devtools/...`, y en tema claro y oscuro leer los valores calculados de `--color-background`, `--color-background-elevation-1`, `--color-background-elevation-2`, `--divider-line`, `--input-outline`, `--color-text-primary`, `--color-text-secondary`, `--sys-color-tonal-container`, `--sys-color-surface-variant`, `--sys-color-state-focus-ring`, la familia y tamaño de fuente del `body`, el alto de una fila de la tabla de Network y el tamaño y grosor de trazo de un icono de la barra de herramientas de Network; si Chrome no permite inspeccionar ese destino, el test se marca `skip` con el motivo
- [X] T003 Ejecutar T002 (`EXPERIMENTS=1 pnpm --filter @nahual/extension e2e e2e/experiments/d1-devtools-tokens.spec.ts`) o, si se omitió, medir a mano con DevTools sobre DevTools; reemplazar los "por medir" de la tabla de R1 y la sección "Resultados" en `specs/004-rediseno-panel/research.md`; anotar como desvío cualquier token que no llegue a 4,5:1 (texto) o 3:1 (bordes de controles)
- [X] T004 Ejecutar D2 a mano en Chrome estable con el panel actual (research R12): abrir el reporte CORS (`<dialog>`) y pulsar Escape; registrar en "Resultados" de `specs/004-rediseno-panel/research.md` si también se alterna el cajón de la consola de DevTools y si `preventDefault` + `stopPropagation` en fase de captura lo evita
- [X] T005 [P] Añadir el proyecto `visual` en `apps/extension/playwright.config.ts` (`testDir: "e2e/visual"`, excluido del proyecto por defecto, `expect.toHaveScreenshot.maxDiffPixelRatio: 0.01`, capturas por plataforma) y el script `"e2e:visual": "playwright test --project=visual"` en `apps/extension/package.json` (research R14)

**Checkpoint**: `pnpm lint && pnpm typecheck && pnpm test` en verde; D1 y D2 registrados.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: helpers E2E resistentes al rediseño, inventario de atajos, preferencias de interfaz,
store de UI y componentes compartidos. Nada de historia empieza sin esto.

**⚠️ CRITICAL**: ninguna historia empieza antes de terminar esta fase.

### Migración de las E2E (antes de mover componentes, research R16)

- [X] T006 Reescribir los helpers de `apps/extension/e2e/fixtures/panel.ts` para localizar por rol y nombre accesible con la UI **actual**: `openSection(panel, "Traffic" | "Rules" | "Paused")` (hoy pestaña "Queue", mañana sección "Paused"; acepta ambos nombres durante la migración), `sessionStatus(panel)` por rol `status`, `detach(panel)`/`attach(panel)` que funcionen con botón directo o con menú, `openSettings(panel)` que funcione con `<details>` o con diálogo "Settings", `setPauseTimeout` sobre esa función, `trafficRow` por fila del `grid` "Traffic" y `requestRow` por método en su celda (sin depender de que la fila empiece por el método), `openCorsDetail`/`relaxFrom` sin cambios de semántica; quitar los usos de `h1`, `details.settings`, `.status > [role=status]` y `summary`
- [X] T007 Actualizar todas las specs de `apps/extension/e2e/*.spec.ts` para usar solo los helpers de T006 (sin cambiar ninguna aserción de lo que verifican) y ejecutar `pnpm --filter @nahual/extension e2e`: 84/84 en verde con la UI actual

### Lógica pura (prueba primero)

- [X] T008 [P] Prueba primero `apps/extension/tests/unit/shortcuts.test.ts`: el inventario de `panel/shortcuts.ts` contiene `Alt+Shift+A`, `Alt+Shift+C`, `Alt+Shift+K`, `Alt+Shift+P`, `Alt+Shift+R`, `Alt+Shift+F`, `/`, `Alt+↑`, `Alt+↓` (research R12); no hay dos atajos con la misma combinación; ninguno es reservado de DevTools (`Ctrl/Cmd+Shift+C`, `Ctrl/Cmd+Shift+P`, `Ctrl/Cmd+P`, `Ctrl/Cmd+[`, `Ctrl/Cmd+]`, `Ctrl/Cmd+F`, `F8`, `F10`, `F11`); cada uno tiene `descriptionKey` existente en ambos locales
- [X] T009 [P] Prueba primero `apps/extension/tests/unit/ui-prefs.test.ts` (contracts/storage.md): `readUiPrefs` con JSON válido; ausente ⇒ defaults (`split.traffic 0.5`, `split.rules 0.34`, `split.paused 0.34`, `drawerHeight 180`); "número 0.2–0.8" y "entero 120–600" fuera de rango, JSON inválido o `version` ≠ 1 ⇒ default de ese campo; `localStorage` que lanza ⇒ defaults sin error; `writeUiPrefs` solo escribe los campos de `UiPrefs`
- [X] T010 [P] Prueba primero `apps/extension/tests/unit/split-pane.test.ts`: función pura `nextSplit(state, key, size)` con flechas ±16 px, `Home`/`End` a los mínimos, doble clic al default; `clampSplit(fraction, total, minA=280, minB=320)` (`fraction` es siempre la del panel izquierdo, data-model `UiPrefs`) respeta los mínimos y el umbral de 600 px devuelve `layout: "stacked"` (research R4)
- [X] T011 [P] Prueba primero `apps/extension/tests/unit/menu.test.ts`: funciones puras `nextMenuIndex(items, current, key)` (flechas con vuelta, `Home`/`End`, letra inicial, saltando deshabilitados) y `placeMenu(anchor, menuSize, viewport)` que deja el menú entero dentro del panel en las cuatro esquinas (research R5)
- [X] T012 Implementar `panel/shortcuts.ts` (inventario con `id`, `keys`, `descriptionKey`, `scope`) y hacer que `panel/use-shortcuts.ts` y los `aria-keyshortcuts` existentes lean de ahí (T008 en verde)
- [X] T013 [P] Implementar `panel/ui-prefs.ts` con schema Zod, `try/catch` en todo acceso y `debounce` de 250 ms al escribir (T009 en verde)
- [X] T014 [P] Implementar la lógica pura de `nextSplit`/`clampSplit` en `panel/components/common/split-pane-logic.ts` (T010 en verde)
- [X] T015 [P] Implementar `nextMenuIndex`/`placeMenu` en `panel/components/common/menu-logic.ts` (T011 en verde)

### Store y componentes compartidos

- [X] T016 Cambiar `panel/store/ui.ts`: `PanelTab` ⇒ `PanelSection = "traffic" | "rules" | "paused"` (`queue` pasa a `paused`), `selectedExchangeId` (sube desde `TrafficView`), `incomingRuleDraft: RuleDraft | null` con `openRuleDraft`/`consumeRuleDraft`; actualizar los usos en `panel/App.tsx`, `panel/components/traffic/TrafficView.tsx` y `panel/components/queue/*`
- [X] T017 [P] Crear `panel/components/common/icons.tsx`: iconos de línea en SVG de 16 px con trazo 1,5 px (`pause`, `settings`, `help`, `close`, `search`, `clear`, `regex`, `chevron`, `more`), `aria-hidden` siempre
- [X] T018 [P] Crear `panel/components/common/IconButton.tsx`, `ToggleButton.tsx` (`aria-pressed`) y `Toolbar.tsx` (`role="toolbar"` con navegación por flechas) en `panel/components/common/`
- [X] T019 [P] Crear `panel/components/common/Dialog.tsx`: `<dialog>` modal, título por `aria-labelledby`, foco inicial, Escape y foco de vuelta al disparador, con el manejo de Escape que haya decidido D2; migrar a él el diálogo de `panel/components/cors/CorsReport.tsx` y la confirmación de `panel/components/common/ConfirmDialog.tsx` sin cambiar su contenido
- [X] T020 [P] Crear `panel/components/common/Menu.tsx` con el patrón APG (`role="menu"`, `menuitem`, `menuitemradio`), usando `menu-logic.ts`; cierre con Escape, clic fuera o Tab, y foco de vuelta al disparador
- [X] T021 [P] Crear `panel/components/common/SplitPane.tsx`: dos paneles con `role="separator"` (`aria-orientation`, `aria-valuenow/min/max` en %), arrastre con puntero, teclado vía `split-pane-logic.ts`, `layout: "stacked"` bajo 600 px y persistencia en `ui-prefs.ts` con la clave de la vista

**Checkpoint**: unitarias en verde; E2E 84/84 con la UI actual y los helpers nuevos.

---

## Phase 3: User Story 1 - Se siente parte de DevTools (Priority: P1) 🎯 MVP

**Goal**: el panel tiene el aspecto y la densidad de DevTools, sigue su tema en vivo y muestra
lista y detalle lado a lado con filtros en una fila.

**Independent Test**: Network y Nahual lado a lado en claro y oscuro; cambiar el tema con el panel
abierto; redimensionar el divisor con ratón y teclado; quickstart 1, 4, 5 y 12.

### Pruebas primero

- [ ] T022 [P] [US1] Escribir `apps/extension/e2e/visual-integration.spec.ts`: con `page.emulateMedia({ colorScheme })` el panel cambia de tema sin recargar, conservando el request seleccionado y el texto del filtro, y también con el diálogo de Ajustes y un menú abiertos, que siguen abiertos (FR-004); el detalle abre a la derecha con un `separator`; con detalle abierto la lista no muestra las columnas Tipo, Tamaño y Tiempo y sí Nombre, Método y Estado (FR-007); flechas sobre el divisor cambian `aria-valuenow` y el valor persiste al reabrir el panel (FR-006); a 599 px el detalle queda debajo de la lista (FR-008); a 800 px los filtros ocupan 1 fila y a 320 px ≤ 2 (FR-009, SC-002); sin scroll horizontal a 320 px. Ver la prueba fallar.

### Implementación

- [ ] T023 [US1] Reescribir los tokens de `panel/theme.css` como variables `--nh-*` con los valores de R1 (medidos en T003) para `[data-theme="light"]` y `[data-theme="dark"]`, conservando los desvíos de error y aviso; tipografía `system-ui` a 12 px, contadores a 11 px, alto de fila y de barra de Network (D1); estilos de pestaña, barra, botón de icono, botón de selección, campo, menú, diálogo y foco como DevTools; eliminar `h1`, los bordes de `section` y el `gap` de 12 px de `main`
- [ ] T024 [US1] Ampliar `panel/theme.ts`: `chrome.devtools.panels.setThemeChangeHandler` para aplicar `data-theme` en vivo y, fuera de DevTools, `matchMedia("(prefers-color-scheme: dark)")` con su evento `change` (research R2)
- [ ] T025 [US1] Reescribir `panel/components/traffic/Filters.tsx` como `Toolbar` de una fila: búsqueda con `ToggleButton` de regex dentro del campo, tipos como `ToggleButton` compactos (en lugar del `fieldset` de casillas), "Bloqueados por CORS" como `ToggleButton`, campo de estado compacto, contador y `IconButton` "Limpiar" con el deshacer de 002; mantener `SEARCH_INPUT_ID`, `/` y `Alt+Shift+F`, y que una regex inválida conserve el filtro anterior (FR-009)
- [ ] T026 [US1] Cambiar `panel/components/traffic/TrafficGrid.tsx` al orden Nombre, Método, Estado, Tipo, Tamaño, Tiempo (research R11): celda Nombre con marcas "Bloqueado por CORS", "pausado" (prop `paused`; queda sin datos hasta T044) y "preflight", ruta con query en monoespaciada, host en `--nh-text-2` y `title` con la URL completa; prop `compact` que oculta Tipo, Tamaño y Tiempo; conservar la virtualización y la navegación con flechas
- [ ] T027 [US1] Reestructurar `panel/components/traffic/TrafficView.tsx` con `SplitPane` (clave `split.traffic`): lista a la izquierda, `ExchangeDetail` a la derecha, `compact` en la lista mientras haya detalle o el panel mida < 600 px; usar `selectedExchangeId` del store (T016); si el exchange seleccionado deja de existir (limpiar la lista o tope de 2,000) se limpia la selección, se cierra el detalle y el foco pasa a la lista, y deshacer la limpieza no la restaura
- [ ] T028 [P] [US1] Añadir y ajustar las claves de US1 (tipos compactos, alternador de regex, columna Nombre, divisor) en los locales `es` y `en`
- [ ] T029 [US1] Ejecutar T022 en verde y la suite E2E completa (sin regresiones de 002/003)
- [ ] T030 [US1] Ampliar `apps/extension/e2e/a11y.spec.ts`: Tráfico con detalle abierto, filtros y divisor en ambos temas a 320, 800 y 1280 px, 0 violaciones; contraste de `--nh-text-2` sobre `--nh-bg` y `--nh-bar`

**Checkpoint US1**: pruebas de US1 en verde; demo: quickstart 1, 4, 5 y 12 comparando con Network.

---

## Phase 4: User Story 2 - Estructura clara y estable (Priority: P1)

**Goal**: barra superior única, franja de indicadores y avisos, Ajustes como diálogo con guardado
por campo, pausados atendidos desde Tráfico y pestañas del detalle según el caso.

**Independent Test**: recorrer Tráfico, Reglas, Pausados, Ajustes y Ayuda con tráfico del
fixture; abrir Ajustes con un request seleccionado; pausar un request y continuarlo desde Tráfico;
quickstart 2, 3, 6, 7, 8 y 11.

### Pruebas primero

- [ ] T031 [P] [US2] Prueba primero `apps/extension/tests/unit/detail-tabs.test.ts`: `initialDetailTab(exchange, pausedItem)` devuelve `cors` con `exchange.cors?.diagnosis`, `edit` con un `PausedItem` activo, `headers` en otro caso; `detailTabsFor` lista `cors` solo para bloqueados y `edit` solo para pausados (FR-018)
- [ ] T032 [P] [US2] Prueba primero `apps/extension/tests/unit/strip.test.ts`: función pura `stripItems(state)` con orden fijo (Nahual en pausa, CORS relajado, avisos, error del último comando); con más de 2 avisos devuelve un grupo `{ kind: "group", count }`; sin nada devuelve `[]` (FR-013/013a)
- [ ] T033 [P] [US2] Escribir `apps/extension/e2e/panel-structure.spec.ts`: barra con secciones Traffic, Rules y Paused (siempre visible, también en 0) y contadores (reglas activas; pausados resaltado), sin `h1` (FR-010/011); el estado de sesión muestra texto e icono y su clic abre un menú con "Detach" sin soltar nada; `Alt+Shift+A` suelta directo (FR-012); con un request seleccionado, abrir Ajustes no cambia el `boundingBox` de la lista ni del detalle (SC-001); con Ajustes abierto, una llamada a la API y un request pausado actualizan los contadores de la barra detrás del diálogo y, al cerrarlo, el foco vuelve al botón Ajustes; con un request seleccionado, "Limpiar" cierra el detalle y deja el foco en la lista, y "Deshacer" no reabre el detalle; tiempo de pausa 200 se guarda al salir del campo y muestra "Saved", 3 muestra el rango y al cerrar el diálogo vuelve a 200 (FR-015); "Nahual en pausa" y "CORS relajado" ocupan una línea cada uno; con 3 avisos aparece "3 notices" y desplegarlo no mueve la lista; cerrar uno no cierra los demás (FR-013a); Ayuda abre la introducción y lista los atajos (FR-019). Ver la prueba fallar.
- [ ] T034 [P] [US2] Escribir `apps/extension/e2e/paused-in-traffic.spec.ts`: con la plantilla "errors" de 002, `/api/error` aparece en Tráfico con la marca "paused" y su detalle abre en "Edit" con las acciones de 002 ("Continue unchanged", "Continue with changes", mock y fallar) y el tiempo restante; "Continue unchanged" en 1 clic (SC-003); con dos pausados, la sección Paused permite atenderlos seguidos y "Continue all" / `Alt+Shift+K` sigue funcionando (FR-017); si el pausado vence con el detalle abierto, el detalle pasa a Headers con el aviso de 002. Ver la prueba fallar.

### Implementación

- [ ] T035 [US2] Crear `panel/shell/sections.ts` (`SECTIONS` con `id`, `labelKey`, `count(state)`, `countTone`) y `panel/shell/status-items.ts` (`STATUS_ITEMS` con `session`) según contracts/panel-shell.md
- [ ] T036 [US2] Crear `panel/shell/SessionStatus.tsx`: estado con icono y texto, sitio y señal de causa; clic o Enter abre `Menu` con estado, causa y solución, y Soltar/Adjuntar/Reconectar con `Alt+Shift+A` indicado; reutiliza `attach-control.ts` (FR-012, clarificación 3)
- [ ] T037 [US2] Crear `panel/shell/TopBar.tsx`: `tablist` de `SECTIONS` con contadores (ocultos en 0), `STATUS_ITEMS`, `ToggleButton` "Pausar Nahual" (`Alt+Shift+P`), `IconButton` Ajustes y Ayuda; envuelve sin scroll horizontal a 320 px (FR-010/011/025)
- [ ] T038 [US2] Implementar `stripItems` en `panel/shell/strip.ts` (T032 en verde) y `panel/shell/IndicatorStrip.tsx`: línea "Nahual en pausa" con "Reanudar", `RelaxIndicator` compacto en una línea (orígenes, cuenta regresiva, Reporte, Apagar con `Alt+Shift+R`), un aviso por línea con causa, solución y "Cerrar" (`role="status"`; errores `role="alert"`), grupo "N avisos" que abre una lista superpuesta con `Menu`; reemplaza `panel/components/Notices.tsx`
- [ ] T039 [US2] Crear `panel/shell/AppShell.tsx` con las filas fijas de contracts/panel-shell.md (barra, franja, `main` con scroll propio, cajón opcional) y reescribir `panel/App.tsx` para montarlo; retirar `panel/components/StatusBar.tsx`
- [ ] T040 [US2] Crear `panel/settings/AutoSaveField.tsx` (estados `saved` ⇒ `dirty` ⇒ `saving` ⇒ `saved | invalid`; confirma en `blur` o Enter, `change` en interruptores y listas; "Guardado" en `aria-live="polite"`; validación con los límites de `@nahual/domain` y los `issues` del SW; al desmontar con `invalid` descarta y conserva el valor guardado) (research R8)
- [ ] T041 [US2] Crear `panel/settings/sections.ts` (`SETTINGS_SECTIONS`: `general`, `pause`, `cors`, `shortcuts`), `panel/settings/ShortcutsList.tsx` (desde `shortcuts.ts`) y `panel/settings/SettingsDialog.tsx` sobre `Dialog` con navegación por secciones: General (adjuntar al abrir), Pausas (tiempo máximo con `AutoSaveField`), CORS de desarrollo (duración por defecto y orígenes de producción de 003 con su deshacer, movidos desde `panel/components/cors/CorsSettings.tsx`), Atajos; retirar `panel/components/SettingsPanel.tsx` (FR-014/015)
- [ ] T042 [US2] Mover la Ayuda de `panel/components/Onboarding.tsx` a `Dialog` y hacer que liste los atajos desde `shortcuts.ts` (FR-019)
- [ ] T043 [US2] Implementar `initialDetailTab`/`detailTabsFor` en `panel/components/traffic/detail-tabs.ts` (T031 en verde) y usarlos en `panel/components/traffic/ExchangeDetail.tsx`: pestañas CORS, Editar (monta `panel/components/queue/PausedEditor.tsx` con el `PausedItem` del exchange), Headers, Request y Response; si el pausado vence o se resuelve con el detalle abierto, pasa a Headers (research R10)
- [ ] T044 [US2] Relacionar `exchangeId ⇒ PausedItem` en `panel/store/queue.ts` y marcar las filas pausadas en `TrafficGrid.tsx` (T026); la sección Pausados (`panel/components/queue/QueueView.tsx`) pasa a `SplitPane` (clave `split.paused`) con lista y editor, comparte la selección con Tráfico y conserva "Continuar todos" (FR-016/017)
- [ ] T045 [P] [US2] Añadir y mover las claves de US2 (secciones, menú de sesión, franja, "N avisos", Ajustes por secciones, "Guardado", pestaña Editar, Paused) en los locales `es` y `en`; quitar las que ya no se usan
- [ ] T046 [US2] Ejecutar T033 y T034 en verde y la suite E2E completa (sin regresiones de 002/003)
- [ ] T047 [US2] Ampliar `apps/extension/e2e/a11y.spec.ts`: barra, menú de sesión abierto, franja con pausa, CORS relajado y "N avisos" desplegado, diálogo de Ajustes en cada sección, Ayuda, Pausados y detalle de un pausado en Tráfico, en ambos temas a 320 px; foco atrapado en los diálogos y devuelto al cerrar; a 320 px, Ajustes (cada sección) y Ayuda sin scroll horizontal (`scrollWidth <= clientWidth`, SC-002)

**Checkpoint US2**: pruebas de US2 en verde; demo: quickstart 2, 3, 6, 7, 8 y 11.

---

## Phase 5: User Story 3 - Acciones sobre un request en un solo lugar (Priority: P1)

**Goal**: un catálogo único de acciones alimenta la cabecera del detalle y el menú contextual de
la lista; hoy "Crear regla desde este request" y "Permitir CORS para desarrollo".

**Independent Test**: sobre un request normal, uno bloqueado por CORS, un preflight y uno pausado,
abrir las acciones desde el detalle, con clic derecho, con la tecla de menú y con `Shift+F10`;
crear una regla y comprobar el borrador; quickstart 9 y 10.

### Pruebas primero

- [ ] T048 [P] [US3] Prueba primero `packages/domain/tests/rule-from-exchange.test.ts` (data-model, research R7): `ruleDraftFromExchange` devuelve `name` "`<MÉTODO> <ruta>`" recortado a `LIMITS.ruleNameMax`; `prefilter` `{ kind: "glob", pattern: "<origen><ruta>*" }` sin la query, con `*`, `?` y `\` de la URL escapados con `\`, "longitud ≤ `LIMITS.globMax` (si no cabe, se recorta la ruta y se termina en `*`)"; `methods` `[exchange.method]` (preflight ⇒ `OPTIONS`); `resourceTypes` `[tipo]` si está en `RESOURCE_TYPES`, si no `[]`; `stage` `"request"`; `conditions` `[]`; `action` `{ kind: "pause" }`; para una tabla de URLs (con query, con `*` y `?` en la ruta, muy larga, con puerto, IPv6) el resultado pasa `RuleDraftSchema` y `matchesGlob(prefilter, url)` es verdadero
- [ ] T049 [P] [US3] Prueba primero `apps/extension/tests/unit/request-actions.test.ts`: `REQUEST_ACTIONS` en orden `createRule`, `relaxCors`; `createRule.appliesTo` siempre verdadero (también preflight y pausado); `relaxCors.appliesTo` solo con `exchange.cors?.diagnosis` y sin relajación activa que cubra `appOrigin ⇒ apiOrigin`, y nunca para un preflight; ids únicos; cada `shortcut` existe en `SHORTCUTS`; cada `labelKey` existe en ambos locales
- [ ] T050 [P] [US3] Escribir `apps/extension/e2e/request-actions.spec.ts`: la cabecera del detalle y el menú contextual muestran las mismas acciones para un request normal, uno bloqueado por CORS y un preflight (FR-020/022); el menú se abre con clic derecho, con `Shift+F10` y con la tecla de menú sobre la fila enfocada, selecciona la fila, se recorre con flechas, se cierra con Escape devolviendo el foco a la fila y queda dentro del panel abierto cerca de las esquinas (FR-021); clic derecho en el área vacía de la lista no abre el menú; "Create rule from this request" abre Reglas con el borrador prellenado (patrón, método, etapa) y no se guarda hasta "Save rule" (FR-023); "Allow CORS for development" desde el menú lleva a la confirmación de 003 y "Allow" completa en 2 clics (FR-024, SC-003). Ver la prueba fallar.

### Implementación

- [ ] T051 [US3] Implementar `packages/domain/src/rule-from-exchange.ts` y exportarlo desde `packages/domain/src/index.ts` (T048 en verde)
- [ ] T052 [US3] Implementar `panel/actions/request-actions.ts` con `RequestAction` (`id`, `labelKey`, `shortcut?`, `appliesTo(exchange, ctx)` puro, `run(exchange, ctx)`): `createRule` llama a `openRuleDraft(ruleDraftFromExchange(exchange))` y cambia a la sección Reglas; `relaxCors` selecciona el exchange y abre la confirmación en línea de `panel/components/traffic/RelaxForm.tsx` (T049 en verde)
- [ ] T053 [US3] Añadir la cabecera de acciones a `panel/components/traffic/ExchangeDetail.tsx` (`Toolbar` con `REQUEST_ACTIONS.filter(appliesTo)`) y crear `panel/components/traffic/RowMenu.tsx` (`Menu` desde el mismo catálogo); en `TrafficGrid.tsx`, `onContextMenu` en cada fila (selecciona la fila, `preventDefault` y abre `RowMenu` en el punto o bajo la fila con teclado) y `preventDefault` sin menú en el área vacía de la lista
- [ ] T054 [US3] Hacer que `panel/components/rules/RulesView.tsx` consuma `incomingRuleDraft` (`consumeRuleDraft`) al montarse o al llegar uno nuevo: abre `RuleEditor.tsx` con el borrador y el foco en el nombre, sin guardar; si había otro borrador sin guardar, pedir confirmación antes de reemplazarlo
- [ ] T055 [P] [US3] Añadir las claves de US3 (acciones, menú de acciones, cabecera del detalle) en los locales `es` y `en`
- [ ] T056 [US3] Ejecutar T050 en verde y la suite E2E completa
- [ ] T057 [US3] Ampliar `apps/extension/e2e/a11y.spec.ts`: menú contextual abierto y cabecera de acciones en ambos temas a 320 px

**Checkpoint US3**: pruebas de US3 en verde; demo: quickstart 9 y 10.

---

## Phase 6: User Story 4 - Lugar para lo que viene (Priority: P2)

**Goal**: los puntos de extensión de contracts/panel-shell.md existen, aguantan contenido
simulado de 005–007 a 320, 800 y 1280 px y no muestran nada en producción.

**Independent Test**: activar `__nahualUiSlots` en el build de pruebas y recorrer el panel a los
tres anchos; en el build de producción comprobar que no aparece nada de 005–007.

### Pruebas primero

- [ ] T058 [P] [US4] Escribir `apps/extension/e2e/ui-slots.spec.ts`: con `__nahualUiSlots` activo (una sección "Slot", dos indicadores de estado, cajón inferior con contenido, editor de reglas de 900 px de ancho, una acción por lote, una sección de Ajustes), a 320, 800 y 1280 px: ningún elemento con `scrollWidth > clientWidth` en barra, franja ni área principal, ningún elemento tapado (comprobación por `elementFromPoint` en el centro de cada control), todo alcanzable con Tab (SC-009); el cajón se pliega y despliega y su alto se recuerda (FR-026); la lista de reglas se angosta con el divisor (FR-027); marcar 2 filas muestra "2 selected" y la acción por lote, con 1 no (FR-028); sin el gancho, ninguno de esos elementos existe. Ver la prueba fallar.

### Implementación

- [ ] T059 [US4] Crear `panel/actions/batch-actions.ts` (`BATCH_ACTIONS` vacío con `minSelected ≥ 2`) y la selección múltiple en `TrafficGrid.tsx` solo si `BATCH_ACTIONS.length > 0`: casillas, `Ctrl/Cmd+clic`, `Shift+clic`, indicador "N seleccionados" y barra de acciones por lote (FR-028)
- [ ] T060 [US4] Crear `panel/shell/Drawer.tsx` (región con nombre, plegable, alto en `ui-prefs.drawerHeight` "entero 120–600", comparte el alto con el área principal) y su lugar en `AppShell.tsx`; sin contenido no se monta (FR-026)
- [ ] T061 [US4] Pasar `panel/components/rules/RulesView.tsx` a `SplitPane` (clave `split.rules`) con la lista a la izquierda y `RuleEditor` ocupando el ancho restante (FR-027)
- [ ] T062 [US4] Crear `panel/test-slots.ts` (`__nahualUiSlots`, solo con `import.meta.env.MODE === "test"`, como los ganchos de 002/003) que añade entradas simuladas a `SECTIONS`, `STATUS_ITEMS`, `BATCH_ACTIONS`, `SETTINGS_SECTIONS`, el cajón y el ancho del editor de reglas (research R13)
- [ ] T063 [P] [US4] Ampliar `apps/extension/tests/dist/no-network.test.ts` para fallar si `__nahualUiSlots` aparece en el build de producción
- [ ] T064 [US4] Ejecutar T058 en verde y la suite E2E completa

**Checkpoint US4**: pruebas de US4 en verde; demo: lugares reservados a 320, 800 y 1280 px en el
build de pruebas y ausentes en producción.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T065 [P] Escribir las capturas de regresión visual en `apps/extension/e2e/visual/panel.visual.spec.ts` (research R14): Tráfico con detalle, CORS relajado, pausado en Tráfico, Reglas, Pausados, Ajustes (cada sección), menú contextual y menú de sesión, en claro y oscuro a 320, 800 y 1280 px; generar las referencias con `pnpm --filter @nahual/extension e2e:visual --update-snapshots` y revisarlas a mano antes de guardarlas
- [ ] T066 [P] Ampliar `apps/extension/e2e/storage-privacy.spec.ts`: tras una sesión completa, `chrome.storage.local` sigue con solo `nahual.rules.v1` y `nahual.settings.v1`, y `localStorage` del panel solo tiene `nahual.ui.v1` con los campos de `UiPrefs` y ningún dato de tráfico (contracts/storage.md)
- [ ] T067 [P] Medir el filtrado de 2,000 entradas con el detalle abierto y, con `__nahualUiSlots` activo (T058), con 2 o más filas seleccionadas (reutilizando la medición de 002; FR-033) y registrar el resultado en `specs/004-rediseno-panel/research.md` (SC-007: < 300 ms); registrar también el tamaño de los bundles del panel antes y después de 004
- [ ] T068 Ejecutar la E2E completa 10 veces seguidas (`pnpm e2e`) registrando cualquier prueba fallida, y anotar el resultado en `specs/004-rediseno-panel/research.md`
- [ ] T069 [P] Actualizar `README.md`: nueva estructura del panel (secciones, franja, Ajustes, menú contextual, crear regla desde un request), atajos desde el inventario y el comando `e2e:visual`
- [ ] T070 Añadir la sección "Revisión de implementación" en `specs/004-rediseno-panel/plan.md`: diff contra el modelo de amenazas (filas de 004), permisos (sin cambios), dependencias (ninguna), desvíos visuales documentados (R1), resultado de D1/D2 (si Escape en un diálogo o menú de Nahual alterna también el cajón de DevTools y no se puede evitar, anotarlo como efecto conocido de FR-031) y definición de terminado por historia
- [ ] T071 **Checkpoint final**: demo de punta a punta con los pasos 1–14 de `specs/004-rediseno-panel/quickstart.md` en Chrome estable, comparando lado a lado con el panel Network en claro y oscuro contra la tabla de valores medidos y desvíos de R1 en `research.md` (SC-006); prueba de comprensión con al menos 1 dev que usa DevTools a diario y tiempos registrados en `research.md` (SC-005); `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm verify:dist && pnpm e2e && pnpm --filter @nahual/extension e2e:visual` en verde; `research.md` sin "por medir" ni "por registrar"; recordar la deuda de 001 (E5/T066, T067 y la definición de "en conflicto")

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sin dependencias. T003 depende de T002. D1 (T003) bloquea T023.
- **Foundational (Phase 2)**: depende de Setup salvo T003/T004; bloquea todas las historias.
  T007 depende de T006; T012–T015 de sus pruebas (T008–T011); T019–T021 de T015/T014/T013.
- **US1 (Phase 3)**: depende de Foundational y de T003. MVP.
- **US2 (Phase 4)**: depende de Foundational. T043–T044 tocan `ExchangeDetail.tsx` y
  `TrafficGrid.tsx`, que US1 cambia (T026–T027): hacer US1 antes o coordinar esos archivos.
  La marca "pausado" de T026 no recibe datos hasta T044; la prueba de US1 no la verifica.
- **US3 (Phase 5)**: depende de Foundational; T053 toca `ExchangeDetail.tsx` y `TrafficGrid.tsx`
  (después de T026 y T043). El dominio (T048, T051) y el catálogo (T049, T052) pueden avanzar en
  paralelo con US1/US2.
- **US4 (Phase 6)**: depende de US2 (`AppShell`, `TopBar`, Ajustes) y de T026 (lista).
- **Polish (Phase 7)**: depende de las historias que se entreguen; T065 al final del aspecto.

### Within Each Story

- Pruebas puras ⇒ lógica ⇒ componentes ⇒ locales ⇒ E2E en verde ⇒ a11y ⇒ checkpoint.
- Cada historia termina con la suite E2E completa en verde (SC-008).

### Parallel Opportunities

- Setup: T001, T002 y T005.
- Foundational: T008–T011 juntas; T013–T015 juntas; T017–T021 juntas (tras sus lógicas).
- US1: T022 y T028 junto a T023–T024.
- US2: T031–T034 juntas; T045 junto a la implementación.
- US3: T048–T050 juntas; T051 y T052 en paralelo; T055.
- US4: T058 y T063.
- Polish: T065–T067 y T069.

---

## Parallel Example: User Story 3

```bash
# Pruebas primero, juntas:
Task: "rule-from-exchange.test.ts en packages/domain/tests/"
Task: "request-actions.test.ts en apps/extension/tests/unit/"
Task: "request-actions.spec.ts en apps/extension/e2e/"

# Implementación pura, en paralelo:
Task: "ruleDraftFromExchange en packages/domain/src/rule-from-exchange.ts"
Task: "REQUEST_ACTIONS en apps/extension/src/panel/actions/request-actions.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Setup (D1 medido) y Foundational (helpers E2E migrados con la suite en verde).
2. US1: tokens, tema en vivo, filtros en una fila, columnas nuevas y `SplitPane`.
3. **Parar y validar**: comparar lado a lado con Network (quickstart 1, 4, 5, 12).

### Incremental Delivery

1. US1 ⇒ el panel ya se ve como DevTools.
2. US2 ⇒ barra, franja, Ajustes como diálogo, pausados en Tráfico (resuelve la queja de Ajustes
   y de las pestañas).
3. US3 ⇒ acciones del request y menú contextual.
4. US4 ⇒ lugares para 005–007 verificados.
5. Polish ⇒ regresión visual, privacidad, rendimiento, estabilidad y demo final.

Cada paso deja la suite E2E de 002 y 003 en verde.
