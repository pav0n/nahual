# Contrato: interfaz integrada con el panel (007)

Requisito transversal del usuario y FR-001 a FR-007: nada nuevo debe sentirse como un añadido.
Cada pieza nombra el componente existente que reutiliza y el equivalente de DevTools que imita.
Ninguna vista se da por terminada sin comparar su captura con la vista vecina de 004–006 en el
mismo tema (parte de la definición de terminado, como en 006).

## Puntos de extensión que se rellenan (contrato `panel-shell.md` de 004)

| Lista | Entrada nueva | Archivo |
|---|---|---|
| `REQUEST_ACTIONS` | `export` ("Exportar como…", `Alt+Shift+E`), tras `sendToRepeater`; aplica si `!isPreflight` | `panel/actions/request-actions.ts` |
| `BATCH_ACTIONS` | `exportMsw` (min 2), `exportZod` (min 2, habilitada solo si todas las filas comparten método + ruta), `exportPostman` (min 1) | `panel/actions/batch-actions.ts` |
| `STATUS_ITEMS` | `profile` (antes de `session`) | `panel/shell/status-items.ts` |
| `SETTINGS_SECTIONS` | `profiles` ("Perfiles"), `data` ("Importar y exportar"), tras `shortcuts` | `panel/settings/sections.ts` |
| `SHORTCUTS` | `exportRequest` `Alt+Shift+E` (global), `openProfileMenu` `Alt+Shift+O` (global) | `panel/shortcuts.ts` |

## Exportar

| Pieza | Componentes | Referencia visual |
|---|---|---|
| `ExportDialog` | `Dialog` (modal, foco atrapado, Escape); cabecera "Exportar GET /api/items"; `Tabs` con los seis formatos (deshabilitados con `title` del motivo cuando no aplican); CodeMirror de 006 en solo lectura con el tema de Sources; línea de estado con `redacted.length` y `omitted`; `Switch` "Incluir valores sensibles"; pie con "Copiar" y "Descargar" (`IconButton` `copy`/`download` con texto) | El diálogo de importar hook de 006 y el panel Sources |
| Confirmación de valores sensibles | `ConfirmDialog` con causa y consecuencia; al aceptar, `includeSensitive` solo para ese diálogo; al cerrar vuelve a `false` | La confirmación de descartar cambios de 004 |
| Copiar / Descargar | `common/clipboard.ts` (extraído de `CorsReport`); `common/download.ts` (extraído de `HookEditor`); `Toast` "Copiado" / "Descargado <archivo>" | Igual que el informe CORS |
| Lote | Con ≥ 2 filas marcadas, la barra de selección de 004 muestra las tres acciones; progreso "Cargando bodies 3/12" en la línea de estado del diálogo | La barra de selección simulada en `ui-slots.spec.ts` |
| Repeater | Botón "Exportar como…" en la barra de la pestaña (`Toolbar`), exporta el request en edición y la respuesta seleccionada en `RepeaterOutput` | La barra del repeater de 005 |

Estados: vacío (sin bodies aún: esqueleto de texto "Generando…"), error (body no disponible:
el código se genera igual y lo dice el comentario), sin nada que exportar en lote (`EmptyState`
con el motivo por fila).

## Perfiles

| Pieza | Componentes | Referencia visual |
|---|---|---|
| `ProfileStatus` | Botón de la barra con icono `profile` (nuevo en `icons.tsx`, de línea, mismo grosor) y texto "Perfil: QA staging" / "Todas las reglas"; a 320 px solo el icono con `aria-label` y `title` | El estado de sesión de 004 |
| Menú de perfil | `Menu` (APG): "Todas las reglas", un elemento por perfil del sitio con marca de activo (`aria-checked`), separador, "Gestionar perfiles…"; perfil vacío con sufijo "(sin reglas)" | El menú del estado de sesión |
| `ProfilesSettings` | Lista de perfiles del sitio actual (los de otros sitios en `<details>`, como `RuleList`); nombre con `AutoSaveField`; botones Duplicar y Eliminar (`IconButton`); `Toast` con "Deshacer" 10 s al eliminar; `EmptyState` "Sin perfiles" con "Crear perfil" | La sección CORS de Ajustes y `RuleList` |
| Editor de reglas | Grupo "Perfiles" con una casilla por perfil del sitio (`Field` + `Switch` o casillas nativas con el estilo del panel) y enlace "Gestionar perfiles…" | El grupo "Tipos de recurso" del editor |
| Lista de reglas | Etiquetas de perfil junto al nombre (mismo estilo que "importado"); con un perfil activo, las reglas que no actúan en gris con texto "No actúa con QA staging" e icono; el contador de la barra cuenta solo las que actúan | La etiqueta "importado" de 006 |
| Avisos | Franja de indicadores: "El perfil activo se eliminó; esta pestaña usa todas las reglas" con botón cerrar | Los avisos de 004 |

## Importar y exportar (Ajustes ⇒ `data`)

| Pieza | Componentes |
|---|---|
| Exportar configuración | Resumen "N reglas en M sitios · H hooks · P perfiles · O orígenes de producción"; `Switch` "Incluir valores sensibles" ⇒ `ConfirmDialog`; botón "Descargar"; nota "Las relajaciones CORS nunca se exportan" cuando hay una activa |
| Importar configuración / Importar de Requestly | `<input type="file">` oculto tras un botón; lectura con `FileReader`; errores en línea con `issueAt` (causa + solución) |
| `ImportPreviewDialog` | `Dialog`; resumen por sitio; orígenes nuevos y "ya presente"; lista de reglas con perfil y tipo; cada hook en CodeMirror solo lectura con sus errores de tipo; "No soportadas (n)" con motivo (solo Requestly); pie "Importar (desactivado)" / "Cancelar" | El diálogo de importar hook de 006 |
| Tras importar | `Toast` "Importadas N reglas y M perfiles" con "Deshacer" 10 s |

## Accesibilidad e idioma

- Todo operable solo con teclado; foco visible; roles APG de `Tabs`, `Menu`, `Dialog`.
- Sin depender del color: el perfil activo y las reglas que no actúan llevan texto e icono.
- Claves i18n `export_*`, `profile_*`, `config_*`, `requestly_*` en `es` y `en`.
- Axe sin violaciones serias o críticas en cada pieza, claro y oscuro, 320 px (`export-a11y`,
  `profiles-a11y` en E2E); capturas visuales en el proyecto `visual`.
