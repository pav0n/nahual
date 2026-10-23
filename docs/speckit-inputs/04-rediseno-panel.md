# Nahual — 04 · Rediseño del panel e integración visual con DevTools

> Feature `004-rediseno-panel`. Depende de: `002-captura-intercept` y `003-cors-desarrollo` (todo lo que hoy muestra el panel).
> Objetivo: que el panel de Nahual se sienta parte de DevTools y tenga desde ahora el lugar de lo que traen 005 (repeater + diff), 006 (hooks) y 007 (exportar, perfiles y configuración portable), para que esas features no vuelvan a romper la interfaz.

## Contexto para el agente

Nahual es una extensión de Chrome MV3 (`chrome.debugger` + CDP) para devs frontend. Su panel es una pestaña propia de DevTools (`chrome.devtools.panels.create`); Chrome no permite añadir menús ni columnas al panel Network, así que la integración es **visual y de interacción**: el panel debe verse y comportarse como un panel nativo de DevTools.

Problemas del panel actual (capturas en `fixture:serve`):

- Ajustes es un `<details>` entre la barra de estado y las pestañas: al abrirlo empuja el tráfico media pantalla y mezcla tiempo de pausa, adjuntar al abrir y CORS, con un botón "Aplicar" suelto.
- Las pestañas Traffic / Rules / Queue quedan en la tercera o cuarta fila, debajo de un título "Nahual" redundante, de la barra de estado y de Ajustes. No muestran contadores (salvo Queue con algo pausado).
- Los filtros ocupan 3 filas con etiquetas de formulario y 9 casillas; a 320 px ocupan media pantalla.
- El detalle se abre debajo de la lista y la saca de la vista.
- Los requests pausados solo se atienden en la pestaña Queue, separados de la lista donde aparecen.
- Cada feature añadió su sección por su cuenta: no hay un lugar común para las acciones sobre un request.

Mockup navegable de referencia (aprobado por el usuario): https://claude.ai/artifact/NigD1YaXVAwL9k8fKpdWXE. Es una guía de estructura e interacción, no un diseño pixel a pixel; la referencia visual es DevTools.

Lo que piden las próximas features a la interfaz (inputs `05`, `06` y `07`):

- 005 Repeater + diff: pestañas propias que se renombran, duplican y cierran con deshacer; editor; historial; vista de diff navegable; modo de envío siempre visible; "Enviar al repeater" desde cualquier request; Ctrl/Cmd+Enter.
- 006 Hooks: editor de código ancho dentro de la regla; plantillas; consola de `log()` y errores asociada a cada request.
- 007 Exportar, perfiles y configuración: exportar uno o varios requests con vista previa; perfil activo siempre visible y cambio en un clic con atajo; importar y exportar JSON y reglas de Requestly.

---

## `/speckit.specify`

```text
Especifica el rediseño del panel de Nahual para que se integre visualmente con DevTools y deje lugar a las features 005–007.

Restricción de alcance: no cambia ningún comportamiento de captura, reglas, pausa ni CORS; solo dónde está cada cosa y cómo se ve. No se muestra ninguna función que aún no exista (nada de botones deshabilitados "próximamente"): los lugares para 005–007 existen en la estructura y se llenan cuando llegue cada feature.

P1 — Se siente parte de DevTools
Como dev, quiero que Nahual se vea y se maneje como un panel de DevTools, para usarlo sin aprender otra interfaz.
Aceptación:
- Misma tipografía, tamaño de texto, densidad, colores, bordes, iconos de línea, estilo de pestañas, barras de herramientas y estado de selección que los paneles nativos, en tema claro y oscuro.
- El tema sigue siempre al de DevTools, también si cambia con el panel abierto.
- Lista y detalle lado a lado, separados por un divisor que se puede arrastrar y mover con teclado; el ancho elegido se recuerda. Con el detalle abierto, la lista oculta columnas secundarias como hace Network. En anchos chicos el detalle pasa debajo de la lista.
- Los filtros de tráfico caben en una fila: búsqueda con alternador de regex, tipos como botones compactos de selección, "Bloqueados por CORS" y contador de resultados.
- Menús, diálogos, cajones e indicaciones (tooltips) con el aspecto de los de DevTools.

P1 — Estructura clara y estable
Como dev, quiero encontrar cada cosa siempre en el mismo lugar.
Aceptación:
- Una sola barra superior: a la izquierda las secciones (Tráfico, Reglas, Pausados) con contadores (reglas activas, requests pausados); a la derecha el estado de la sesión (adjunto/no adjunto y sitio, con la acción de adjuntar o soltar), "Pausar Nahual", Ajustes y Ayuda. Sin título "Nahual" (ya está en la pestaña de DevTools).
- Los indicadores de estado que deben estar siempre a la vista (Nahual en pausa, CORS relajado con su cuenta regresiva) ocupan una sola línea bajo la barra y solo aparecen cuando aplican.
- Ajustes se abre como diálogo encima del panel, sin mover el contenido, con secciones (General, Pausas, CORS de desarrollo, Atajos). Los cambios se guardan solos, con validación por campo; un valor inválido no se guarda y explica el rango.
- Los requests pausados se marcan en la lista de Tráfico y se editan en el mismo panel de detalle (Editar, Headers); la sección Pausados sigue sirviendo para atender varios seguidos y "Continuar todos".
- El detalle de un request muestra pestañas según el caso: CORS primero si fue bloqueado; Editar primero si está pausado.

P1 — Acciones sobre un request en un solo lugar
Como dev, quiero actuar sobre un request desde donde lo estoy viendo.
Aceptación:
- La cabecera del detalle reúne las acciones del request y el clic derecho en una fila de la lista abre un menú contextual con las mismas acciones (también con la tecla de menú contextual y Shift+F10).
- Con lo que existe hoy: crear una regla a partir del request (prellena patrón, método y etapa) y, si fue bloqueado por CORS, "Permitir CORS para desarrollo".
- Las features futuras añaden aquí sus acciones (enviar al repeater, exportar) sin rediseñar la cabecera ni el menú.

P2 — Lugar para lo que viene (sin funciones visibles todavía)
Aceptación:
- La barra superior admite más secciones (el repeater de 005) y elementos de estado (el selector de perfil de 007, el botón de consola de 006 con contador de errores) sin desbordarse a 320 px.
- El panel admite un cajón inferior plegable (la consola de hooks de 006) que comparte el alto con el contenido.
- El editor de reglas admite contenido ancho (el editor de código de 006); la lista de reglas se puede angostar.
- La lista de tráfico admite selección múltiple para acciones por lote (exportar varios en 007).
- Ajustes admite secciones nuevas (Perfiles e Importar y exportar de 007).

Accesibilidad y textos: WCAG 2.2 AA en claro y oscuro; todo operable con teclado (pestañas, divisor, menús y diálogos con los patrones APG); foco visible; nada se distingue solo por color; español e inglés.

Casos límite: panel a 320 px y a 2,000 entradas; cambio de tema con el panel abierto; Ajustes abierto mientras llega tráfico o se pausa un request; menú contextual cerca del borde (se reubica dentro del panel); request seleccionado que desaparece al limpiar o al pasar del tope de 2,000; detalle de un request pausado que vence su tiempo mientras se edita.

Criterios de éxito:
- Abrir y cerrar Ajustes no mueve la lista ni el detalle (0 px de desplazamiento).
- A 320 px: sin scroll horizontal del panel y los filtros en no más de 2 filas.
- De un request bloqueado por CORS a relajado sigue costando 2 clics; de un request pausado a continuado, 1 clic desde Tráfico.
- 0 violaciones axe en todas las vistas, en claro y oscuro.
- En una prueba con 3 devs que usan DevTools a diario, sin explicación previa, los 3 encuentran filtros, detalle, Ajustes y "crear regla desde un request" en menos de 10 s cada uno.
- Filtrar 2,000 entradas sigue por debajo de 300 ms y no hay regresión en ninguna prueba E2E de 002 y 003 (solo cambian sus selectores).
```

## `/speckit.clarify` — preguntas sugeridas

1. ¿Pausados sigue como sección propia o pasa a ser un filtro de Tráfico con su contador? (el mockup permite comparar ambas).
2. ¿El ancho del divisor y la sección abierta se recuerdan por pestaña o globalmente?
3. ¿Ajustes guarda cada cambio al instante o con un "Guardar" del diálogo?
4. ¿Qué atajos se reservan ya para las features futuras (cambiar de perfil, consola de hooks, enviar en el repeater)?

## `/speckit.plan`

```text
Planifica el rediseño sobre el panel actual (apps/extension/src/panel), sin tocar el service worker ni el protocolo salvo que research.md lo justifique.

Integración visual:
- research.md: inventario de los tokens visuales de DevTools en claro y oscuro (colores de fondo, barra, bordes, texto, texto secundario, selección, foco, error, aviso; tipografía, tamaños y alturas de fila y barra) medidos en Chrome estable, y cómo se replican: el panel es un iframe de extensión y no hereda las variables CSS de DevTools.
- Tokens como variables CSS en theme.css con variantes clara y oscura; el tema sale de chrome.devtools.panels.themeName y se actualiza si cambia. Iconos de línea propios en SVG en línea, sin fuentes de iconos.
- Ningún permiso nuevo ni dependencia nueva; si hiciera falta una, justificarla en plan.md (CLAUDE.md).

Estructura (componentes del panel):
- AppShell: barra superior (secciones con contador + zona de estado), franja de indicadores, área principal y cajón inferior opcional.
- SplitPane accesible (rol separator, flechas para mover, tamaño recordado en la preferencia de UI correspondiente según research.md).
- Toolbar y FilterBar compactos; ContextMenu y Menu con patrón APG; Dialog de Ajustes con secciones; Drawer.
- Registro de acciones de request: lista declarativa (id, etiqueta i18n, atajo, cuándo aplica) que alimenta la cabecera del detalle y el menú contextual; las features futuras registran sus acciones aquí. Lógica pura y probada (qué acciones aplican a qué request).
- Registro de secciones de la barra y de Ajustes con el mismo enfoque.
- La lista virtualizada actual (2,000 entradas) se conserva; selección múltiple en su modelo.

Pruebas:
- Unitarias: registro de acciones, cálculo de columnas visibles según ancho y detalle, SplitPane y menús con teclado, persistencia de preferencias de UI.
- E2E: actualizar los helpers de apps/extension/e2e/fixtures/panel.ts a la estructura nueva; todas las pruebas de 002 y 003 pasan sin cambiar lo que verifican; nuevas pruebas de Ajustes como diálogo, menú contextual, divisor y pausados en Tráfico.
- Capturas de regresión visual con Playwright en claro y oscuro a 320, 800 y 1280 px de las vistas principales.
- axe en todas las vistas y estados (menú abierto, diálogo, detalle de pausado, CORS relajado) en ambos temas.
- Medición del filtro con 2,000 entradas.
```

## `/speckit.tasks`

```text
Genera tasks.md por historia (P1 integración visual, P1 estructura, P1 acciones del request, P2 lugar para lo que viene).
TDD en la lógica pura del panel. [P] en lo paralelizable. Ruta de archivo en cada tarea.
Incluye la migración de los helpers E2E antes de mover componentes, las capturas de regresión visual en ambos temas, la revisión axe completa y un checkpoint demostrable en Chrome estable comparando lado a lado con el panel Network.
```
