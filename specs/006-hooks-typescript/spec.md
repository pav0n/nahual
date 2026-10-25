# Feature Specification: Hooks en TypeScript

**Feature Branch**: `006-hooks-typescript`

**Created**: 2026-10-25

**Status**: Draft

**Input**: User description: "Especifica los hooks en TypeScript de Nahual." Entrada completa en
`docs/speckit-inputs/06-hooks-typescript.md`. Depende de `002-captura-intercept` (reglas, etapas,
prioridad, límites de body y redacción) y de `004-rediseno-panel` (editor de reglas ancho, cajón
inferior y elemento de estado en la barra). Los envíos del repeater de `005-repeater-diff` en
contexto de página pasan por las reglas y, por tanto, por los hooks.

## Clarifications

### Session 2026-10-25

- Q: Si dos reglas con hook coinciden con el mismo intercambio en la misma etapa, ¿se ejecuta solo
  el hook de la regla más alta (como en 002) o todos en cadena? → A: Todos en cadena, en orden de
  prioridad; cada hook recibe el resultado del anterior. La cadena se forma cuando la regla más
  alta que coincide es una regla con hook; si la más alta es de otra acción (Pausar, Mock, Fallar,
  Retrasar, Registrar), se aplica solo esa, como en 002, y los hooks no se ejecutan.
- Q: Si una cadena de hooks tarda mucho, ¿se cortan los hooks que faltan? → A: No. Todos los hooks
  que coinciden se ejecutan; el único corte es el de 2 s por hook. La pestaña Hooks muestra la
  duración de cada hook y la de la cadena completa.
- Q: En etapa Request, ¿un hook puede responder directamente con una respuesta inventada, sin que
  el request llegue al servidor? → A: Sí. El hook devuelve una respuesta (status, headers, body) y
  el request no sale a la red; en una cadena, los hooks de etapa Request que faltan ya no corren y
  la respuesta se valida como la de un Mock de 002.
- Q: ¿El estado compartido entre hooks (`state`) se vacía al recargar la página o sigue hasta
  cerrar el panel? → A: Sigue hasta cerrar el panel: recargas y navegaciones no lo vacían. El dev
  lo vacía cuando quiere con "Vaciar estado".
- Q: Al exportar un hook a `.ts`, ¿el archivo lleva solo el código o también la configuración de
  su regla? → A: También la configuración (nombre, etapa, prefiltro, tipos de recurso y
  condiciones), en un comentario al inicio del archivo, que sigue siendo un `.ts` válido. Al
  importar, la regla se crea con esa configuración en el sitio actual, desactivada; sin ese
  comentario se importa solo el código.
- Q: ¿Un hook puede leer el valor de los headers sensibles (`Cookie`, `Authorization`, tokens)? →
  A: Solo si su regla tiene marcado el permiso "Este hook puede leer valores sensibles",
  desmarcado por defecto, siempre desmarcado al importar y que no se exporta. Sin él, el hook ve
  esos valores enmascarados y puede fijarlos, reemplazarlos o quitarlos, pero no leerlos.

### Session 2026-10-25 (segunda ronda)

- Q: Cuando varios requests que cumplen reglas con hook llegan a la vez, ¿los hooks se ejecutan
  de uno en uno o en paralelo? → A: En paralelo. Cada ejecución trabaja sobre una copia de `state`
  y sus cambios se guardan al terminar; si cambió `state` y otra ejecución guardó cambios después
  de que esta empezara, se repite con el valor nuevo, hasta 3 intentos; después termina con error
  de conflicto de estado.
- Q: Cuando un hook y la relajación CORS de desarrollo de 003 actúan sobre el mismo request, ¿cuál
  tiene la última palabra sobre los headers `Access-Control-*`? → A: La relajación. Se aplica
  después de los hooks y sus headers prevalecen; los preflight que responde localmente no pasan
  por hooks. Para probar un fallo de CORS, el dev desactiva la relajación.
- Q: ¿Cuánto código de hooks puede guardar Nahual en total, sumando todas las reglas? → A: 5 MB
  en total. Guardar o importar un hook que lo supere se rechaza con un mensaje que muestra el uso
  actual, y el resto de Nahual conserva su espacio.
- Q: Si un hook falla en cada request, ¿Nahual lo suspende solo? → A: Sí. Tras 5 errores seguidos
  de ese hook se suspende hasta cerrar el panel, sin tocar la regla guardada, con un aviso y la
  acción "Reanudar".
- Q: ¿Puede un hook cambiar el origen (esquema, host o puerto) del request? → A: Sí, solo si su
  regla tiene marcado el permiso "Este hook puede cambiar el destino del request", desmarcado por
  defecto y siempre desmarcado al importar. Sin el permiso, cambiar el origen es un resultado
  inválido. Toda redirección muestra el destino original y el nuevo.

## User Scenarios & Testing *(mandatory)*

Las reglas de Nahual ya pausan, simulan, hacen fallar, retrasan o registran el tráfico que cumple
una condición, pero sus cambios son fijos: un Mock sustituye la respuesta entera y editar un
campo concreto exige pausar y editar a mano en cada carga. Esta feature añade la acción
**Modificar con hook**: una función corta, escrita por el dev en TypeScript, que recibe el request
o la respuesta reales y devuelve una versión cambiada, de forma automática y con lógica propia.

Glosario:

- **Hook**: el código de una regla con la acción "Modificar con hook".
- **Contexto del hook**: lo que recibe el hook (el request y, en etapa Response, la respuesta), el
  estado compartido, el registro y las utilidades.
- **Ejecución**: una aplicación de un hook a un intercambio, con su resultado, duración, registros
  y error si lo hubo.
- **Consola de hooks**: el cajón inferior del panel donde aparecen los registros y los errores de
  las ejecuciones.
- **Archivo de hook**: el `.ts` exportado; configuración de la regla en un comentario al inicio y
  código del hook debajo (FR-035).

### User Story 1 - Escribir un hook (Priority: P1)

Como dev, quiero escribir un hook `(ctx) => ctx` en TypeScript con autocompletado, para
transformar tráfico con lógica propia: cambiar un campo del JSON sin perder el resto de la
respuesta real, añadir un header calculado o simular un caso que el backend no produce.

**Why this priority**: es el valor de la feature. Sin esta historia no hay hooks.

**Independent Test**: con la app de prueba, se crea una regla de etapa Response con la plantilla
"Cambiar un campo del JSON", se edita el campo y el valor, se activa y se recarga la página: la
página recibe la respuesta real con ese campo cambiado y el resto intacto; el detalle del request
en Tráfico indica que el hook actuó.

**Acceptance Scenarios**:

1. **Given** el editor de reglas, **When** el dev elige la acción "Modificar con hook", **Then**
   aparece un editor de código con una función de ejemplo que cumple la firma
   `export default (ctx: HookContext) => HookContext | void | Promise<HookContext | void>`.
2. **Given** el editor de código, **When** el dev escribe `ctx.`, **Then** ve el autocompletado de
   lo que expone el contexto (request, response en etapa Response, state, log y utilidades) con su
   descripción.
3. **Given** un hook con un error de sintaxis o de tipo (p. ej. asignar un texto a
   `ctx.response.status`), **When** el dev escribe, **Then** el error aparece marcado en su línea
   con un mensaje, y la regla no se puede activar hasta corregirlo.
4. **Given** una regla de etapa Request con un hook que añade un header, **When** la app hace un
   request que la cumple, **Then** el servidor recibe el header añadido.
5. **Given** una regla de etapa Response con un hook que cambia un campo del JSON, **When** llega
   una respuesta que la cumple, **Then** la página recibe la respuesta real con ese campo cambiado
   y el resto intacto.
6. **Given** un hook que no devuelve nada, **When** se ejecuta, **Then** el intercambio continúa
   sin cambios y la ejecución cuenta como correcta.
7. **Given** un hook asíncrono que resuelve en menos de 2 s, **When** se ejecuta, **Then** se
   aplica su resultado.
8. **Given** dos hooks que guardan y leen un contador en `state`, **When** se ejecutan sobre
   requests sucesivos, **Then** cada uno ve el valor que dejó el anterior (p. ej. fallar uno de
   cada tres requests), también después de recargar la página.
9. **Given** el selector de plantillas, **When** el dev elige "Agregar header", "Cambiar un campo
   del JSON" o "Simular lista vacía", **Then** el editor se abre con el código de la plantilla y
   la regla exige completar el prefiltro antes de guardar, como las plantillas de 002.
10. **Given** dos reglas con hook que coinciden con el mismo request (una añade un header y otra
    cambia un campo del body), **When** llega el request, **Then** se aplican las dos, en orden de
    prioridad, y la segunda recibe el request ya modificado por la primera.
11. **Given** una regla con hook sin el permiso de cambiar el destino, **When** su hook cambia el
    host de la URL, **Then** el request sale a su destino original y la consola explica que falta
    el permiso; **When** el dev marca el permiso, **Then** el request va al nuevo destino y Tráfico
    muestra el destino original y el nuevo.
12. **Given** una regla de etapa Request con un hook que devuelve una respuesta según el ID de la
    URL, **When** la app hace el request, **Then** la página recibe esa respuesta y el servidor no
    recibe el request.
13. **Given** una regla con hook sin el permiso de leer valores sensibles, **When** su hook lee el
    header `Authorization`, **Then** obtiene el valor enmascarado; si reemplaza ese header, el
    servidor recibe el nuevo valor; si no lo toca, recibe el original.
14. **Given** un intercambio sobre el que actuó un hook, **When** el dev abre su detalle en
    Tráfico, **Then** una pestaña Hooks muestra la regla, el resultado de la ejecución, su
    duración, qué partes cambió (status, headers, body, URL) y sus registros.

---

### User Story 2 - Fallar de forma segura (Priority: P1)

Como dev, quiero que un hook con errores nunca rompa ni bloquee mi app, y ver por qué falló, para
poder experimentar sin miedo.

**Why this priority**: la constitución exige fallar de forma segura (principio II). Un hook con un
bucle o una excepción no puede dejar la página esperando, y un error sin explicación hace
inútil la feature.

**Independent Test**: se activan, uno a uno, hooks que lanzan una excepción, devuelven un valor
inválido, tardan 5 s y entran en un bucle infinito; en cada caso la página recibe el request o la
respuesta originales sin cambios en ≤ 2,5 s, la consola de hooks muestra el error con mensaje,
línea y request, y los demás hooks siguen funcionando.

**Acceptance Scenarios**:

1. **Given** un hook que lanza una excepción, **When** se ejecuta, **Then** el intercambio
   continúa sin cambios y la consola muestra el mensaje, la línea del código del dev donde se
   lanzó, la regla y el request afectado.
2. **Given** un hook que devuelve un valor inválido (p. ej. status 999, un header con un nombre no
   válido o un body de otro tipo), **When** se ejecuta, **Then** no se aplica ningún cambio y la
   consola explica qué campo es inválido y por qué.
3. **Given** un hook que tarda más de 2 s o no termina nunca, **When** se ejecuta, **Then** a los
   2 s el intercambio continúa sin cambios, la ejecución se corta, la consola muestra "tiempo
   agotado" y las ejecuciones siguientes de ese y de otros hooks funcionan.
4. **Given** un hook que falla después de modificar `state`, **When** termina con error, **Then**
   los cambios de `state` de esa ejecución se descartan.
5. **Given** un hook que llama a `log()`, **When** se ejecuta, **Then** cada registro aparece en
   la consola de hooks asociado al request, a la regla y a la hora, y también en la pestaña Hooks
   del detalle de ese request.
6. **Given** errores de hooks en la sesión, **When** el dev mira la barra superior, **Then** un
   elemento de estado muestra el número de errores sin leer y abre la consola.
7. **Given** el interruptor "pausar Nahual" de 002 activado, **When** llega tráfico que cumple
   una regla con hook, **Then** el hook no se ejecuta.

---

### User Story 3 - Compartir hooks (Priority: P2)

Como dev, quiero exportar e importar hooks como archivos `.ts`, para versionarlos en el repo de mi
proyecto y compartirlos con mi equipo, sin que un archivo de un tercero pueda actuar sin que yo lo
revise.

**Why this priority**: multiplica el valor de los hooks, pero las historias 1 y 2 ya son útiles
sin ella. Es la puerta de entrada de código de terceros, así que sus salvaguardas son obligatorias.

**Independent Test**: se exporta un hook a un archivo `.ts`, se borra la regla, se importa el
archivo: el dev ve el código completo antes de aceptarlo, la regla queda desactivada y, al
activarla, se comporta igual que antes de exportarla.

**Acceptance Scenarios**:

1. **Given** una regla con hook, **When** el dev elige "Exportar hook", **Then** descarga un
   archivo `.ts` con la configuración de la regla en un comentario al inicio y el código del hook
   debajo, que puede abrir en su editor.
2. **Given** un archivo `.ts` de hasta 100 KB, **When** el dev lo importa, **Then** ve, sin que se
   ejecute nada, la configuración de la regla que se creará (etapa, prefiltro, tipos de recurso y
   condiciones) y el código completo como texto, antes de confirmar.
3. **Given** un hook importado y confirmado, **When** se guarda la regla, **Then** queda
   desactivada, con la marca "importado" y sin los permisos de cambiar el destino y de leer
   valores sensibles, y no se ejecuta hasta que el dev la active.
4. **Given** un archivo de más de 100 KB, que no es texto o que no se puede leer, **When** el dev
   lo importa, **Then** se rechaza con un mensaje que dice por qué.
5. **Given** un archivo `.ts` sin el comentario de configuración o con uno inválido, **When** el
   dev lo importa, **Then** se le avisa y el código se importa en una regla nueva, desactivada, que
   él configura.
6. **Given** un hook importado con errores de tipo, **When** el dev intenta activarlo, **Then** no
   puede, igual que con un hook escrito en el panel.
7. **Given** que el dev quiere escribir hooks fuera del navegador, **When** elige "Descargar
   tipos", **Then** descarga el archivo de tipos del contexto del hook para tener autocompletado
   en su editor.

---

### Edge Cases

- **Intento de escape del sandbox**: un hook que intenta usar `fetch`, XHR, WebSocket,
  `importScripts`, `chrome.*`, `document`, `window.parent`, `window.top` o leer las cookies o el
  almacenamiento de la pestaña falla: la llamada no llega a ningún sitio, la ejecución termina con
  error y el intercambio continúa sin cambios.
- **Bucle infinito o código síncrono pesado**: se corta a los 2 s (Historia 2).
- **Body binario, de más de 5 MB o no disponible**: el hook recibe el tipo y el tamaño pero no el
  contenido. Puede cambiar status, headers y URL; si fija un body de texto, ese texto reemplaza al
  original. Editar bodies binarios queda para la feature futura de edición de bodies no textuales.
- **Body declarado JSON pero inválido**: el body crudo llega como texto y el JSON analizado no
  está disponible; la utilidad `json()` falla con un mensaje claro si se usa.
- **Dos o más reglas con hook coinciden con el mismo intercambio en la misma etapa**: se ejecutan
  en cadena, en orden de prioridad, y cada hook recibe el resultado del anterior (FR-012). Si la
  regla más alta que coincide es de otra acción, se aplica solo esa, como en 002.
- **Un hook de la cadena falla**: sus cambios y los de `state` se descartan y la cadena sigue con
  el resultado del hook anterior; el error queda en la consola con su regla (FR-024).
- **Cadena larga o lenta**: no hay límite de tiempo para la cadena completa; todos los hooks que
  coinciden se ejecutan y cada uno tiene su corte de 2 s. Con hooks rotos la espera crece (hasta
  2 s por hook que se agota); la pestaña Hooks del request muestra la duración de cada hook y la
  de la cadena completa.
- **Un hook cambia el destino del request**: si su regla no tiene el permiso "Este hook puede
  cambiar el destino del request", cambiar el esquema, el host o el puerto es un resultado
  inválido y el request sale a su destino original; la consola explica que falta el permiso.
  Cambiar solo la ruta o la query no necesita el permiso. Con el permiso, el request va al nuevo
  destino, y Tráfico y la pestaña Hooks muestran el destino original y el nuevo.
- **Un hook de etapa Request responde y hay hooks de etapa Response que coinciden**: no hay
  respuesta del servidor que modificar; los hooks de etapa Response no se ejecutan, igual que una
  regla de etapa Response tras un Mock de 002.
- **Un hook devuelve un objeto con campos de solo lectura cambiados** (p. ej. el tipo de recurso):
  los cambios a campos de solo lectura se tratan como valor inválido.
- **El estado compartido supera su límite**: la ejecución termina con error de "estado demasiado
  grande" y sus cambios de `state` se descartan.
- **Un hook quita `Access-Control-Allow-Origin` con la relajación CORS activa**: la relajación se
  aplica después y el header vuelve a estar; la pestaña Hooks muestra el cambio del hook y Tráfico
  sigue marcando el request como relajado.
- **Requests simultáneos que cambian `state`**: dos ejecuciones paralelas que incrementan el mismo
  contador no pierden incrementos: la que guarda segunda se repite con el valor nuevo (FR-009).
  Un hook que solo lee `state` nunca se repite.
- **Un hook que falla siempre**: tras 5 errores seguidos se suspende hasta cerrar el panel y deja
  de retrasar la página; la regla guardada no cambia y "Reanudar" lo vuelve a ejecutar.
- **Se llena el espacio de hooks**: guardar o importar un hook que supere los 5 MB totales se
  rechaza con el uso actual; las reglas sin hook, los ajustes y los campos ignorados del diff se
  siguen guardando con normalidad.
- **Ráfaga de errores**: un hook que falla en cada request de una página con cientos de requests
  no satura el panel: la consola guarda las últimas 1,000 entradas y agrupa los errores
  repetidos del mismo hook.
- **El panel se cierra o el debugger se suelta durante una ejecución**: Chrome libera el
  intercambio, que continúa sin cambios; la ejecución se descarta.
- **Hook sobre un request del repeater en contexto de página**: se ejecuta como sobre cualquier
  request de la app, y el resultado del envío indica que actuó.
- **Hook que registra valores sensibles con `log()`**: los registros viven solo en memoria, se
  muestran como texto y se pierden al cerrar DevTools; nunca se guardan ni salen del navegador.
- **Hook que añade `<script>` a una respuesta HTML**: es un cambio legítimo del dev sobre su propia
  app; Nahual lo aplica. El riesgo de código de terceros se cubre con la importación desactivada
  y la vista previa (Historia 3).
- **Regla con hook guardada mientras tiene errores**: se puede guardar desactivada para seguir
  editándola más tarde; activarla exige que no tenga errores.

## Requirements *(mandatory)*

### Functional Requirements

**Acción y contexto**

- **FR-001**: Las reglas de 002 MUST admitir la acción "Modificar con hook" en las etapas Request
  y Response. Una regla con hook conserva el resto de lo que tiene una regla: sitio, prefiltro,
  tipos de recurso, condiciones, prioridad, activación y su efecto en el detalle del request.
- **FR-002**: Un hook MUST ser un único archivo de código cuya exportación por defecto es una
  función que recibe el contexto y devuelve el contexto modificado, nada (sin cambios) o una
  promesa de cualquiera de los dos.
- **FR-003**: En etapa Request, el contexto MUST exponer del request: URL, método, headers, body
  crudo como texto y body analizado si es JSON; y, si el request es GraphQL según la detección de
  002, su `operationName`. También MUST exponer, de solo lectura: tipo de recurso, etapa y el
  sitio de la página.
- **FR-004**: Los valores de los headers sensibles (mismo criterio que la redacción de 002:
  `Authorization`, `Proxy-Authorization`, `Cookie`, `Set-Cookie` y los que contienen `token`,
  `secret`, `session` o `api-key`) MUST llegar al hook enmascarados, salvo que su regla tenga
  marcado el permiso "Este hook puede leer valores sensibles", desmarcado por defecto. Un hook sin
  el permiso MUST poder fijar, reemplazar o quitar esos headers; si devuelve un header con el valor
  enmascarado sin cambiar, se conserva el valor original.
- **FR-005**: En etapa Response, el contexto MUST exponer la respuesta (status, headers, body crudo
  como texto y body analizado si es JSON) y, de solo lectura, el request que la produjo.
- **FR-006**: Si un body es binario, supera 5 MB o no está disponible, el contexto MUST indicar su
  tipo, su tamaño y el motivo en lugar del contenido.
- **FR-007**: El contexto MUST ofrecer utilidades para: leer el body como JSON, fijar y quitar
  headers, leer el `operationName` GraphQL y registrar mensajes (`log()`).
- **FR-008**: El contexto MUST ofrecer `state`, un almacén compartido por todos los hooks de la
  pestaña inspeccionada. Solo admite valores representables como JSON, hasta 1 MB en total. Dura
  mientras el panel está abierto: recargar la página o navegar MUST NOT vaciarlo. Al cerrar el
  panel se vacía, y el dev MUST poder vaciarlo con la acción "Vaciar estado" de la consola, que
  MUST poder deshacerse durante 10 s con el aviso de 004.
- **FR-009**: Las ejecuciones MUST poder correr en paralelo. Cada una trabaja sobre una copia de
  `state` y sus cambios se guardan al terminar. Si una ejecución cambió `state` y otra guardó
  cambios después de que la primera empezara, la primera MUST repetirse con el `state` nuevo,
  hasta 3 intentos en total; si sigue en conflicto, termina con error "conflicto de estado" y sus cambios se
  descartan. Solo cuentan los registros del último intento, y el límite de 2 s cubre todos los
  intentos.
- **FR-010**: Un hook MUST poder cambiar: en etapa Request, método, URL, headers y body; en etapa
  Response, status, headers y body. En etapa Request, un hook MUST poder además responder
  directamente con una respuesta (status, headers y body): el request no llega al servidor, la
  respuesta se valida como la de un Mock de 002 y los hooks de etapa Request que faltan en la
  cadena no se ejecutan. Cambiar el origen (esquema, host o puerto) de la URL MUST
  exigir que la regla tenga marcado el permiso "Este hook puede cambiar el destino del request",
  desmarcado por defecto; sin él, es un resultado inválido (FR-020). Cambiar la ruta o la query no
  lo necesita. Toda redirección MUST mostrar en Tráfico y en la pestaña Hooks el destino original
  y el nuevo.
- **FR-011**: Antes de aplicarse, el resultado de un hook MUST validarse con las reglas de 002
  para la etapa: status en 100–599, nombres y valores de header válidos, body de texto de hasta
  5 MB, método y URL válidos. Un resultado inválido no se aplica (FR-020).
- **FR-012**: Cuando la regla más alta que coincide con un intercambio en una etapa es una regla
  con hook, MUST ejecutarse en cadena cada regla con hook que coincide, en orden de prioridad, y
  cada hook recibe el resultado del anterior; las reglas de otras acciones que coinciden por
  debajo no se aplican. Si la regla más alta es de otra acción, se aplica solo esa (FR-016 de 002)
  y ningún hook se ejecuta. El resultado de cada hook se valida por separado (FR-011); un hook
  que falla no aporta cambios y la cadena sigue con el resultado anterior. La cadena MUST NOT
  tener un límite de tiempo propio: todos los hooks que coinciden se ejecutan, cada uno con su
  corte de 2 s (FR-021).
- **FR-013**: Con la relajación CORS de desarrollo de 003 activa, MUST aplicarse después de los
  hooks: sus headers `Access-Control-*` prevalecen sobre los que fije o quite un hook. Los
  preflight que la relajación responde localmente MUST NOT pasar por hooks.
- **FR-014**: Un hook que actúa MUST quedar reflejado como cualquier regla de 002: en la lista de
  Tráfico y en el detalle. El detalle MUST tener una pestaña Hooks con, por cada ejecución sobre
  ese intercambio: la regla, el resultado (aplicado, sin cambios, error o tiempo agotado), la
  duración, las partes que cambió y sus registros; con una cadena, además, la duración total.

**Editor**

- **FR-015**: El editor de reglas MUST mostrar, para la acción "Modificar con hook", un editor de
  código con resaltado, autocompletado del contexto y de sus utilidades con su descripción, y
  errores de sintaxis y de tipo marcados en su línea mientras se escribe.
- **FR-016**: Una regla con un hook que tiene errores MUST poder guardarse desactivada, y MUST NOT
  poder activarse hasta corregirlos; el motivo se indica junto al interruptor.
- **FR-017**: El editor MUST ofrecer las plantillas "Agregar header", "Cambiar un campo del JSON"
  y "Simular lista vacía". Como las plantillas de 002, una plantilla exige completar el prefiltro
  antes de guardar, para no afectar a todo el sitio por accidente.
- **FR-018**: El editor de código MUST ser operable solo con teclado, con una forma documentada
  y visible de salir de él con el teclado (dentro, Tab escribe una tabulación), anunciar los
  errores a los lectores de pantalla y seguir el tema claro u oscuro de DevTools.
- **FR-019**: El editor de código y la comprobación de tipos MUST cargarse solo al abrir un hook;
  abrir el panel MUST NOT cargarlos.

**Fallar de forma segura**

- **FR-020**: Si un hook lanza una excepción, devuelve un resultado inválido, tarda más de 2 s de
  ejecución (sin contar la preparación del entorno aislado) o
  intenta algo que el sandbox no permite, sus cambios MUST descartarse: el intercambio continúa
  con lo que tenía antes de ese hook (sin cambios si era el único o el primero de la cadena) y la
  página nunca queda esperando.
- **FR-021**: Un hook que no termina MUST cortarse a los 2 s sin afectar a las ejecuciones
  siguientes de ese ni de otros hooks.
- **FR-022**: Tras 5 ejecuciones seguidas de un hook que terminan con error (de cualquier tipo),
  ese hook MUST suspenderse hasta cerrar el panel: no se ejecuta y, en una cadena, se salta. La
  regla guardada no cambia. Un aviso y la lista de reglas MUST indicar la suspensión y su motivo,
  con la acción "Reanudar". Una ejecución correcta pone a cero la cuenta; reanudar o guardar un
  cambio en el hook lo reanuda.
- **FR-023**: Los cambios de `state` de una ejecución que termina con error o tiempo agotado MUST
  descartarse.
- **FR-024**: Cada error MUST mostrarse con su tipo (excepción, resultado inválido, tiempo
  agotado, conflicto de estado, acceso no permitido), el mensaje, la línea del código del dev
  cuando se conoce, la regla y el request afectado (método y URL), con una acción para abrir ese
  request en Tráfico.
- **FR-025**: Los hooks MUST NOT ejecutarse con "pausar Nahual" activado ni con la regla
  desactivada, y solo actúan mientras Nahual está adjunto a la pestaña.

**Consola de hooks**

- **FR-026**: El cajón inferior de 004 MUST alojar la consola de hooks: registros y errores de las
  ejecuciones, cada uno con la hora, la regla y el request. Se puede filtrar por nivel (registro o
  error) y por regla. "Limpiar consola" vacía la lista como en DevTools y se puede deshacer durante
  10 s.
- **FR-027**: La consola MUST guardar como máximo las últimas 1,000 entradas y agrupar con un
  contador, como Console de DevTools, los errores consecutivos del mismo hook con el mismo mensaje. Cada registro se muestra como texto y se recorta a
  10 KB.
- **FR-028**: La barra superior MUST mostrar un elemento de estado con el número de errores de
  hooks sin leer, que abre la consola (previsto en FR-025 de 004). Sin errores no ocupa espacio.
- **FR-029**: Registros, errores y `state` MUST vivir solo en memoria del panel: no se guardan, no
  se exportan y se pierden al cerrar DevTools.
- **FR-030**: Los registros de la consola de hooks MUST redactar por defecto los valores sensibles
  que contengan, con el criterio del diff de 005: headers, claves JSON y parámetros de query con
  nombre sensible (el de 002 más `password`). "Mostrar valores sensibles" los revela en memoria
  hasta cerrar la consola. Un hook con el permiso de leer valores sensibles no cambia esta regla.

**Aislamiento y seguridad**

- **FR-031**: El código de un hook MUST ejecutarse aislado: sin acceso a la red por ningún medio,
  a las APIs de la extensión, a la página inspeccionada (DOM, cookies, almacenamiento), al panel
  ni a otros datos de Nahual. Solo recibe su contexto y devuelve su resultado.
- **FR-032**: Todo intento de salir del aislamiento MUST fallar y quedar como error de la
  ejecución, sin efecto sobre el intercambio. La lista mínima de vectores que se prueba: red
  (`fetch`, XHR, WebSocket, `EventSource`, `importScripts`, `sendBeacon`), APIs de la extensión,
  acceso a la ventana contenedora (`parent`, `top`, `opener`), la página inspeccionada y sus
  cookies y almacenamiento.
- **FR-033**: Nahual MUST aceptar el resultado de una ejecución solo si viene del entorno aislado
  que la ejecutó y corresponde a la ejecución pedida; cualquier otro mensaje se descarta.
- **FR-034**: El código de un hook se guarda con su regla, localmente, como el resto de las reglas
  de 002, con un máximo de 100 KB por hook y de 5 MB entre todos los hooks. Guardar o importar un
  hook que supere cualquiera de los dos límites MUST rechazarse con un mensaje que muestra el uso
  actual (p. ej. "Los hooks ocupan 4,8 de 5 MB"), sin afectar a lo ya guardado. El editor de
  hooks MUST mostrar ese uso.

**Compartir**

- **FR-035**: El dev MUST poder exportar el hook de una regla como un archivo `.ts` con la
  configuración de la regla (nombre, etapa, prefiltro, tipos de recurso y condiciones) en un
  comentario al inicio y el código del hook debajo. El archivo MUST seguir siendo TypeScript
  válido. Los permisos de cambiar el destino y de leer valores sensibles no se exportan.
- **FR-036**: El dev MUST poder importar un archivo `.ts` de hasta 100 KB. Si trae una
  configuración válida, se crea una regla nueva con ella en el sitio actual; si no la trae o es
  inválida, se avisa del motivo y el código se importa en una regla nueva que el dev configura.
  Importar nunca reemplaza el código de una regla existente. Antes de confirmar, MUST ver la
  configuración que se aplicará y el código completo como texto, sin que se ejecute nada.
- **FR-037**: Una regla con hook importado MUST guardarse desactivada, marcada como "importado" y
  sin los permisos de cambiar el destino y de leer valores sensibles, hasta que el dev la active y,
  si quiere, marque los permisos; activarla exige que no tenga errores (FR-016).
- **FR-038**: Un archivo de más de 100 KB, que no es texto UTF-8 o que no se puede leer MUST
  rechazarse con un mensaje que dice por qué.
- **FR-039**: El dev MUST poder descargar el archivo de tipos del contexto del hook para escribir
  hooks en su propio editor con autocompletado.

**Calidad del panel**

- **FR-040**: Toda la interfaz nueva (acción, editor, plantillas, pestaña Hooks, consola,
  elemento de estado, importar y exportar) MUST seguir los patrones del panel de 004 (barras,
  pestañas, detalle, densidad de DevTools), estar en español e inglés, ser operable solo con
  teclado, funcionar a 320 px y no tener violaciones serias o críticas de accesibilidad en
  ningún tema.

### Key Entities

- **Archivo de hook**: el `.ts` exportado; configuración de la regla en un comentario al inicio y
  código del hook debajo (FR-035).
- **Hook**: el código de una regla con la acción "Modificar con hook". Pertenece a una regla (y
  por tanto a un sitio, una etapa y una prioridad); tiene el código fuente, si tiene errores, si
  es importado, los permisos de cambiar el destino y de leer valores sensibles (desmarcados por
  defecto) y su tamaño (≤ 100 KB; ≤ 5 MB entre todos los hooks).
- **Contexto del hook**: lo que recibe una ejecución. Request (y respuesta en etapa Response) con
  sus partes editables y de solo lectura, `state`, `log()` y utilidades.
- **Ejecución**: aplicación de un hook a un intercambio. Regla, intercambio, etapa, resultado
  (aplicado, sin cambios, error, tiempo agotado), duración, partes cambiadas, registros y error.
  En memoria.
- **Estado compartido**: valores JSON compartidos por los hooks de la pestaña inspeccionada,
  hasta 1 MB, mientras el panel está abierto.
- **Entrada de consola**: registro o error de una ejecución, con hora, regla y request. Máximo
  1,000, en memoria.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: El 100 % de los vectores de escape de FR-032 fallan sin efecto sobre el intercambio,
  sobre la página ni sobre la red.
- **SC-002**: Un hook trivial (devuelve el contexto sin cambios) añade menos de 10 ms en p95 a un
  intercambio, medido igual que el overhead de 001 (E4).
- **SC-003**: Con un hook que lanza, devuelve un valor inválido, tarda 5 s o no termina, el 100 %
  de los intercambios afectados llegan a la página sin cambios en ≤ 2,5 s, y el siguiente
  intercambio que cumple la regla se procesa con normalidad.
- **SC-004**: Un dev que nunca usó hooks crea, a partir de una plantilla, un hook que cambia un
  campo de una respuesta JSON y lo ve en su app en menos de 3 minutos.
- **SC-005**: El autocompletado y los errores de tipo aparecen en menos de 1 s tras dejar de
  escribir, en un hook de 200 líneas.
- **SC-006**: Un hook importado se ejecuta 0 veces antes de que el dev lo active.
- **SC-007**: Abrir el panel no tarda más que en 005 (diferencia ≤ 10 %) y su carga inicial no
  crece por el editor de código.
- **SC-008**: El 100 % de los errores de ejecución aparecen en la consola en menos de 1 s con la
  regla y el request, y con la línea del código del dev en las excepciones lanzadas por su
  código.
- **SC-009**: Con una cadena de tres hooks que coinciden, el 100 % de los intercambios reciben los
  tres cambios en orden de prioridad; si el hook del medio falla, reciben los cambios del primero
  y del tercero.
- **SC-010**: Ningún hook sin el permiso de cambiar el destino logra que un request salga hacia
  otro origen (0 casos en la prueba).
- **SC-011**: Ningún valor de un header sensible llega a un hook sin el permiso de leer valores
  sensibles, ni a través de sus registros, su resultado o `state` (0 casos en la prueba).
- **SC-012**: Con 20 requests simultáneos que pasan por un hook que incrementa un contador en
  `state`, el contador termina en 20.
- **SC-013**: Un hook que agota su tiempo en cada request deja de retrasar la página tras su
  quinto error: los requests siguientes no esperan por él.
- **SC-014**: Un hook que registra un objeto con `access_token`, el objeto de headers con `Authorization` y una URL
  con `?token=` muestra los tres valores redactados en la consola mientras el dev no pida verlos.

## Assumptions

- Cada hook es un archivo aislado: no puede importar código de otros hooks ni de paquetes.
  Compartir utilidades entre hooks queda fuera de alcance.
- `state` es por pestaña inspeccionada, sobrevive a recargas y navegaciones y se vacía al cerrar
  el panel (FR-008). No persiste entre sesiones, igual que el historial de 002 y el repeater de
  005.
- El archivo de tipos se descarga desde el panel (FR-039). Publicarlo como paquete en un registro
  público queda fuera de alcance: Nahual no tiene red propia y la publicación pertenece a 007.
- Se admite el TypeScript habitual de una función; enums y decoradores no se admiten en hooks
  (decisión D2 de 001).
- Los hooks se ejecutan en el entorno aislado del panel, así que solo actúan con el panel abierto,
  igual que el debugger (constitución).
- El límite de 2 s cubre la ejecución completa, también la parte asíncrona, pero no la
  preparación del entorno aislado (que el panel adelanta al abrirse si hay hooks activos).
- La redacción de valores sensibles de 002 aplica donde Nahual muestra headers, y la de 005 a los
  registros de `log()` (FR-030); esos registros, además, nunca salen de la memoria del panel
  (FR-029).
- El enmascarado para hooks cubre los headers sensibles (FR-004), donde viajan las credenciales
  de la sesión. Los campos sensibles dentro del body o de la query no se enmascaran: el hook los
  necesita para transformar el contenido y un valor enmascarado rompería el JSON que devuelve.
- Los envíos del repeater en contexto limpio (005) no salen de la pestaña ni pasan por las reglas,
  así que tampoco por los hooks; los de contexto de página sí.
- Los límites de body (5 MB) y de reglas (500) son los de 002. El de 100 KB por hook es el del
  archivo importado. El total de 5 MB deja espacio a reglas, ajustes y campos ignorados dentro del
  almacenamiento local por defecto de la extensión, sin pedir permisos nuevos.
- Fuera de alcance: probar un hook "en seco" contra un request capturado sin activarlo, hooks con
  acceso a la red, editar bodies binarios o multipart, bibliotecas de hooks de equipo (plan de
  pago), WebSockets y exportar la configuración completa (007).
- Pendiente de 001 sin bloquear esta feature: E5/T066, T067 y la definición de "en conflicto".
