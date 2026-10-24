# Feature Specification: Repeater y diff de respuestas

**Feature Branch**: `005-repeater-diff`

**Created**: 2026-10-24

**Status**: Draft

**Input**: User description: "Especifica el repeater y el diff de respuestas de Nahual." Entrada
completa en `docs/speckit-inputs/05-repeater-diff.md`. Depende de `002-captura-intercept`
(tráfico capturado, detalle, reglas, límites de body y redacción) y de `004-rediseno-panel`
(sección en la barra superior y catálogo de acciones del request). Respeta la relajación CORS de
`003-cors-desarrollo`.

## Clarifications

### Session 2026-10-24

- Q: ¿Las pestañas del repeater y su historial de envíos deben seguir ahí después de cerrar
  DevTools o reiniciar el navegador? → A: No. Viven solo en memoria mientras el panel está
  abierto; al cerrar DevTools se pierden. Solo persiste la lista de campos ignorados por endpoint,
  que no contiene valores.
- Q: ¿El dev necesita comparar una respuesta contra un JSON que pega a mano (por ejemplo, la
  respuesta esperada)? → A: Sí. El dev puede pegar un body (JSON o texto) en la pestaña y usarlo
  como "antes" o "después" de un diff; vive en memoria como el resto y no se guarda por endpoint.
- Q: ¿Cómo debe enviarse un request en "contexto limpio" si la API no permite leer su respuesta
  por CORS desde la extensión? → A: Con un permiso opcional por dominio: al primer envío limpio a
  un origen, Nahual pide acceso solo a ese origen; si el dev lo niega, el envío falla con la causa
  y propone usar el contexto de página.
- Q: Cuando un array de objetos cambia de orden o se le inserta un elemento al principio, ¿cómo
  debe compararlo el diff? → A: Por un campo identificador si todos los objetos del array lo
  tienen (`id`, `_id`, `uuid` o `key`, en ese orden); si no, por posición. El diff indica qué
  criterio usó.
- Q: Un envío del repeater en contexto de página, ¿debe pasar por las reglas activas y aparecer en
  Tráfico como cualquier request de la app? → A: Sí a las dos: pasa por las reglas de 002 y
  aparece en Tráfico marcado como "repeater"; el resultado del envío dice si una regla actuó.
- Q: Además de los headers, ¿el diff debe redactar valores sensibles dentro del body JSON y de la
  URL? → A: Sí. Headers, campos JSON y parámetros de query cuyo nombre es sensible (mismo criterio
  que los headers, más `password`) se redactan por defecto, se revelan con una acción explícita y
  el diff sigue indicando si cambiaron.
- Q: Si el request capturado tiene un body que Nahual no puede mostrar como texto (binario o de
  más de 5 MB), ¿qué hace "Enviar al repeater"? → A: Si Nahual aún tiene el body original, se
  reenvía intacto y no editable (con tipo, tamaño y "Reemplazar por texto"); si no lo tiene, el
  body queda vacío con un aviso que explica por qué. Editar bodies binarios, multipart y otros
  tipos queda para una feature futura.

## User Scenarios & Testing *(mandatory)*

Nahual ya captura el tráfico de la pestaña inspeccionada y deja ver el detalle de cada request.
Hoy, para reproducir un bug, el dev tiene que repetir el flujo en la interfaz de su app hasta que
el request vuelva a salir. Esta feature añade el **repeater** (reenviar un request capturado,
editado o no) y el **diff** (ver qué cambió entre dos respuestas).

### User Story 1 - Reenviar un request (Priority: P1)

Como dev, quiero reenviar un request capturado y editarlo, para reproducir un bug sin repetir el
flujo en la interfaz de mi app.

Desde cualquier request de Tráfico, "Enviar al repeater" abre una pestaña del repeater con una
copia editable del request (método, URL, headers y body). El dev ajusta lo que quiera y lo envía
en uno de dos modos: **contexto de página** (como si lo hiciera la propia app: con sus cookies y
su origen) o **contexto limpio** (sin sesión, como un cliente que no ha iniciado sesión). Cada
envío queda en el historial de esa pestaña con su status, tiempo y tamaño.

**Why this priority**: es la mitad de la feature y el paso previo al diff; por sí solo ya ahorra
repetir flujos largos en la app para reproducir un bug.

**Independent Test**: capturar un GET y un POST con body JSON, enviarlos al repeater, cambiar un
parámetro de la URL y un campo del body, enviarlos en los dos modos y comprobar que el servidor de
prueba recibe lo editado, con cookies en contexto de página y sin ellas en contexto limpio, y que
el historial registra cada envío.

**Acceptance Scenarios**:

1. **Given** un request capturado en Tráfico, **When** el dev elige "Enviar al repeater" desde el
   menú contextual de la fila o la cabecera del detalle, **Then** se abre la sección Repeater con
   una pestaña nueva cuyo método, URL, headers y body son los del request capturado, editables.
2. **Given** una pestaña del repeater, **When** el dev la mira, **Then** ve el modo de envío activo
   (contexto de página o contexto limpio) sin abrir ningún menú, y una pestaña nueva empieza en
   contexto de página.
3. **Given** un request editado, **When** el dev pulsa "Enviar" o `Ctrl+Enter` (`Cmd+Enter` en
   macOS), **Then** el request sale con lo editado y su respuesta (status, headers, body, tiempo y
   tamaño) aparece en la pestaña y como entrada nueva del historial.
4. **Given** el modo contexto de página, **When** el request se envía, **Then** lleva las cookies
   de la pestaña inspeccionada y sale con su origen; en contexto limpio no lleva cookies ni
   credenciales de la pestaña.
5. **Given** varios envíos en el historial, **When** el dev elige uno, **Then** ve el request que
   se envió y la respuesta que recibió, y puede cargar ese request en el editor para volver a
   enviarlo.
6. **Given** varias pestañas del repeater, **When** el dev renombra, duplica o cierra una,
   **Then** el cambio se aplica al momento; al cerrar, un aviso ofrece "Deshacer" y recupera la
   pestaña con su historial.
7. **Given** una regla activa que pausa los requests a `/api/*`, **When** el dev envía en contexto
   de página un request a `/api/items`, **Then** el envío queda pausado y aparece en Pausados y en
   Tráfico marcado como "repeater"; al continuar, el resultado del envío indica que lo pausó esa
   regla.
8. **Given** el modo contexto de página, **When** la pestaña inspeccionada navega a otro sitio, se
   cierra o el debugger se suelta, **Then** ese modo se deshabilita con un mensaje que dice por
   qué y qué hacer, y el contexto limpio sigue disponible.

---

### User Story 2 - Comparar respuestas (Priority: P1)

Como dev, quiero comparar dos respuestas, para ver qué cambió entre el request original y el
reenviado, o entre dos envíos.

El dev elige dos respuestas cualesquiera (la original capturada frente a un envío, o dos envíos
del historial) y Nahual muestra las diferencias de status, headers y body. Un body JSON se compara
por estructura: cada campo añadido, eliminado o cambiado se muestra con su ruta. Un body de texto
se compara por líneas. Los campos que cambian siempre (fechas, ids de traza) se pueden marcar para
ignorarlos, y Nahual recuerda esa lista para el mismo endpoint.

**Why this priority**: es la otra mitad del objetivo ("ver qué cambió"); con el repeater sin diff,
el dev tiene que comparar a ojo cuerpos de cientos de líneas.

**Independent Test**: con dos respuestas JSON preparadas en el servidor de prueba (un campo
añadido, uno eliminado, uno con tipo cambiado, un array con un elemento distinto y un timestamp),
abrir el diff y comprobar que lista exactamente esos cambios con su ruta; marcar el timestamp
como ignorado, cerrar y volver a comparar el mismo endpoint, y comprobar que sigue ignorado.

**Acceptance Scenarios**:

1. **Given** un envío del repeater hecho a partir de un request capturado, **When** el dev elige
   "Comparar con el original", **Then** ve el diff entre la respuesta capturada y la del envío.
2. **Given** dos envíos del historial, **When** el dev los elige para comparar, **Then** ve el diff
   entre esas dos respuestas, indicando cuál es la de la izquierda (antes) y cuál la de la derecha
   (después).
3. **Given** dos respuestas con body JSON, **When** se comparan, **Then** cada diferencia se
   muestra con su ruta (p. ej. `$.items[2].price`), su tipo (añadido, eliminado o cambiado) y los
   valores de antes y después; un cambio de tipo (número a texto, objeto a array) cuenta como
   cambiado; el orden de las claves de un objeto no cuenta como cambio.
4. **Given** dos respuestas con body de texto que no es JSON (o JSON inválido), **When** se
   comparan, **Then** se muestra un diff por líneas con las líneas añadidas y eliminadas.
5. **Given** dos respuestas, **When** se comparan, **Then** el diff también muestra si cambió el
   status y qué headers se añadieron, eliminaron o cambiaron; los nombres de header se comparan
   sin distinguir mayúsculas.
6. **Given** un diff con cambios en un campo volátil, **When** el dev marca su ruta como
   "ignorar", **Then** ese cambio sale del recuento y de la lista (con un indicador de cuántos se
   ignoran y forma de verlos), y la próxima comparación del mismo endpoint lo ignora también.
7. **Given** un diff con headers sensibles (`Authorization`, `Cookie`, `Set-Cookie`, tokens), un
   campo JSON `access_token` o un parámetro `?token=`, **When** se muestra, **Then** sus valores
   aparecen redactados; el dev puede revelarlos solo con
   una acción explícita sobre ese diff, y redactados también se detecta si cambiaron.
8. **Given** un diff con varios cambios, **When** el dev usa "Cambio siguiente" y "Cambio
   anterior" (botones o teclado), **Then** el foco y la vista se mueven a cada cambio en orden, y
   cada cambio se distingue por icono o prefijo (`+`, `−`, `~`), no solo por color.
9. **Given** una pestaña del repeater, **When** el dev pega un JSON como respuesta esperada y lo
   compara con un envío, **Then** el diff muestra solo las diferencias de body, con la pegada como
   "antes" y el envío como "después" (intercambiables).

---

### Edge Cases

- **La pestaña inspeccionada navega, se cierra o se suelta el debugger**: el modo contexto de
  página se deshabilita con la causa y la solución (volver a adjuntar, o usar contexto limpio). Un
  envío en curso en ese modo termina como error con la misma explicación; nunca queda colgado.
- **Navegación dentro del mismo sitio**: el modo contexto de página sigue disponible y usa el
  origen y las cookies actuales de la pestaña.
- **Respuesta binaria o mayor de 5 MB** (original o de un envío): se muestran solo sus metadatos
  (status, headers, tipo y tamaño); el diff compara status, headers y tamaño, e indica que el
  body no se compara y por qué.
- **Body JSON inválido** en una o las dos respuestas: el diff es por líneas, con un aviso de que
  no se pudo comparar por estructura.
- **Body original no disponible** (desalojado del historial de captura, o nunca guardado): el diff
  lo indica y compara solo status y headers.
- **Request que dispara un preflight CORS** en contexto de página: el envío informa que hubo
  preflight y su resultado; si el preflight o la respuesta se bloquean por CORS, se muestra el
  diagnóstico de 003; si hay una relajación CORS activa que cubre esos orígenes, se respeta igual
  que para el tráfico de la app.
- **Contexto limpio sin acceso al origen**: el envío pide acceso a ese origen (FR-011a); si el dev
  lo niega o lo revoca, el envío termina con un error que explica la causa y propone usar el
  contexto de página.
- **Headers que el navegador no deja fijar** (p. ej. `Cookie`, `Host`, `Origin`, `Content-Length`
  en contexto de página): el editor los marca y el envío avisa cuáles no se enviaron tal cual;
  nunca se descartan en silencio.
- **Reglas activas de 002** en contexto de página: el envío pasa por las mismas reglas que el
  tráfico de la app (puede pausarse, mockearse o retrasarse) y el resultado lo indica; si queda
  pausado, la pausa respeta su timeout y el envío espera.
- **El envío falla por red** (DNS, conexión rechazada, timeout): queda en el historial como error
  con la causa, sin status.
- **El servidor tarda**: el envío muestra que está en curso y se puede cancelar; al cancelarlo
  queda en el historial como cancelado.
- **URL o método inválidos**: no se envía; el campo muestra el error y cómo corregirlo.
- **Límites alcanzados** (pestañas o envíos por pestaña): al llegar al máximo de pestañas no se
  abren más y se explica por qué; el historial descarta el envío más antiguo y lo indica.
- **Comparar una respuesta consigo misma o dos idénticas**: el diff dice "Sin diferencias".
- **Contenido capturado con HTML o scripts**: se muestra siempre como texto, nunca se ejecuta.

## Requirements *(mandatory)*

### Functional Requirements

**Abrir y editar (US1)**

- **FR-001**: El catálogo de acciones del request (004) MUST incluir "Enviar al repeater" para
  cualquier request capturado, en el menú contextual de la fila y en la cabecera del detalle.
- **FR-002**: "Enviar al repeater" MUST abrir la sección Repeater con una pestaña nueva que copia
  método, URL, headers y body del request capturado y recuerda de qué request salió.
- **FR-002a**: Si el body del request capturado no es texto editable (binario o mayor de 5 MB):
  si Nahual aún conserva el body original, la pestaña lo MUST reenviar intacto, sin permitir
  editarlo, mostrando su tipo y tamaño y la acción "Reemplazar por texto" (que lo sustituye por un
  body de texto vacío, con deshacer); si no lo conserva (desalojado o nunca disponible), el body
  queda vacío y un aviso explica por qué y que el envío no reproducirá el original.
- **FR-003**: La sección Repeater MUST estar en la barra superior junto a Tráfico, Reglas y
  Pausados, con el número de pestañas abiertas; sin pestañas, explica cómo crear una.
- **FR-004**: El dev MUST poder crear también una pestaña vacía (método GET, URL en blanco).
- **FR-005**: El editor MUST permitir editar método, URL, headers (añadir, quitar, cambiar,
  desactivar uno sin borrarlo) y body como texto, con formato y validación de JSON como el editor
  de pausados de 002.
- **FR-006**: Los headers sensibles del request MUST mostrarse enmascarados en el editor, con la
  acción "Mostrar" de 002; enmascarados se envían con su valor real.
- **FR-007**: El editor MUST validar antes de enviar: URL absoluta http(s), método válido, headers
  con nombre y valor válidos, y body dentro del límite de 5 MB; un error bloquea el envío y dice
  cómo corregirlo.
- **FR-008**: El editor MUST marcar los headers que el navegador no deja fijar en el modo elegido
  y explicar qué pasará con ellos.

**Enviar (US1)**

- **FR-009**: Cada pestaña MUST tener un modo de envío visible en todo momento: contexto de página
  o contexto limpio; una pestaña nueva empieza en contexto de página.
- **FR-010**: En contexto de página, el request MUST enviarse desde la pestaña inspeccionada, con
  sus cookies y su origen, y pasar por la captura, las reglas de 002 y la relajación CORS de 003
  como cualquier request de la app; en Tráfico aparece marcado como enviado por el repeater.
- **FR-010a**: El resultado de un envío en contexto de página MUST indicar qué regla actuó y
  cómo (pausado, mock, retraso, error, modificado), con enlace a la regla; la fila de Tráfico de
  ese envío lleva la marca "repeater" con texto accesible, no solo un icono.
- **FR-011**: En contexto limpio, el request MUST enviarse sin cookies ni credenciales de la
  pestaña ni del navegador, y sin pasar por las reglas de 002.
- **FR-011a**: El primer envío en contexto limpio a un origen sin acceso concedido MUST pedir al
  dev, en ese momento, acceso solo a ese origen exacto, explicando para qué sirve. Si lo concede,
  el envío sigue; si lo niega, el envío termina con la causa y propone el contexto de página. El
  acceso concedido se puede revocar desde Ajustes, que lista los orígenes con acceso. Nunca se
  pide acceso a todos los sitios ni sin una acción del dev.
- **FR-012**: El contexto de página MUST estar disponible solo mientras Nahual está adjunto a la
  pestaña y esta sigue en el sitio de la sesión; si no, se deshabilita con causa y solución.
- **FR-013**: Lo que el dev escribe (URL, headers, body) MUST tratarse siempre como datos: ningún
  valor puede ejecutarse como código en la pestaña inspeccionada ni en la extensión.
- **FR-014**: "Enviar" y `Ctrl+Enter` / `Cmd+Enter` (con el foco en cualquier parte de la pestaña
  del repeater) MUST enviar el request; mientras está en curso se muestra el progreso y "Cancelar".
- **FR-015**: La respuesta de un envío MUST mostrar status, headers, body, tiempo y tamaño, con los
  mismos límites y la misma presentación que el detalle de Tráfico (body de hasta 5 MB como texto
  o JSON formateado; binario o mayor solo con metadatos).
- **FR-016**: Si el envío pasa por un preflight CORS, el resultado MUST indicarlo; si se bloquea
  por CORS, MUST mostrar el diagnóstico de 003.
- **FR-017**: Un envío que falla (red, CORS, cancelado, contexto perdido) MUST quedar en el
  historial con su causa y una solución, sin status.

**Historial y pestañas (US1)**

- **FR-018**: Cada pestaña MUST guardar un historial de sus envíos, del más reciente al más
  antiguo, con hora, método, URL, modo, status (o error), tiempo y tamaño.
- **FR-019**: Elegir un envío del historial MUST mostrar el request enviado y la respuesta
  recibida, y permitir cargarlo en el editor.
- **FR-020**: Las pestañas MUST poder renombrarse, duplicarse (con el request del editor, sin el
  historial) y cerrarse; cerrar ofrece "Deshacer" durante 10 segundos (como en 003) y recupera
  la pestaña con su historial.
- **FR-020a**: Las pestañas del repeater y su historial MUST vivir solo en memoria mientras el
  panel está abierto; nada de su contenido (requests, respuestas, headers, bodies) se escribe en
  el almacenamiento de la extensión. Al cerrar DevTools se pierden; si el panel se recarga, la
  sección Repeater lo explica en su estado vacío.
- **FR-021**: Límites explícitos: hasta 20 pestañas y 50 envíos por pestaña; al pasar de 50 se
  descarta el más antiguo, y el historial lo indica.

**Comparar (US2)**

- **FR-022**: El dev MUST poder comparar dos respuestas cualesquiera de la misma pestaña: la
  original capturada, un envío del historial o la respuesta pegada (FR-022a).
- **FR-022a**: El dev MUST poder pegar un body (JSON o texto, hasta 5 MB) en la pestaña como
  "respuesta pegada" y usarlo como cualquiera de los dos lados del diff. Solo tiene body: el diff
  con una respuesta pegada compara solo el body. Vive en memoria con la pestaña (FR-020a); una
  pestaña tiene a lo sumo una respuesta pegada, que se puede editar o quitar.
- **FR-023**: Cada lado del diff MUST llevar un rótulo visible "Antes" o "Después" con su
  procedencia (original capturada, envío con su número y hora, o pegada), y el dev MUST poder
  intercambiarlos.
- **FR-024**: El diff MUST mostrar si cambió el status y la lista de headers añadidos, eliminados
  y cambiados, comparando nombres sin distinguir mayúsculas.
- **FR-025**: Con body JSON válido en las dos respuestas, el diff MUST ser estructural: cada
  campo añadido, eliminado o cambiado con su ruta y sus valores de antes y después. El orden de
  las claves no cuenta como cambio; un cambio de tipo cuenta como cambiado.
- **FR-025a**: Un array cuyos elementos son todos objetos con un mismo campo identificador
  (`id`, `_id`, `uuid` o `key`, el primero de esa lista que tengan todos, con valores únicos en
  cada lado) MUST compararse emparejando elementos por ese campo: un elemento nuevo es añadido,
  uno que falta es eliminado y uno que solo cambió de lugar no cuenta como cambio. Cualquier otro
  array se compara por posición. La ruta de un elemento emparejado lo nombra por su identificador
  (p. ej. `$.items[id=42].price`) y el diff indica qué criterio usó en cada array.
- **FR-026**: Con body de texto que no es JSON válido en alguna de las dos, el diff MUST ser por
  líneas, con un aviso si se esperaba JSON (el content-type lo decía).
- **FR-027**: Con un body binario, mayor de 5 MB o no disponible, el diff MUST comparar status,
  headers y tamaño, y decir por qué el body no se compara.
- **FR-028**: El dev MUST poder marcar rutas de JSON y headers para ignorar desde el propio diff
  (y desmarcarlas); los cambios ignorados salen del recuento con un indicador de cuántos son y
  la opción de verlos.
- **FR-029**: La lista de ignorados MUST recordarse por endpoint (método + URL sin query) entre
  sesiones y aplicarse en la próxima comparación de ese endpoint; guarda solo rutas y nombres de
  header, nunca valores.
- **FR-030**: Los valores sensibles MUST mostrarse redactados en el diff: headers sensibles,
  campos de un body JSON y parámetros de query de la URL cuyo nombre es sensible (el mismo
  criterio que los headers de 002 —`Authorization`, `Cookie`, `Set-Cookie` y nombres que contienen
  `token`, `secret`, `session`, `api-key` o `apikey`— más `password`), a cualquier profundidad.
  Revelarlos requiere una acción explícita sobre ese diff y no persiste al cerrarlo. Redactados,
  el diff sigue indicando si cambiaron, sin mostrar ningún fragmento del valor.
- **FR-031**: Cada cambio MUST distinguirse sin depender del color: icono o prefijo `+` (añadido),
  `−` (eliminado) y `~` (cambiado), con texto accesible equivalente.
- **FR-032**: El diff MUST mostrar el total de cambios y permitir ir al siguiente y al anterior con
  botones y teclado; dos respuestas iguales muestran "Sin diferencias".

**Transversal**

- **FR-033**: Todo el repeater y el diff MUST ser operables solo con teclado, con foco visible, en
  español e inglés, en tema claro y oscuro de DevTools y a 320 px de ancho, como el resto del
  panel (004).
- **FR-034**: Los atajos nuevos MUST declararse en el inventario único de 004, sin chocar con los
  existentes ni con los de DevTools.
- **FR-035**: El contenido de requests y respuestas MUST mostrarse siempre como texto, nunca
  interpretarse como HTML ni ejecutarse.
- **FR-036**: Ningún request ni respuesta del repeater MUST salir del navegador hacia Nahual ni a
  terceros: el único tráfico es el request que el dev envía a su destino.

### Key Entities *(include if feature involves data)*

- **Pestaña del repeater**: nombre, modo de envío, request en edición, request de origen
  (opcional, el capturado del que salió y su respuesta) e historial de envíos.
- **Request del repeater**: método, URL, headers (cada uno activo o desactivado) y body: texto
  editable u original intacto no editable (con tipo y tamaño).
- **Envío**: request enviado, modo, hora, resultado (respuesta, error o cancelado), tiempo,
  tamaño, y si hubo preflight, efecto de reglas o relajación CORS.
- **Respuesta comparada**: status, headers, body (o el motivo de que no esté) y su procedencia
  (original capturada, envío o pegada; la pegada solo tiene body).
- **Resultado del diff**: cambio de status, cambios de headers, cambios de body (por ruta o por
  líneas), cambios ignorados y total.
- **Lista de ignorados por endpoint**: método + URL sin query, rutas de JSON y nombres de header
  a ignorar.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: De un request capturado a reenviado (abrir en el repeater y enviar sin editar) en
  menos de 10 segundos.
- **SC-002**: El diff identifica correctamente el 100% de los cambios de la suite de casos de
  prueba (anidación, arrays por posición y por identificador, elementos reordenados, tipos cambiados, claves reordenadas, rutas ignoradas, texto por
  líneas, headers y status), sin falsos positivos.
- **SC-003**: El diff de dos respuestas JSON de 1 MB se muestra en menos de 1 segundo, y el panel
  sigue respondiendo mientras tanto.
- **SC-004**: En la suite de seguridad, 0 de los intentos de inyectar código a través de URL,
  headers o body del repeater llegan a ejecutarse.
- **SC-005**: En contexto limpio, el servidor de prueba no recibe ninguna cookie ni credencial en
  el 100% de los envíos; en contexto de página las recibe en el 100%.
- **SC-005a**: Tras usar el repeater con requests que llevan cookies y tokens, el almacenamiento
  de la extensión no contiene ningún request, respuesta, header ni body del repeater.
- **SC-005b**: 0 solicitudes de acceso sin una acción del dev, y cada una abarca un solo origen.
- **SC-006**: 0 valores sensibles (headers, campos JSON o parámetros de query) visibles en un
  diff sin acción explícita del dev, en la suite de pruebas de redacción.
- **SC-007**: 0 violaciones serias o críticas de accesibilidad en el repeater y el diff, en tema
  claro y oscuro.
- **SC-008**: Un dev que no conoce la feature encuentra "Enviar al repeater", envía y abre el diff
  con el original sin explicación previa, en menos de 30 segundos.

## Assumptions

- **Historial en memoria** (confirmado en Clarifications, FR-020a): las pestañas del repeater y su
  historial pueden contener credenciales, por eso no se guardan en disco.
- **Respuesta pegada sin persistencia** (confirmado en Clarifications, FR-022a): guardarla por
  endpoint como "respuesta esperada" entre sesiones queda fuera.
- **Arrays** (confirmado en Clarifications, FR-025a): el dev no elige el campo identificador;
  si ningún campo de la lista sirve, el array se compara por posición.
- **Límites**: 20 pestañas y 50 envíos por pestaña, orientativos para mantener acotada la memoria
  del panel; el plan puede ajustarlos con justificación.
- **Diff dentro de una pestaña**: se comparan respuestas de la misma pestaña del repeater
  (original y envíos); comparar entre pestañas queda fuera.
- **Contexto de página = marco principal**: los envíos en contexto de página salen del marco
  principal de la pestaña inspeccionada.
- **Permisos** (confirmado en Clarifications, FR-011a): el único permiso nuevo es el acceso
  opcional por origen para el contexto limpio, pedido en el momento; el plan lo justifica por
  escrito. Sin dependencias nuevas salvo justificación en el plan.
- **Bodies no textuales fuera de alcance**: editar bodies binarios, `multipart/form-data` (campos
  y archivos) u otros formatos no textuales queda para una feature futura; aquí solo se reenvían
  intactos (FR-002a).
- **Reutilización**: el editor de headers y body, el enmascarado de headers sensibles, los
  límites de body y el diagnóstico CORS son los de 002 y 003.
