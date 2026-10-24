# Contrato: estructura del panel y puntos de extensión

Contrato **interno** del panel que 005, 006 y 007 usan para añadir lo suyo sin rediseñar. Cada
punto de extensión es una lista declarativa en código (no hay registro en tiempo de ejecución);
añadir una entrada no debe exigir tocar los componentes que la muestran.

## Regiones

```text
┌ Barra superior ─────────────────────────────────────────────────────────────┐
│ [Secciones con contador]                    [Indicadores de estado] [⏸] [⚙] [?] │
├ Franja de indicadores (solo si hay algo) ───────────────────────────────────┤
│ Nahual en pausa · CORS relajado · avisos (> 2 ⇒ "N avisos")                  │
├ Área principal (única que hace scroll) ─────────────────────────────────────┤
│ Sección activa: Tráfico = filtros + SplitPane(lista | detalle)               │
│                 Reglas / Pausados = SplitPane(lista | editor)                │
├ Cajón inferior (opcional, plegable, alto recordado) ────────────────────────┤
└─────────────────────────────────────────────────────────────────────────────┘
Capas superpuestas: diálogo de Ajustes, Ayuda, reporte CORS (003), menús.
```

| Región | Rol accesible | Regla |
|---|---|---|
| Barra superior | `banner` con `tablist` de secciones | Una fila a ≥ 800 px; a 320 px puede envolver, nunca scroll horizontal (FR-025) |
| Franja | `region` "Estado" | Orden fijo (data-model `StripItem`); 0 px si está vacía |
| Área principal | `main` | Cada sección es un `tabpanel` |
| Cajón | `region` con nombre de su contenido | Solo existe si una feature lo usa (FR-026) |

## Puntos de extensión

| Lista | Archivo | Hoy | Previsto |
|---|---|---|---|
| `SECTIONS` | `panel/shell/sections.ts` | `traffic`, `rules`, `paused` | 005: `repeater` |
| `STATUS_ITEMS` | `panel/shell/status-items.ts` | `session` | 006: consola de hooks (contador de errores); 007: perfil activo |
| `REQUEST_ACTIONS` | `panel/actions/request-actions.ts` | `createRule`, `relaxCors` | 005: `sendToRepeater`; 007: `export` |
| `BATCH_ACTIONS` | `panel/actions/batch-actions.ts` | ninguna (sin selección múltiple) | 007: `exportMany` |
| `DETAIL_TABS` | `panel/components/traffic/detail-tabs.ts` | `cors`, `edit`, `headers`, `request`, `response` | 006: `hooks` |
| `SETTINGS_SECTIONS` | `panel/settings/sections.ts` | `general`, `pause`, `cors`, `shortcuts` | 007: `profiles`, `data` |
| `SHORTCUTS` | `panel/shortcuts.ts` | inventario de research R12 | Cada feature añade los suyos; la prueba de unicidad los cubre |
| Cajón | `panel/shell/Drawer.tsx` | sin contenido | 006: consola de hooks |

Reglas comunes:

- Cada entrada tiene `id` único, claves i18n en `es` y `en` y, si actúa, un atajo de `SHORTCUTS`.
- La aplicabilidad (`appliesTo`, contadores) es una función pura del estado del store, probada sin
  DOM.
- Nada en estas listas puede depender de `chrome.*` directamente; los efectos van por los
  comandos existentes del panel.
- El gancho `__nahualUiSlots` (solo build de pruebas, research R13) añade entradas simuladas a
  todas las listas para verificar SC-009.

## Componentes compartidos

| Componente | Patrón | Uso |
|---|---|---|
| `Tabs` (existente) | APG tabs, activación automática | Secciones, pestañas del detalle |
| `SplitPane` | `separator` con valor, flechas, `Home`/`End`, doble clic restablece | Tráfico, Reglas, Pausados |
| `Menu` | APG menu; posición ajustada al panel | Menú contextual, estado de sesión, "N avisos", futuros |
| `Dialog` | `<dialog>` modal, foco atrapado, Escape, foco de vuelta al disparador | Ajustes, Ayuda, reporte CORS |
| `Toolbar` | `toolbar` con navegación por flechas | Filtros, cabecera del detalle |
| `ToggleButton` | `aria-pressed` | Tipos del filtro, regex, "Bloqueados por CORS" |
| `IconButton` | botón con `aria-label` y `title` | Barra superior, cerrar |

## Lo que no cambia

Protocolo v3 (`packages/protocol`), service worker, `chrome.storage.local` y manifest. Ver
[storage.md](./storage.md) y [manifest.md](./manifest.md).
