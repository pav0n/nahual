# Feature Specification: Rediseño del panel e integración visual con DevTools

**Feature Branch**: `004-rediseno-panel`

**Created**: 2026-10-23

**Status**: Draft

**Input**: User description: "Especifica el rediseño del panel de Nahual para que se integre
visualmente con DevTools y deje lugar a las features 005–007." Entrada completa en
`docs/speckit-inputs/04-rediseno-panel.md`. Depende de `002-captura-intercept` y
`003-cors-desarrollo` (todo lo que hoy muestra el panel). Mockup navegable de referencia aprobado
por el usuario: https://claude.ai/artifact/NigD1YaXVAwL9k8fKpdWXE (guía de estructura e
interacción, no de píxeles; la referencia visual es DevTools).

## Clarifications

### Session 2026-10-23

- Q: ¿Los requests pausados siguen con sección propia (Pausados) o pasan a ser solo un filtro de
  Tráfico? → A: Sección propia siempre visible **y** marcados y editables en Tráfico; la barra
  queda con 3 secciones (4 con el repeater de 005).
- Q: ¿Ajustes guarda cada cambio solo o con un botón "Guardar"? → A: Cada campo se guarda solo al
  confirmarlo (salir del campo, Enter, o al cambiar un interruptor o una lista); uno inválido no
  se guarda y muestra su error. Cerrar el diálogo nunca pide confirmación.
- Q: ¿Qué pasa al hacer clic en el estado de la sesión de la barra superior? → A: Abre un menú
  corto con el estado, la causa si hay error y la acción (Soltar, Adjuntar o Reconectar); el
  atajo `Alt+Shift+A` sigue actuando directo.
- Q: ¿Cómo se ordenan y muestran las columnas de la lista de Tráfico? → A: Nombre primero (ruta
  completa en monoespaciada y host en gris, con las marcas CORS, pausado y preflight junto al
  nombre), luego Método, Estado, Tipo, Tamaño y Tiempo.
- Q: ¿Quién valida que el panel se entiende sin explicación previa (SC-005)? → A: Al menos 1 dev
  que usa DevTools a diario (puede ser el usuario) en la demo de cierre, más los que haya
  disponibles; los tiempos de cada tarea se registran.
- Q: ¿Dónde y cómo se muestran los avisos y errores del sistema (lista de producción ilegible,
  relajaciones terminadas por reinicio, ajustes restablecidos, comando fallido)? → A: En la
  franja de indicadores, una línea por aviso con causa, solución y botón para cerrarlo; se quedan
  hasta que el dev los cierra; con más de 2 se agrupan en "N avisos" desplegable.

## User Scenarios & Testing *(mandatory)*

> Glosario: **panel nativo** = cualquier panel propio de DevTools (Network, Elements, Console…);
> **barra superior** = la fila fija con las secciones y el estado; **franja de indicadores** = la
> línea bajo la barra que muestra estados que deben verse siempre (Nahual en pausa, CORS
> relajado); **acciones del request** = lo que el dev puede hacer con un request concreto (crear
> regla, permitir CORS y, en el futuro, repetir o exportar); **lugar reservado** = una zona de la
> estructura preparada para una feature futura que no se muestra mientras la feature no exista.

### User Story 1 - Se siente parte de DevTools (Priority: P1)

Como dev que usa DevTools a diario, quiero que el panel de Nahual se vea y se maneje como un panel
nativo, para usarlo sin aprender otra interfaz.

**Why this priority**: es la queja que origina la feature: hoy el panel parece un formulario web
dentro de DevTools. Sin esto, el resto del rediseño no cambia la percepción del producto.

**Independent Test**: con el panel de Nahual y el panel Network abiertos lado a lado en Chrome
estable, en tema claro y oscuro, comparar tipografía, tamaño de texto, alto de filas y barras,
colores, bordes, pestañas, selección y foco; cambiar el tema de DevTools con el panel abierto;
redimensionar lista y detalle con el ratón y con el teclado.

**Acceptance Scenarios**:

1. **Given** DevTools en tema claro, **When** el dev abre Nahual, **Then** tipografía, tamaño de
   texto, alto de filas, colores de fondo, barras, bordes, texto secundario, selección y foco
   coinciden con los del panel Network.
2. **Given** el panel abierto, **When** el dev cambia DevTools a tema oscuro, **Then** el panel
   cambia de tema sin recargarse y sin perder la selección ni lo que estaba escribiendo.
3. **Given** la lista de tráfico, **When** el dev abre el detalle de un request, **Then** el
   detalle aparece a un lado de la lista, separado por un divisor, y la lista oculta sus columnas
   secundarias (tipo, tamaño, tiempo) como hace Network; la columna Nombre, primera como en
   Network, sigue mostrando la ruta y el host.
4. **Given** el detalle abierto, **When** el dev arrastra el divisor o lo enfoca y usa las flechas,
   **Then** cambia el reparto de ancho; al reabrir el panel se conserva el último reparto.
5. **Given** el panel a menos del ancho mínimo para dos columnas, **When** el dev abre un detalle,
   **Then** el detalle se muestra debajo de la lista y ambos siguen siendo usables.
6. **Given** la sección Tráfico, **When** el dev la abre, **Then** los filtros (búsqueda con
   alternador de expresión regular, tipos como botones de selección compactos, "Bloqueados por
   CORS" y contador de resultados) ocupan una sola fila a anchos de 800 px o más.
7. **Given** cualquier menú, diálogo, cajón o indicación emergente de Nahual, **When** se muestra,
   **Then** tiene el aspecto de su equivalente en DevTools (bordes, sombra, radios, espaciado).

---

### User Story 2 - Estructura clara y estable (Priority: P1)

Como dev, quiero encontrar cada cosa siempre en el mismo lugar y que abrir Ajustes no me mueva la
lista.

**Why this priority**: es la otra mitad de la queja (Ajustes metido en medio, pestañas enterradas)
y la base sobre la que se acomodan las features 005–007.

**Independent Test**: recorrer todas las vistas actuales (Tráfico, Reglas, Pausados, Ajustes,
Ayuda) con tráfico real del fixture, abrir y cerrar Ajustes con un request seleccionado,
pausar un request con una regla y atenderlo desde Tráfico, y relajar CORS para ver la franja de
indicadores.

**Acceptance Scenarios**:

1. **Given** el panel abierto, **When** el dev lo mira, **Then** ve una sola barra superior: a la
   izquierda las secciones Tráfico, Reglas y Pausados con sus contadores (reglas activas, requests
   pausados); a la derecha el estado de la sesión (adjunto o no y el sitio; al pulsarlo abre un
   menú con la acción Soltar, Adjuntar o Reconectar), "Pausar Nahual", Ajustes y Ayuda; y no hay
   un título "Nahual" repetido.
2. **Given** Nahual en pausa o una relajación CORS activa, **When** el dev mira el panel, **Then**
   cada estado ocupa una sola línea bajo la barra con su acción (Reanudar, Apagar y cuenta
   regresiva); sin esos estados la línea no existe.
3. **Given** un request seleccionado en Tráfico, **When** el dev abre Ajustes, **Then** Ajustes se
   muestra como diálogo encima del panel, con secciones (General, Pausas, CORS de desarrollo,
   Atajos), y la lista y el detalle no se mueven.
4. **Given** Ajustes abierto, **When** el dev cambia un valor válido, **Then** se guarda sin pulsar
   ningún botón y se indica que quedó guardado; **When** escribe un valor fuera de rango, **Then**
   no se guarda y el campo explica el rango permitido.
5. **Given** una regla que pausa un request, **When** el request se pausa, **Then** aparece marcado
   como pausado en la lista de Tráfico y, al seleccionarlo, su detalle abre en "Editar" con las
   acciones de 002 (Continuar sin cambios, Continuar con cambios, Responder con mock y Fallar) y
   el tiempo que le queda.
6. **Given** varios requests pausados, **When** el dev abre la sección Pausados, **Then** puede
   atenderlos uno tras otro y "Continuar todos" sigue disponible.
7. **Given** un request bloqueado por CORS, **When** el dev lo selecciona, **Then** su detalle abre
   en la pestaña CORS; en cualquier otro request abre en Headers.

---

### User Story 3 - Acciones sobre un request en un solo lugar (Priority: P1)

Como dev, quiero actuar sobre un request desde donde lo estoy viendo, sin ir a buscar la acción a
otra sección.

**Why this priority**: es el sustituto real de lo que el dev pidió al principio (menús en la lista
de Network para enlazar reglas y CORS) y el punto donde 005 y 007 añadirán sus acciones.

**Independent Test**: sobre un request normal, uno bloqueado por CORS y uno pausado, abrir las
acciones desde la cabecera del detalle, con clic derecho en la fila y con el teclado (tecla de
menú contextual y Shift+F10); crear una regla desde el request y comprobar que llega prellenada.

**Acceptance Scenarios**:

1. **Given** un request seleccionado, **When** el dev mira la cabecera del detalle, **Then** ve las
   acciones que aplican a ese request.
2. **Given** la lista de tráfico, **When** el dev hace clic derecho en una fila (o la enfoca y pulsa
   la tecla de menú contextual o Shift+F10), **Then** se abre un menú con las mismas acciones que
   la cabecera del detalle y esa fila queda seleccionada.
3. **Given** el menú o la cabecera, **When** el dev elige "Crear regla desde este request",
   **Then** se abre el editor de reglas con un borrador cuyo patrón de URL, método y etapa salen
   del request, y no se guarda hasta que el dev lo confirma.
4. **Given** un request bloqueado por CORS sin relajación activa, **When** el dev abre sus
   acciones, **Then** aparece "Permitir CORS para desarrollo", que lleva a la misma confirmación
   de 003 (el total sigue siendo 2 clics desde el detalle).
5. **Given** un menú contextual abierto cerca del borde del panel, **When** se muestra, **Then**
   queda entero dentro del panel; Escape o un clic fuera lo cierra y el foco vuelve a la fila.

---

### User Story 4 - Lugar para lo que viene (Priority: P2)

Como mantenedor de Nahual, quiero que la estructura del panel ya tenga sitio para el repeater
(005), los hooks (006) y la exportación y los perfiles (007), para que esas features no vuelvan a
rediseñar el panel.

**Why this priority**: no aporta nada visible hoy, pero evita repetir este rediseño tres veces.

**Independent Test**: con datos de prueba que simulan los elementos futuros (una sección más en la
barra, un elemento de estado, un cajón inferior, contenido ancho en el editor de reglas, varias
filas seleccionadas y una sección más de Ajustes), comprobar a 320, 800 y 1280 px que nada se
desborda ni tapa a lo existente; en el build normal, comprobar que ninguno de esos elementos es
visible.

**Acceptance Scenarios**:

1. **Given** una sección y dos elementos de estado adicionales en la barra superior, **When** el
   panel mide 320 px, **Then** la barra se reorganiza sin scroll horizontal y todo sigue
   alcanzable con teclado.
2. **Given** un cajón inferior abierto, **When** el dev trabaja en cualquier sección, **Then** el
   cajón comparte el alto con el contenido, se pliega y se despliega, y su alto se recuerda.
3. **Given** un editor de reglas con contenido ancho, **When** se muestra, **Then** la lista de
   reglas puede angostarse con el divisor y el editor aprovecha el ancho restante.
4. **Given** la lista de tráfico, **When** el dev marca varias filas, **Then** el panel muestra
   cuántas hay seleccionadas y un lugar para acciones por lote; con una sola fila no aparece.
5. **Given** el build de producción sin las features 005–007, **When** el dev recorre el panel,
   **Then** no ve ningún botón, sección ni menú de funciones que aún no existen.

---

### Edge Cases

- **320 px de ancho**: barra superior, filtros, detalle y diálogos siguen usables sin scroll
  horizontal; el detalle va debajo de la lista; las etiquetas de texto de la barra pueden ocultarse
  si el botón conserva nombre accesible e indicación emergente.
- **2,000 entradas**: la lista conserva el desplazamiento fluido y el filtrado bajo 300 ms con el
  detalle abierto y con varias filas seleccionadas.
- **Cambio de tema con diálogos o menús abiertos**: cambian de tema sin cerrarse.
- **Varios avisos a la vez** (por ejemplo, tras reiniciar el service worker con la lista de
  producción ilegible): se agrupan en "N avisos"; cerrar uno no cierra los demás.
- **Ajustes abierto mientras llega tráfico o se pausa un request**: los contadores de la barra se
  actualizan detrás del diálogo; al cerrarlo, el foco vuelve al botón de Ajustes.
- **Request seleccionado que desaparece** (limpiar la lista, tope de 2,000): el detalle se cierra y
  el foco pasa a la lista; deshacer la limpieza (002) no reabre el detalle.
- **Request pausado cuyo tiempo vence mientras se edita**: el detalle muestra que continuó sin
  cambios (como en 002) y deja de ofrecer las acciones de pausa; lo escrito no se aplica.
- **Menú contextual sobre un preflight**: muestra solo las acciones que aplican; "Crear regla"
  está disponible, "Permitir CORS" no.
- **Divisor llevado al extremo**: ni la lista ni el detalle bajan de un ancho mínimo usable; el
  reparto recordado se ajusta si el panel ahora es más angosto.
- **Crear regla con otro borrador sin guardar**: se pide confirmación antes de reemplazarlo;
  cancelar conserva el borrador anterior y deja al dev en Reglas.
- **Clic derecho en una zona sin fila**: no abre el menú de acciones; el navegador tampoco muestra
  su menú propio sobre la lista.
- **Atajos**: ningún atajo nuevo choca con los existentes (`Alt+Shift+A`, `Alt+Shift+C`,
  `Alt+Shift+K`, `Alt+Shift+P`, `Alt+Shift+R`, `Alt+Shift+F`, `/`, `Alt+↑`, `Alt+↓`) ni con los
  de DevTools.

## Requirements *(mandatory)*

### Functional Requirements

**Alcance**

- **FR-001**: El rediseño MUST NOT cambiar ningún comportamiento de captura, reglas, pausa, CORS,
  almacenamiento ni privacidad de 002 y 003; solo dónde está cada elemento del panel y cómo se ve.
- **FR-002**: El panel MUST NOT mostrar botones, secciones, menús ni ajustes de funciones que aún
  no existen (ni deshabilitados ni marcados como "próximamente").

**Integración visual (US1)**

- **FR-003**: El panel MUST usar la misma tipografía, tamaños de texto, alto de filas y barras,
  colores de fondo, barra, borde, texto, texto secundario, selección, foco, error y aviso que los
  paneles nativos de DevTools, en tema claro y oscuro; los valores de referencia se miden en
  Chrome estable y se documentan.
- **FR-004**: El tema MUST seguir siempre al de DevTools, también si cambia con el panel abierto,
  sin recargar el panel ni perder estado; no hay ajuste propio de tema.
- **FR-005**: Pestañas, barras de herramientas, botones de icono, botones de selección, menús,
  diálogos, cajones e indicaciones emergentes MUST tener el aspecto de sus equivalentes en
  DevTools; los iconos son de línea, del mismo grosor y tamaño que los de DevTools, y siempre
  tienen nombre accesible.
- **FR-006**: Lista y detalle MUST mostrarse lado a lado, separados por un divisor que se arrastra
  con el ratón y se mueve con las flechas del teclado; el reparto MUST recordarse entre aperturas
  del panel.
- **FR-007**: La lista de tráfico MUST mostrar las columnas en este orden: Nombre (ruta completa
  con query en monoespaciada, host en texto secundario y, junto al nombre, las marcas "Bloqueado
  por CORS", "pausado" y "preflight"; la URL completa en la indicación emergente), Método, Estado,
  Tipo, Tamaño y Tiempo. Con el detalle abierto MUST ocultar Tipo, Tamaño y Tiempo y conservar
  Nombre, Método y Estado.
- **FR-008**: Por debajo del ancho mínimo para dos columnas, el detalle MUST mostrarse debajo de la
  lista.
- **FR-009**: Los filtros de tráfico MUST caber en una fila a 800 px o más y en no más de dos a 320
  px: búsqueda con alternador de expresión regular, tipos como botones de selección compactos,
  filtro de estado compacto (como `4xx, 500`), "Bloqueados por CORS", contador de resultados y
  limpiar la lista. Conservan el comportamiento de
  002 y 003 (regex inválida conserva el filtro anterior, `/` enfoca la búsqueda).

**Estructura (US2)**

- **FR-010**: El panel MUST tener una única barra superior con, a la izquierda, las secciones
  Tráfico, Reglas y Pausados y, a la derecha, el estado de la sesión, "Pausar Nahual", Ajustes y
  Ayuda; MUST NOT repetir el título "Nahual".
- **FR-011**: Las secciones MUST mostrar contadores: Reglas, las reglas activas; Pausados, los
  requests pausados (resaltado cuando es mayor que 0). Un contador en 0 no se muestra.
- **FR-012**: El estado de la sesión MUST mostrar con texto e icono (no solo color) si Nahual está
  adjunto y el sitio, y señalar cuando hay una causa de error. Un clic (o Enter) sobre el estado
  MUST abrir un menú corto con el estado, la causa y su solución si la hay, y la acción que
  corresponde (Soltar, Adjuntar o Reconectar) con el atajo `Alt+Shift+A` indicado; el clic sobre
  el estado nunca adjunta ni suelta por sí solo. El atajo `Alt+Shift+A` sigue actuando directo.
- **FR-013**: "Nahual en pausa" y "CORS relajado" MUST mostrarse, cuando aplican, en una línea cada
  uno bajo la barra superior, con su acción (Reanudar; Apagar, cuenta regresiva, orígenes y acceso
  al reporte) y su atajo; sin esos estados no ocupan espacio.
- **FR-013a**: Los avisos y errores del sistema (por ejemplo, lista de orígenes de producción
  ilegible, relajaciones terminadas por reinicio, ajustes restablecidos, un comando que falló)
  MUST mostrarse en la franja de indicadores, una línea por aviso con su causa, su solución y un
  botón para cerrarlo con nombre accesible; MUST quedarse hasta que el dev los cierre y
  anunciarse a lectores de pantalla. Con más de 2 avisos MUST agruparse en una línea "N avisos"
  que se despliega encima del contenido, sin desplazar la lista ni el detalle.
- **FR-014**: Ajustes MUST abrirse como diálogo modal encima del panel, sin desplazar el contenido,
  con secciones General (adjuntar al abrir), Pausas (tiempo máximo de pausa), CORS de desarrollo
  (duración por defecto, orígenes de producción) y Atajos (lista de todos los atajos).
- **FR-015**: Cada cambio válido en Ajustes MUST guardarse al confirmarlo (salir del campo, Enter,
  o al cambiar un interruptor o una lista), sin botón de aplicar ni de guardar, y confirmar que se
  guardó; un valor inválido MUST NOT guardarse y su campo MUST explicar el rango o formato.
  Cerrar el diálogo MUST NOT pedir confirmación ni descartar cambios ya confirmados; un campo
  inválido sin corregir se descarta al cerrar y conserva el valor guardado. Quitar un origen de
  producción conserva el deshacer de 003.
- **FR-016**: Los requests pausados MUST marcarse en la lista de Tráfico (texto e icono) y su
  detalle MUST abrir en "Editar" con el editor de pausa de 002, sus acciones (Continuar sin
  cambios, Continuar con cambios, Responder con mock y Fallar) y el tiempo restante.
- **FR-017**: La sección Pausados MUST seguir existiendo y estar siempre visible en la barra
  (también sin pausados, con su estado vacío) para atender varios pausados seguidos, con
  "Continuar todos" y su atajo.
- **FR-018**: El detalle de un request MUST organizarse en pestañas según el caso: CORS primero si
  fue bloqueado por CORS; Editar primero si está pausado; Headers primero en cualquier otro caso.
- **FR-019**: Ayuda MUST seguir ofreciendo la introducción de 002 y la lista de atajos.

**Acciones del request (US3)**

- **FR-020**: Las acciones de un request MUST definirse en un único catálogo (acción, cuándo aplica
  y su atajo, si tiene) que alimenta a la vez la cabecera del detalle y el menú contextual de la
  lista, para que siempre coincidan.
- **FR-021**: El clic derecho sobre una fila de la lista, la tecla de menú contextual y Shift+F10
  sobre una fila enfocada MUST abrir el menú de acciones de ese request y seleccionarlo; el menú
  sigue el patrón accesible de menú (flechas, Enter, Escape, foco que vuelve a la fila) y queda
  entero dentro del panel.
- **FR-022**: El catálogo MUST incluir hoy: "Crear regla desde este request" (para cualquier
  request) y "Permitir CORS para desarrollo" (para requests bloqueados por CORS sin relajación
  activa que cubra su origen).
- **FR-023**: "Crear regla desde este request" MUST abrir el editor de reglas con un borrador
  prellenado (patrón de URL que coincide con ese request, su método y la etapa de request) que no
  se guarda ni se activa hasta que el dev lo confirma. Si el editor de reglas ya tiene un
  borrador con cambios sin guardar, MUST pedir confirmación antes de reemplazarlo; si el dev
  cancela, conserva el borrador anterior.
- **FR-024**: "Permitir CORS para desarrollo" desde el menú MUST llevar a la misma confirmación de
  003, con el mismo alcance y las mismas protecciones (orígenes de producción, lista ilegible).

**Lugar para lo que viene (US4)**

- **FR-025**: La barra superior MUST admitir más secciones y elementos de estado (previstos: el
  repeater de 005, el botón de consola con contador de errores de 006 y el selector de perfil de
  007) sin scroll horizontal a 320 px.
- **FR-026**: El panel MUST admitir un cajón inferior plegable que comparte el alto con el
  contenido y recuerda su alto (previsto: consola de hooks de 006).
- **FR-027**: El editor de reglas MUST admitir contenido ancho (previsto: editor de código de 006)
  con la lista de reglas a un lado y divisor entre ambos.
- **FR-028**: La lista de tráfico MUST admitir selección de varias filas (casillas, Ctrl/Cmd+clic y
  Shift+clic) con un indicador del número de filas seleccionadas y un lugar para acciones por
  lote (previsto: exportar varios en 007); sin acciones por lote registradas, la selección
  múltiple no se ofrece.
- **FR-029**: Ajustes MUST admitir secciones nuevas (previstas: Perfiles e Importar y exportar de
  007) sin cambiar las existentes.
- **FR-030**: Los atajos MUST declararse en un solo lugar, sin repetidos y sin chocar con los de
  DevTools; la sección Atajos de Ajustes y la Ayuda los listan desde ese lugar.

**Accesibilidad, idioma y rendimiento**

- **FR-031**: Todo el panel MUST cumplir WCAG 2.2 AA en claro y oscuro, operarse solo con teclado
  (secciones, pestañas, divisor, menús y diálogos con los patrones accesibles estándar), tener
  foco visible y no depender solo del color.
- **FR-032**: Todos los textos nuevos o movidos MUST existir en español e inglés.
- **FR-033**: El rediseño MUST NOT empeorar el rendimiento del panel: filtrar 2,000 entradas bajo
  300 ms y desplazamiento fluido, con detalle abierto y con selección múltiple.
- **FR-034**: Las preferencias de interfaz (reparto del divisor, alto del cajón) MUST guardarse
  solo en el navegador del dev, sin datos de tráfico, y un valor guardado inválido MUST ignorarse
  y volver al valor por defecto.

### Key Entities

- **Sección del panel**: área principal elegible desde la barra superior (Tráfico, Reglas,
  Pausados; futuras: Repeater). Tiene nombre, contador opcional y atajo opcional.
- **Indicador de estado**: elemento de la barra o de la franja que refleja un estado global (sesión,
  Nahual en pausa, CORS relajado; futuros: perfil activo, errores de hooks) con su acción.
- **Acción del request**: algo que el dev puede hacer con un request; tiene nombre, condición de
  aplicabilidad (tipo de request, estado CORS, pausa) y atajo opcional. Se muestra en la cabecera
  del detalle y en el menú contextual.
- **Sección de Ajustes**: grupo de ajustes con su título (General, Pausas, CORS de desarrollo,
  Atajos; futuras: Perfiles, Importar y exportar).
- **Preferencia de interfaz**: valor local del dev sobre la disposición del panel (reparto del
  divisor, alto del cajón); nunca contiene datos de tráfico.
- **Atajo**: combinación de teclas con su acción y su descripción; único en el panel.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Abrir y cerrar Ajustes desplaza 0 px la lista y el detalle.
- **SC-002**: A 320 px no hay scroll horizontal en ninguna vista y los filtros de Tráfico ocupan
  como máximo 2 filas; a 800 px o más, 1 fila.
- **SC-003**: De un request bloqueado por CORS a relajado siguen bastando 2 clics desde el detalle;
  de un request pausado visto en Tráfico a continuado, 1 clic.
- **SC-004**: 0 violaciones de accesibilidad automatizadas en todas las vistas y estados (menú
  abierto, Ajustes, detalle de pausado, CORS relajado, Nahual en pausa) en claro y oscuro.
- **SC-005**: En la demo de cierre, al menos 1 dev que usa DevTools a diario (más los que haya
  disponibles), sin explicación previa, encuentra los filtros, el detalle, Ajustes y "Crear regla
  desde este request" en menos de 10 s cada uno; los tiempos de cada dev y tarea se registran.
- **SC-006**: Los valores visuales del panel (fuente, tamaño de texto, alto de fila y de barra,
  fondo, barra, borde, texto, texto secundario, selección y foco) coinciden con los medidos en
  DevTools en Chrome estable, en claro y oscuro, salvo los desvíos documentados con su motivo; en
  la comparación lado a lado de la demo de cierre no aparecen diferencias fuera de esa lista.
- **SC-007**: Filtrar 2,000 entradas tarda menos de 300 ms con el detalle abierto.
- **SC-008**: El 100% de las pruebas automatizadas de extremo a extremo de 002 y 003 siguen
  pasando, cambiando solo cómo localizan los elementos, no lo que verifican.
- **SC-009**: Con elementos simulados de 005–007 (una sección, dos indicadores de estado, cajón
  inferior, editor ancho, selección múltiple y una sección de Ajustes), 0 elementos desbordados o
  tapados a 320, 800 y 1280 px; en el build normal, 0 elementos de esas features visibles.

## Assumptions

- **Preferencias de interfaz globales**: el reparto del divisor y el alto del cajón se recuerdan
  para todo el panel, no por pestaña inspeccionada.
- **Sin selector de tema**: la constitución exige seguir el tema de DevTools; el selector del
  mockup no se implementa.
- **Atajos futuros**: esta feature no asigna atajos a 005–007; el mockup proponía `Alt+Shift+K`
  para la consola, que ya es "Continuar todos", así que cada feature elegirá el suyo sin choques
  (FR-030).
- **Sin permisos ni dependencias nuevas**: el rediseño se resuelve con lo que el panel ya usa.
- **Referencia visual**: Chrome estable en la fecha de implementación; si DevTools cambia su
  aspecto después, se actualiza en una feature aparte.
- **Ancho mínimo para dos columnas**: se fija en el plan a partir de lo que necesitan lista y
  detalle para ser usables (orientativo: alrededor de 600 px).
