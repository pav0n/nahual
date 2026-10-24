# Research: Rediseño del panel e integración visual con DevTools

Decisiones de la Fase 0 para [plan.md](./plan.md). Ninguna toca el service worker ni el protocolo:
el rediseño vive en `apps/extension/src/panel` y en una función pura nueva del dominio (R7).

Dos preguntas de comportamiento de DevTools se verifican con experimentos al inicio (D1, D2); el
diseño tiene respaldo para cualquier resultado.

---

## R1 — Fuente de los valores visuales de DevTools

- **Decision**: los colores salen de los tokens del frontend de DevTools
  (`front_end/application_tokens.css` y `design_system_tokens.css` del repositorio
  `ChromeDevTools/devtools-frontend`, licencia BSD), **resueltos y medidos en Chrome estable** con
  el experimento D1. Se copian valores, no código. Se replican como variables CSS propias en
  `theme.css` con el prefijo `--nh-`, en dos bloques (claro y oscuro).
- **Valores medidos** (D1, Chrome 156, 2026-10-23):

  | Token propio | Uso | Claro | Oscuro | Origen |
  |---|---|---|---|---|
  | `--nh-bg` | Fondo del panel | `#ffffff` | `#202124` | `--color-background` |
  | `--nh-bar` | Barras, cabeceras, encabezado de tabla | `#f1f3f4` | `#292a2d` | `--color-background-elevation-1` |
  | `--nh-bar-2` | Hover de barra, pestaña activa del detalle | `#dee1e6` | `#35363a` | `--color-background-elevation-2` |
  | `--nh-divider` | Separadores de filas y paneles | `rgb(0 0 0 / 10%)` | `rgb(255 255 255 / 10%)` | `--divider-line` |
  | `--nh-input-border` | Bordes de campos y botones | `#cacdd1` (medido) ⇒ **`#80868b`** | `#cacdd1` (medido) ⇒ **`#80868b`** | `--input-outline` (desvío: ver abajo) |
  | `--nh-text` | Texto | `#202124` | `#e8eaed` | `--color-text-primary` |
  | `--nh-text-2` | Texto secundario (host, contadores) | `#5f6368` | `#9aa0a6` | `--color-text-secondary` |
  | `--nh-selected` | Fila seleccionada con foco | `#d3e3fd` | `#004a77` | `--sys-color-tonal-container` |
  | `--nh-selected-inactive` | Fila seleccionada sin foco | `#e1e3e1` | `#444746` | `--sys-color-surface-variant` |
  | `--nh-focus` | Anillo de foco | `#0b57d0` | `#a8c7fa` | `--sys-color-state-focus-ring` |

- **Tipografía y medidas** (D1): la familia de DevTools (`"Google Sans Text", "Google Sans",
  system-ui, sans-serif`), 12 px de texto base, 11 px en contadores, fila de la lista de 21 px y
  barra de 26 px como Network, iconos en una caja de 20 px como los de la barra de Network (el
  plan decía 16 px; D1 midió 20 px y se sigue la medida), dibujados como línea de 1,5 px.
- **Desvíos deliberados** (permitidos por SC-006 si se documentan): error y aviso **no** usan los
  tokens de DevTools (`--color-error-text` es `#f00` sobre blanco, contraste 4,0:1, falla WCAG AA
  para texto). Se conservan los de 002/003 (`#b3261e` / `#f28b82`; `#8a4b00` / `#fdd663`), que
  pasan 4,5:1. Igual con cualquier token medido en D1 que no llegue a 4,5:1 en texto o 3:1 en
  bordes de controles: se oscurece lo mínimo y se anota aquí.
  - **`--input-outline`** mide `#cacdd1` en ambos temas: 1,5:1 sobre blanco, falla 3:1 (WCAG
    1.4.11) para el borde de un campo. Se usa `#80868b` (3,7:1 sobre `#ffffff`, 4,5:1 sobre
    `#202124`). Los separadores (`--divider-line`) no delimitan controles y se copian tal cual.
- **Rationale**: el panel es un iframe de extensión y no hereda las variables de DevTools (no hay
  API para leerlas); copiar los valores es la única forma de igualar el aspecto (FR-003). Usar
  los nombres de los tokens de origen hace trazable cada valor cuando DevTools cambie.
- **Alternatives considered**: (a) inyectar la hoja de estilos de DevTools: no es accesible desde
  la extensión y acoplaría Nahual a su estructura interna; (b) una librería de componentes con
  estilo "Chrome": dependencia nueva y no es DevTools; (c) medir solo a ojo: no reproducible.

### Experimento D1 — Medir DevTools en Chrome estable

`EXPERIMENTS=1 pnpm --filter @nahual/extension e2e e2e/experiments/d1-devtools-tokens.spec.ts`:
abre Chrome con DevTools desacoplado y, a través del destino `devtools://` que expone CDP, lee
los valores calculados de los tokens de la tabla, la fuente y el alto de fila del panel Network
en ambos temas. Si Chrome no permite inspeccionar ese destino desde Playwright, el respaldo es
manual: DevTools sobre DevTools (`Ctrl+Shift+I` en la ventana desacoplada) y copiar los valores
calculados. Los resultados se copian a la tabla.

---

## R2 — Tema en vivo

- **Decision**: `chrome.devtools.panels.themeName` al cargar y
  `chrome.devtools.panels.setThemeChangeHandler` (Chrome 99+, el mínimo de Nahual es 120) para los
  cambios con el panel abierto. El tema se aplica como `data-theme` en `<html>`: solo cambian las
  variables CSS, sin volver a montar React, así que no se pierde la selección ni lo escrito
  (FR-004). Fuera de DevTools (build de pruebas) se sigue usando `prefers-color-scheme` con su
  evento `change`.
- **Rationale**: es la API oficial; hoy `theme.ts` solo lee el tema al cargar.
- **Alternatives considered**: sondear `themeName` (no se actualiza en vivo); ajuste propio de
  tema (lo prohíbe la constitución, principio III).

---

## R3 — Preferencias de interfaz

- **Decision**: `localStorage` del panel, clave `nahual.ui.v1`, con el reparto del divisor de
  cada vista y el alto del cajón. Se valida con un schema al leer: un valor inválido o ausente
  vuelve al valor por defecto (FR-034). Ver [contracts/storage.md](./contracts/storage.md).
- **Rationale**: son preferencias del panel, sin datos de tráfico ni efecto en el SW. La lectura
  síncrona evita que el panel "salte" al abrir. El SW no participa, así que no cambia el
  protocolo ni el contrato de `chrome.storage.local` (donde "solo el SW escribe").
- **Alternatives considered**: `chrome.storage.local` vía SW (comando nuevo en el protocolo y una
  lectura asíncrona que mueve el layout al abrir); `storage.session` (se pierde al cerrar el
  navegador; la spec pide recordarlo entre aperturas).

---

## R4 — Estructura del layout y anchos

- **Decision**: `AppShell` con cuatro filas fijas (barra superior, franja de indicadores, área
  principal, cajón opcional) en CSS grid de alto completo; solo el área principal y el cajón
  hacen scroll. El área principal usa un `SplitPane`:
  - Lista ≥ 280 px y detalle ≥ 320 px ⇒ **umbral de dos columnas: 600 px** (FR-008). Por debajo,
    detalle debajo de la lista con el mismo divisor en vertical.
  - Reparto por defecto: detalle al 50% en Tráfico, lista de reglas a 34% en Reglas y Pausados.
  - Divisor accesible: `role="separator"` con `aria-valuenow/min/max` en porcentaje, flechas
    ±16 px, `Home`/`End` a los mínimos, doble clic restablece. Si el reparto guardado no cabe en
    el ancho actual, se ajusta a los mínimos sin sobrescribir la preferencia.
- **Rationale**: un layout de filas fijas es lo que garantiza SC-001 (Ajustes y avisos no
  desplazan nada) y que la barra no se vaya al hacer scroll. 280 px es lo que necesita la columna
  Nombre con método y estado; 320 px, el mínimo de la constitución para cualquier vista.
- **Alternatives considered**: librería de paneles redimensionables (dependencia nueva para ~120
  líneas); detalle como panel flotante (tapa la lista, que es justo lo que se quiere evitar).

---

## R5 — Menú contextual y menús

- **Decision**: un componente `Menu` con el patrón APG (`role="menu"`, `menuitem`, flechas,
  `Home`/`End`, letra inicial, Enter, Escape, foco que vuelve al disparador). El menú contextual
  de la lista escucha el evento `contextmenu` de la fila: Chrome lo emite con el clic derecho,
  con la tecla de menú contextual y con `Shift+F10` sobre el elemento enfocado (FR-021). Se
  posiciona en el punto del clic (o bajo la fila con teclado) y se ajusta para quedar dentro del
  panel. `preventDefault` solo sobre filas: el resto del panel conserva el menú del navegador,
  salvo el área vacía de la lista (caso límite de la spec).
- **Rationale**: un solo componente sirve para el menú contextual, el menú del estado de sesión
  (clarificación 3), el grupo "N avisos" y los menús futuros (perfiles de 007).
- **Alternatives considered**: `chrome.contextMenus` (no funciona dentro de DevTools y pide
  permiso nuevo); `<select>` o `<details>` como menú (no siguen el patrón y no se posicionan).

---

## R6 — Catálogo de acciones del request

- **Decision**: un módulo del panel, `panel/actions/request-actions.ts`, con una lista de
  `RequestAction` (ver [data-model.md](./data-model.md)): id, clave i18n, atajo opcional,
  `appliesTo(exchange, ctx)` puro y `run(exchange, ctx)`. La cabecera del detalle y el menú
  contextual renderizan `catalog.filter(appliesTo)` en el mismo orden (FR-020). Hoy: `createRule`
  y `relaxCors`. Las features 005 y 007 añaden entradas a la lista; no hay registro dinámico.
- **Rationale**: una lista declarativa hace imposible que cabecera y menú diverjan y deja la
  aplicabilidad como función pura testeable sin DOM.
- **Alternatives considered**: registro en tiempo de ejecución con `register()` (complejidad sin
  necesidad: todas las acciones se conocen al compilar); acciones dentro de cada componente
  (el problema de hoy).

---

## R7 — Regla a partir de un request

- **Decision**: función pura nueva en el dominio, `ruleDraftFromExchange(exchange)` (TDD), que
  devuelve un `RuleDraft` válido con: nombre `MÉTODO /ruta`, prefiltro glob con el origen y la
  ruta del request seguida de `*` (para cubrir la query), el método del request, el tipo de
  recurso del request, etapa `response` si el request no lleva body y tuvo respuesta (en un GET la response es lo único que hay que editar) y `request` si lleva body o nunca respondió, sin condiciones y acción `pause`. Los caracteres especiales del
  glob en la URL se escapan con `\` (ya soportado por `globToRegExp`) para no ampliar el patrón;
  si no cabe en `LIMITS.globMax`, se recorta la ruta y se termina en `*`. El panel abre el editor de reglas con ese borrador; nada se guarda hasta "Guardar
  regla" (FR-023). Para un preflight, el método es `OPTIONS`.
- **Rationale**: es lógica de reglas (dominio, principio V) y reutiliza la validación de 002:
  la prueba exige que el resultado pase `RuleDraftSchema` para cualquier request capturable.
- **Alternatives considered**: prefiltro regex (más exacto pero ilegible para el dev y más fácil
  de romper al editarlo); prellenar también condiciones de status (sobreajusta la regla al
  request concreto).

---

## R8 — Ajustes con guardado automático

- **Decision**: cada campo de Ajustes envía `updateSettings` (protocolo actual) al confirmarse:
  `blur` o Enter en texto y número; `change` en interruptores y listas. Un indicador "Guardado"
  por campo se anuncia en una región `aria-live="polite"`. Un valor inválido se valida en el
  panel con los límites de `@nahual/domain` antes de enviarse y, si el SW lo rechaza, se muestra
  el `issue` en el campo. Al cerrar el diálogo, un campo inválido sin corregir vuelve al valor
  guardado (clarificación 2). Los orígenes de producción mantienen su flujo de 003 (añadir,
  quitar con deshacer).
- **Rationale**: no cambia el protocolo ni el SW; reutiliza la validación existente.
- **Alternatives considered**: guardar en cada pulsación de tecla (escrituras de más y errores
  mientras se escribe).

---

## R9 — Avisos del sistema en la franja

- **Decision**: la franja de indicadores tiene un orden fijo: Nahual en pausa, CORS relajado y
  luego los avisos (`notices` y `lastError` del store actual). Cada aviso ocupa una línea con
  causa, solución y "Cerrar". Con más de 2 avisos se muestra una línea "N avisos" que abre una
  lista superpuesta (el `Menu`/popover de R5) sin mover el contenido (FR-013a). Los avisos nuevos
  se anuncian con `role="status"`; los errores con `role="alert"`.
- **Rationale**: aprovecha el store existente; la franja ya existe para pausa y CORS.

---

## R10 — Pausados en Tráfico

- **Decision**: el store relaciona `exchangeId ⇒ PausedItem` (el `PausedItem` de 002 ya lleva
  `exchangeId`). Una fila con pausado activo muestra la marca "pausado" y su detalle abre en la
  pestaña "Editar", que monta el `PausedEditor` existente. La sección Pausados conserva su vista
  (`PauseQueue`) y comparte la selección del pausado activo con Tráfico. Si el pausado vence
  mientras se edita, el detalle cambia a Headers y muestra el aviso de 002.
- **Rationale**: reutiliza el editor y los comandos de 002 sin cambios de protocolo.

---

## R11 — Columnas de la lista

- **Decision**: orden Nombre, Método, Estado, Tipo, Tamaño, Tiempo (clarificación 4). La celda
  Nombre muestra marcas (CORS, pausado, preflight) + ruta con query (monoespaciada) + host
  (secundario); `title` con la URL completa. Con el detalle abierto o a menos de 600 px se ocultan
  Tipo, Tamaño y Tiempo. La lista virtualizada de 002 (`@tanstack/react-virtual`) y su
  navegación con flechas se conservan; el alto de fila pasa al de Network (D1).
- **Rationale**: decisión del usuario; la virtualización ya cumple SC-004 de 002.

---

## R12 — Atajos en un solo lugar

- **Decision**: `panel/shortcuts.ts` declara todos los atajos (id, combinación por `code`,
  descripción i18n, ámbito). `use-shortcuts.ts`, los `aria-keyshortcuts`, la sección Atajos de
  Ajustes y la Ayuda leen de ahí. Una prueba unitaria verifica que no hay combinaciones
  repetidas ni reservadas por DevTools. Inventario actual: `Alt+Shift+A` (adjuntar/soltar),
  `Alt+Shift+C` (continuar seleccionado), `Alt+Shift+K` (continuar todos), `Alt+Shift+P`
  (pausar Nahual), `Alt+Shift+R` (apagar relajaciones), `Alt+Shift+F` y `/` (buscar),
  `Alt+↑`/`Alt+↓` (reordenar reglas). Reservados de DevTools que no se usan: `Ctrl/Cmd+Shift+C`,
  `Ctrl/Cmd+Shift+P`, `Ctrl/Cmd+P`, `Ctrl/Cmd+[`, `Ctrl/Cmd+]`, `Ctrl/Cmd+F`, `F8`, `F10`,
  `F11`, `Escape` fuera de diálogos y menús.
- **Sin atajo propio**: "Crear regla desde este request" (FR-022) no se considera acción
  frecuente del principio III: se crea una regla por caso, no por request, y el teclado la
  alcanza en 2 pasos (`Shift+F10` o tecla de menú ⇒ `Enter`). Si la prueba de comprensión
  (SC-005) o el uso muestran lo contrario, se añade al catálogo sin cambiar el resto.
- **Rationale**: FR-030; evita el choque que tenía el mockup (`Alt+Shift+K` para la consola).

### Experimento D2 — Escape y teclas dentro de un panel de extensión

DevTools reenvía algunos atajos desde los paneles de extensión a su propia ventana (por ejemplo,
`Escape` abre o cierra el cajón de la consola). D2 comprueba en Chrome estable, a mano y con el
panel real, si `Escape` dentro de un diálogo o menú de Nahual también alterna ese cajón y si
`preventDefault`/`stopPropagation` en la captura lo evita. Respaldo si no se puede evitar:
Escape sigue cerrando el diálogo de Nahual (patrón APG) y se documenta el efecto secundario.

---

## R13 — Lugares reservados verificables (SC-009)

- **Decision**: un gancho solo del build de pruebas, `__nahualUiSlots`, que registra elementos
  simulados: una sección más en la barra, dos indicadores de estado, el cajón inferior con
  contenido, un editor de reglas ancho, una acción por lote (activa la selección múltiple) y una
  sección más de Ajustes. Una E2E los activa y comprueba a 320, 800 y 1280 px que nada se desborda
  ni tapa. `verify:dist` comprueba que el gancho no existe en producción (como
  `__nahualLabTabs` y `__nahualCorsTimeScale`).
- **Rationale**: FR-002 prohíbe mostrar funciones futuras; sin el gancho no habría forma de
  probar FR-025–FR-029 hasta 005–007.
- **Alternatives considered**: historias de componentes en un catálogo visual (dependencia nueva
  y no prueba el panel real).

---

## R14 — Regresión visual

- **Decision**: capturas con `toHaveScreenshot` de Playwright para las vistas principales
  (Tráfico con detalle, CORS relajado, pausado en Tráfico, Reglas, Pausados, Ajustes, menú
  contextual) en claro y oscuro a 320, 800 y 1280 px. Van en un proyecto aparte,
  `pnpm --filter @nahual/extension e2e:visual`, con `maxDiffPixelRatio: 0.01` y capturas de
  referencia por plataforma (las fuentes del sistema cambian entre Linux, macOS y Windows). La
  suite E2E normal no depende de ellas.
- **Rationale**: es la única forma automática de detectar que una feature futura rompe la
  integración visual; separarlas evita fallos por fuentes del sistema en otras máquinas.

---

## R15 — Integraciones de DevTools consideradas

- **`ExtensionPanel.onSearch`** (la barra de búsqueda de DevTools con `Ctrl+F` dentro del panel):
  no se adopta en 004. Encaja con "sentirse parte de DevTools", pero cambia el comportamiento del
  filtro (FR-001) y `Ctrl+F` hoy es de DevTools. Queda anotada como mejora posible.
- **`ExtensionPanel.createStatusBarButton`**: no se usa; la barra propia del panel cubre los
  elementos de estado.
- **Paneles laterales de Elements o Sources** y menús en Network: no existen APIs para Network
  (conversación previa a la feature); fuera de alcance.

---

## R16 — Migración de las E2E

- **Decision**: primero se actualizan los helpers de `e2e/fixtures/panel.ts` a localizadores
  por rol y nombre accesible que sobreviven al rediseño (sección, menú, diálogo de Ajustes,
  fila por nombre). Las pruebas de 002 y 003 solo cambian por los helpers; lo que verifican no
  cambia (SC-008). Cambios conocidos: `openTab("Queue")` ⇒ sección `Paused`; `details.settings`
  ⇒ diálogo "Settings"; el botón "Detach/Attach" ⇒ menú del estado de sesión;
  `.status > [role=status]` ⇒ el estado de sesión por rol; `h1` desaparece; la columna Nombre
  cambia el texto de las filas (`requestRow` deja de filtrar por `^OPTIONS`).
- **Rationale**: SC-008; mover los helpers antes que los componentes deja la suite en verde en
  cada paso.

---

## R17 — Rendimiento

- **Decision**: se reutiliza la medición de filtrado de 2,000 entradas de 002 (E2E con el
  historial lleno) y se añade el caso con detalle abierto y selección múltiple simulada
  (SC-007). El panel no añade trabajo al SW ni al camino del tráfico: el overhead por request no
  cambia y no se vuelve a medir.

---

## Resultados

- **D1** (2026-10-23, Chromium 156 headless con `--auto-open-devtools-for-tabs`, experimento
  automático `e2e/experiments/d1-devtools-tokens.spec.ts`): Chrome expone el destino
  `devtools://` a CDP y los tokens se leen con `getComputedStyle`. Valores en la tabla de R1.
  Fuente `"Google Sans Text", "Google Sans", system-ui, sans-serif` a 12 px; fila de la tabla de
  Network 21 px; barra de herramientas 26 px; iconos de la barra en cajas de 20 × 20 px. Desvío
  anotado: borde de campos (`--input-outline`).
- **D2** (2026-10-23, mismo navegador, experimento automático `e2e/experiments/d2-escape.spec.ts`
  con el panel real abierto en DevTools con `Ctrl+[`): con un `<dialog>` modal abierto en el panel
  y el foco dentro, **Escape abre también el cajón de la consola de DevTools** (alto 0 ⇒ 199 px) y
  el diálogo no llega a cerrarse. Con un `keydown` en fase de captura en `window` que hace
  `stopPropagation()` para Escape, el cajón no cambia y el diálogo se cierra con su `cancel`
  nativo. Decisión: `Dialog` y `Menu` detienen la propagación de Escape en captura mientras están
  abiertos; fuera de ellos Escape sigue siendo de DevTools (R12). En la implementación, `Dialog`
  la detiene en el propio `<dialog>` (antes de `document`, donde escucha DevTools), `Menu` con
  un `keydown` en captura en `window` mientras está abierto, y el detalle y la lista de avisos
  desplegada con su propio `keydown`.
- **SC-007** (T067, `e2e/panel-performance.spec.ts`, Chromium 156, Linux): filtrar 2,000 entradas
  con el detalle abierto, **2,7 ms**; con los lugares reservados llenos y 2 filas seleccionadas,
  **2,5 ms** (meta < 300 ms). La medición de 002 sin detalle sigue en `traffic.spec.ts`.
- **Bundles del panel** (T067, build de producción): antes de 004 (0.3.0) JS 324,310 B (97,027 B
  con gzip) y CSS 8,471 B (2,285 B); después (0.4.0) JS 351,626 B (106,399 B) y CSS 17,807 B
  (4,138 B). +27 KB de JS sin dependencias nuevas: estructura (`shell/`, `settings/`, `actions/`)
  y componentes compartidos.
- **Estabilidad de la E2E** (T068, 2026-10-24, Linux, Chromium 156 headless): 10 ejecuciones
  seguidas de la suite completa, **114/114 en cada una** (≈ 5 min por ejecución), sin pruebas
  inestables. Antes de esas 10, dos fallos intermitentes que se corrigieron en el código: el menú
  tomaba el foco en el siguiente cuadro y un Escape inmediato no lo cerraba (ahora toma el foco al
  colocarse y escucha Escape en captura), y el hover del botón primario le quitaba el fondo
  (texto blanco sobre gris, 1,1:1).
- **SC-005** (prueba de comprensión): por registrar en la validación manual (T071).

### Decisiones tomadas al implementar

- **Iconos de 20 px** (D1): el plan decía 16 px; se sigue la medida de la barra de Network.
- **Fila seleccionada**: siempre con `--nh-selected` y su color de texto
  (`--sys-color-on-tonal-container`, `#041e49` / `#c2e7ff`) en toda la fila, como DevTools con
  foco. Ese color, el de hover (`--sys-color-state-hover-on-subtle`) y el primario
  (`--sys-color-primary`) no se midieron en D1: se tomaron de `design_system_tokens.css` y
  quedan para la comparación lado a lado de T071. El gris de la selección sin foco (`--nh-selected-inactive`) no llega a 4,5:1 con el texto
  secundario y el de error en tema oscuro (axe lo marcó), así que no se usa: desvío documentado.
- **Filtro CORS**: se conserva como lista compacta con Todos / Bloqueados por CORS / Relajados,
  porque 003 ya filtra por "Relajados" y FR-001 no permite perder comportamiento; T025 sugería un
  único botón "Bloqueados por CORS".
- **Tipos a menos de 600 px**: van a un botón "Tipos (n)" que abre un menú de casillas
  (`menuitemcheckbox`); así los filtros caben en 2 filas a 320 px (FR-009). A partir de 600 px
  son botones de selección como en Network, con el tipo completo como nombre accesible.
- **Búsqueda con alternador de regex**: un solo campo; el alternador cambia su nombre accesible
  ("Search URLs" ⇒ "URL regex") y pasa lo escrito al otro modo. Ya no se combinan texto y regex a
  la vez.
- **Pestaña CORS del detalle**: además de los bloqueados, la tienen los requests relajados y los
  que tienen un preflight relacionado, para no perder información de 003; la pestaña inicial
  sigue FR-018 (CORS solo si fue bloqueado). Al ir al preflight relacionado (o volver) el detalle
  nuevo abre en CORS.
- **Contadores de la barra**: Reglas cuenta las reglas activas del sitio actual desde el store
  del panel (no espera al `state` del SW) y Pausados, los pausados de la pestaña.
- **Gancho de pruebas**: `panel/test-slots.tsx` (con JSX). `pushNotice` también empuja avisos del
  catálogo a la franja, para probar "N avisos" sin provocar 3 fallos reales del SW.
- **Divisores**: sin márgenes negativos (un divisor encima del borde de una fila tapaba el clic,
  SC-009); cada parte del `SplitPane` hace su propio scroll.
- **Regla desde un GET (corrección tras la implementación)**: con etapa `request` y tipo
  "Fetch" el borrador no servía para editar la response. Dos causas: la etapa (un GET no tiene
  nada que editar antes de la respuesta; ahora es `response` si el request no lleva body y tuvo
  respuesta) y un bug de 002 que el borrador destapó: `Fetch.requestPaused` reporta las llamadas
  `fetch()` como "XHR", aunque Network las reporta como "Fetch", así que una regla con tipo
  "Fetch" nunca pausaba. El motor evalúa ahora el tipo de Network (`resourceTypeOf` de la
  captura) y los patrones de `Fetch.enable` de "Fetch" incluyen "XHR" (verificado en Chrome con la
  E2E de FR-023).
