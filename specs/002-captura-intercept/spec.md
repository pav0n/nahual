# Feature Specification: Captura de tráfico e intercept condicional

**Feature Branch**: `002-captura-intercept`

**Created**: 2026-10-22

**Status**: Draft

**Input**: User description: "Especifica la captura de tráfico y el intercept condicional de
Nahual" — primera versión usable: ver el tráfico de la pestaña, crear reglas y pausar o modificar
solo lo que cumple una condición, con un primer uso comprensible. Entrada completa en
`docs/speckit-inputs/02-captura-intercept.md`. Depende de `001-spike-cdp`.

## Clarifications

### Session 2026-10-22

- Q: ¿Las reglas aplican en todas las pestañas y sitios, o se guardan por sitio de la app donde
  se crean? → A: Por sitio: cada regla pertenece al sitio (origen de la página inspeccionada)
  donde se creó y solo aplica en pestañas de ese sitio; la lista muestra primero las del sitio
  actual.
- Q: Después del primer uso, ¿Nahual adjunta el debugger solo al abrir su panel o el dev pulsa
  "Adjuntar" cada vez? → A: Automático tras el primer consentimiento: el último paso del
  onboarding pide adjuntar; después, abrir el panel adjunta solo, y un ajuste permite volver al
  modo explícito.
- Q: En el detalle, ¿los valores de headers sensibles se ven completos o enmascarados por
  defecto? → A: Enmascarados por defecto en el detalle y la cola, con "Mostrar" por valor; en el
  editor de un intercambio pausado el valor real se usa y se ve al editar ese campo.
- Q: ¿Qué plantillas de regla trae Nahual desde el inicio? → A: Cuatro: "Pausar respuestas con
  error" (status ≥ 400), "Pausar respuestas vacías" (JSONPath `$` está vacío), "Simular API
  caída" (Mock 503) y "Simular red lenta" (Retrasar 3,000 ms).

## User Scenarios & Testing *(mandatory)*

> Glosario: **intercambio** = un request y su response tal como los ve Nahual; **regla** =
> filtro + condiciones + acción; **etapa** = momento en que se evalúa una regla: *Request* (antes
> de que el request salga a la red) o *Response* (cuando llega la respuesta, antes de que la
> página la reciba); **cola** = los intercambios pausados de la pestaña esperando decisión.

### User Story 1 - Ver el tráfico de la pestaña (Priority: P1)

Como dev, quiero ver los requests de la pestaña con su detalle, para entender qué hace mi app.

**Why this priority**: es la base de todo lo demás: sin ver el tráfico no se pueden escribir
reglas con sentido, y por sí sola ya sustituye parte de lo que el dev hace hoy en la pestaña
Network.

**Independent Test**: con el panel abierto y el debugger adjunto, se carga una app de prueba que
hace requests JSON, binarios, grandes y con error; se verifica la lista, los filtros, el detalle
y la limpieza con deshacer, sin crear ninguna regla.

**Acceptance Scenarios**:

1. **Given** el debugger adjunto, **When** la página hace requests, **Then** cada intercambio
   aparece en la lista con método, URL, status, tipo de recurso, tamaño y tiempo total, en orden
   de inicio, y se actualiza cuando llega su respuesta.
2. **Given** una lista con intercambios, **When** el dev escribe un texto, una regex, un status
   (código exacto o clase como `4xx`) o elige uno o varios tipos de recurso, **Then** la lista
   muestra solo los intercambios que cumplen todos los filtros activos y un contador de "N de M".
3. **Given** un filtro por regex inválida, **When** el dev la escribe, **Then** el campo indica el
   error y la lista conserva el último filtro válido.
4. **Given** un intercambio con body JSON, **When** el dev abre su detalle, **Then** ve los
   headers de request y response y ambos bodies, con el JSON formateado y legible; los valores
   de headers sensibles aparecen enmascarados y cada uno tiene "Mostrar".
5. **Given** un intercambio con body binario (imagen, fuente, archivo) o mayor que 5 MB, **When**
   el dev abre su detalle, **Then** ve solo los metadatos del body (tipo y tamaño) y un aviso de
   por qué no se muestra.
6. **Given** 2,000 intercambios en el historial de la pestaña, **When** llega uno nuevo, **Then**
   se descarta el más antiguo y el panel indica que el historial está en su tope.
7. **Given** un historial con intercambios, **When** el dev pulsa "Limpiar", **Then** la lista
   queda vacía y durante al menos 10 s puede "Deshacer" para recuperarla completa.

---

### User Story 2 - Pausar solo lo que cumple una condición (Priority: P1)

Como dev, quiero que la app se detenga solo cuando una API responda con error o datos vacíos,
para editar esa respuesta sin pausar todo lo demás.

**Why this priority**: es la propuesta de valor central de Nahual frente a pausar todo o a los
mocks estáticos: depurar el caso raro sin frenar el resto de la app.

**Independent Test**: con una app de prueba cuya API responde 200 con datos, 200 vacío y 500, se
crea una regla "Response, status ≥ 500 o `$.items` vacío" (como dos reglas) y se verifica que solo
esos intercambios se pausan, que se pueden editar y continuar, y que el resto llega a la página
sin retraso perceptible.

**Acceptance Scenarios**:

1. **Given** el editor de reglas, **When** el dev define una regla con prefiltro de URL (glob o
   regex), métodos, tipos de recurso, etapa y condiciones, y la guarda, **Then** la regla queda
   activa para el sitio de la pestaña, aparece en la lista de reglas y se conserva al cerrar y
   reabrir el panel o el navegador.
2. **Given** una regla creada en el sitio `http://localhost:3000`, **When** el dev inspecciona una
   pestaña de otro sitio, **Then** esa regla no se aplica allí y la lista de reglas muestra primero
   las del sitio actual.
3. **Given** una regla de etapa Response con condición "status ≥ 500", **When** la API responde
   500, **Then** la respuesta queda pausada en la cola; **When** responde 200, **Then** llega a la
   página sin pausa.
4. **Given** una regla de etapa Response con condición JSONPath "`$.items` está vacío", **When**
   la API responde `{"items": []}`, **Then** la respuesta queda pausada; con `{"items": [1]}` no.
5. **Given** una regla GraphQL de etapa Response con condición "operationName = `GetUser`" y
   "hay `errors`", **When** la operación `GetUser` responde con un arreglo `errors` no vacío,
   **Then** la respuesta queda pausada; otras operaciones al mismo endpoint no se pausan.
6. **Given** una regla de etapa Request con condición de header, query param, método, JSONPath o
   operationName, **When** un request la cumple, **Then** queda pausado antes de salir a la red.
7. **Given** un intercambio pausado en etapa Request, **When** el dev lo abre, **Then** puede
   editar método, URL, headers y body y elegir Continuar (con cambios), Continuar sin cambios,
   Responder con mock o Abortar; el servidor recibe exactamente lo editado.
8. **Given** un intercambio pausado en etapa Response, **When** el dev lo abre, **Then** puede
   editar status, headers y body y elegir Continuar (con cambios), Continuar sin cambios,
   Responder con mock (reemplazar la respuesta completa) o Abortar; la página recibe exactamente
   lo editado.
9. **Given** un intercambio pausado, **When** pasa el tiempo, **Then** el panel muestra una
   cuenta regresiva (60 s por defecto); al llegar a cero el intercambio continúa sin cambios y su
   entrada en el historial lo registra como "continuado por timeout".
10. **Given** tres intercambios pausados, **When** el dev los mira, **Then** aparecen en orden de
   llegada y puede resolver cualquiera primero sin afectar a los demás ni a sus cuentas
   regresivas.
11. **Given** reglas activas, **When** pasan requests que no las cumplen, **Then** llegan a la
    página sin retraso perceptible (ver SC-002).
12. **Given** una regla con regex inválida en el prefiltro o en una condición, **When** el dev
    intenta guardarla, **Then** se rechaza con un mensaje que indica qué campo falla y por qué, y
    la regla anterior (si existía) no cambia.

---

### User Story 3 - Primer uso comprensible (Priority: P1)

Como usuario nuevo, quiero entender por qué Chrome muestra la barra "está depurando este
navegador" y qué ve Nahual, para confiar en la herramienta.

**Why this priority**: sin confianza el dev cierra la extensión al ver la barra amarilla; y
sin un camino guiado no llega a su primera pausa (SC-001).

**Independent Test**: con un perfil de Chrome limpio, se instala la extensión, se abre el panel
por primera vez y se verifica el onboarding, el indicador de estado y el estado vacío con la
plantilla, hasta pausar la primera respuesta con error.

**Acceptance Scenarios**:

1. **Given** el primer uso del panel, **When** se abre, **Then** se muestra un onboarding de 3
   pasos o menos que explica: la barra amarilla de Chrome y por qué aparece, qué datos ve Nahual
   (todo el tráfico de la pestaña, incluidas credenciales) y que nada sale del navegador.
2. **Given** el onboarding, **When** el dev lo completa u omite, **Then** no vuelve a mostrarse
   automáticamente, pero puede reabrirse desde la ayuda del panel.
3. **Given** el último paso del onboarding, **When** el dev pulsa "Adjuntar y empezar", **Then**
   el debugger se adjunta y queda registrado su consentimiento; si omite el onboarding, el
   debugger no se adjunta hasta que pulse "Adjuntar".
4. **Given** el consentimiento ya dado y el modo automático activo, **When** el dev abre el panel
   de Nahual en una pestaña, **Then** el debugger se adjunta sin otro paso; **When** desactiva el
   adjunto automático en los ajustes, **Then** las siguientes aperturas esperan a que pulse
   "Adjuntar".
5. **Given** el panel abierto, **When** el debugger cambia de estado (adjunto, desconectado,
   conectando, error), **Then** un indicador siempre visible muestra el estado con texto (no solo
   color) y ofrece la acción que corresponde: "Soltar" si está adjunto, "Reconectar" si no.
6. **Given** que no hay reglas, **When** el dev abre la lista de reglas, **Then** ve un estado
   vacío que explica para qué sirven, con la acción "Crea tu primera regla" y las plantillas de
   FR-018, con "Pausar respuestas con error" como la primera sugerida.
7. **Given** el estado vacío, **When** el dev elige la plantilla "Pausar respuestas con error",
   **Then** se abre el editor con una regla de etapa Response, tipos de recurso Fetch/XHR y
   condición "status ≥ 400" lista para guardar o ajustar.
8. **Given** el debugger adjunto sin tráfico capturado, **When** el dev mira la lista de tráfico,
   **Then** ve un estado vacío que sugiere recargar la página para capturar sus requests.

---

### User Story 4 - Mock, fallo y retraso automáticos (Priority: P2)

Como dev, quiero que una regla actúe sola (responder con un mock, fallar, retrasar o solo
registrar), para reproducir escenarios sin tener que intervenir cada vez.

**Why this priority**: amplía el valor de las reglas a escenarios repetibles (API caída, red
lenta, backend que aún no existe), pero el flujo de pausar y editar ya es útil sin esto.

**Independent Test**: con la app de prueba, se crean reglas con cada acción y se verifica en la
página el resultado de cada una, la prioridad entre reglas que coinciden y los interruptores.

**Acceptance Scenarios**:

1. **Given** una regla con acción Mock (status, headers y body), **When** un request la cumple en
   etapa Request, **Then** la página recibe el mock y el request nunca llega al servidor.
2. **Given** una regla con acción Fallar y un error de red elegido de la lista, **When** un request
   la cumple, **Then** la página recibe ese error de red.
3. **Given** una regla con acción Retrasar N ms, **When** un request la cumple, **Then** el
   intercambio continúa sin cambios tras al menos N ms y el resto del tráfico no se retrasa.
4. **Given** una regla con acción Solo registrar, **When** un request la cumple, **Then** continúa
   sin cambios y su entrada en el historial queda marcada con el nombre de la regla.
5. **Given** dos reglas activas que coinciden con el mismo intercambio en la misma etapa, **When**
   llega, **Then** se aplica solo la que está más arriba en la lista de reglas; **When** el dev
   reordena la lista (con ratón o teclado), **Then** la nueva prioridad se aplica a los siguientes
   intercambios.
6. **Given** una regla desactivada, **When** un request la cumpliría, **Then** no se aplica.
7. **Given** la plantilla "Simular API caída" o "Simular red lenta", **When** el dev la elige,
   **Then** el editor se abre con la acción ya configurada (Mock 503 o Retrasar 3,000 ms) y el foco
   en el prefiltro de URL, que debe completar antes de guardar.
8. **Given** el interruptor global "pausar Nahual" activado, **When** pasa cualquier request,
   **Then** ninguna regla se aplica, la captura de tráfico continúa y el indicador de estado lo
   muestra.

---

### Edge Cases

- **Navegación con items en cola**: al navegar la pestaña a otro documento, los intercambios
  pausados del documento anterior se retiran de la cola, se registran como "descartados por
  navegación" y no quedan pausas pendientes; el historial se conserva.
- **Cierre de la pestaña o del panel con items en cola**: se suelta el debugger y todo intercambio
  pausado continúa sin cambios (o lo descarta el navegador si ya no tiene destino); no queda nada
  pendiente.
- **Debugger soltado con items pausados** (por el dev, por la barra de Chrome o por otro motivo):
  los intercambios pausados continúan sin cambios, la cola se vacía con un aviso y el indicador
  ofrece "Reconectar".
- **Regex inválida o patrón vacío**: se rechaza al guardar con mensaje claro; nunca se guarda una
  regla que no se puede evaluar.
- **Reglas guardadas corruptas o de versión incompatible**: al cargarlas, las inválidas se
  descartan con un aviso que dice cuántas y por qué; las válidas siguen funcionando.
- **Bodies comprimidos**: el detalle, las condiciones JSONPath y el editor trabajan sobre el
  contenido descomprimido; al continuar con un body editado, la página recibe un contenido
  coherente con sus headers (sin declarar una compresión que el body ya no tiene).
- **Redirecciones**: no tienen body; el detalle lo indica, una condición sobre el body se
  considera no cumplida y al pausar no se ofrece editar el body.
- **Body > 5 MB o binario en una condición JSONPath**: la condición se considera no cumplida, el
  intercambio continúa sin retraso y su entrada indica "condición no evaluable".
- **Body editado inválido**: si el content-type es JSON y el body editado no es JSON válido, se
  avisa pero se permite continuar (el dev puede querer probar ese caso).
- **Valores editados inválidos** (status fuera de 100–599, URL mal formada, nombre de header
  inválido): se rechazan en el editor con mensaje; si aun así falla la aplicación del cambio, el
  intercambio continúa sin modificar y se muestra el error con causa.
- **"Continuar todos" con ediciones en curso**: se pide confirmación antes de descartar las
  ediciones; cancelar deja la cola intacta.
- **Cola saturada**: si la cola alcanza 100 intercambios pausados en la pestaña, los siguientes
  que cumplan una regla de Pausar continúan sin cambios y se registran como "cola llena".
- **Regla editada o eliminada con items pausados**: los ya pausados siguen en la cola; el cambio
  aplica a los siguientes intercambios. Eliminar una regla se puede deshacer.
- **Interruptor global activado con items pausados**: los ya pausados siguen en la cola para no
  perder ediciones en curso; el dev puede resolverlos o "Continuar todos".
- **Header sensible sin tocar en una edición**: al continuar con cambios en otros campos, el
  header enmascarado viaja con su valor real, nunca con la máscara.
- **Timeout mientras se edita**: al vencer, el intercambio continúa sin cambios y el panel avisa
  que la edición no se aplicó.
- **Preflight CORS (OPTIONS)**: se captura y se le aplican reglas como a cualquier request; la
  lista lo distingue como preflight.
- **Varias pestañas**: historial, cola y estado del debugger son independientes por pestaña; dos
  pestañas del mismo sitio comparten sus reglas.
- **Navegación a otro sitio**: al cambiar el origen de la página inspeccionada, dejan de aplicarse
  las reglas del sitio anterior y empiezan a aplicarse las del nuevo, sin soltar el debugger.
- **Requests anteriores al adjunto**: no se capturan; el estado vacío sugiere recargar.

## Requirements *(mandatory)*

### Functional Requirements

**Captura y visualización**

- **FR-001**: Con el debugger adjunto, el sistema MUST capturar los intercambios de la pestaña
  inspeccionada, incluso sin reglas activas, sin modificarlos ni retrasarlos.
- **FR-002**: La lista de tráfico MUST mostrar por intercambio: método, URL, status (o estado
  pendiente/fallido), tipo de recurso, tamaño transferido y tiempo total; e indicar si una regla
  actuó sobre él y cuál.
- **FR-003**: La lista MUST filtrarse por texto (subcadena de la URL), regex sobre la URL, status
  (código exacto o clase `1xx`–`5xx`) y tipo de recurso (uno o varios), combinados con Y, y
  mostrar el conteo filtrado frente al total.
- **FR-004**: El detalle MUST mostrar headers de request y response y los bodies de ambos como
  texto; el JSON válido se muestra formateado; los bodies binarios o mayores que 5 MB se muestran
  solo como metadatos (tipo y tamaño) con el motivo.
- **FR-004a**: Los valores de headers sensibles MUST mostrarse enmascarados por defecto en el
  detalle y en la cola de pausados, con una acción "Mostrar" por valor que dura hasta cerrar ese
  detalle. Son sensibles: `Authorization`, `Proxy-Authorization`, `Cookie`, `Set-Cookie` y todo
  header cuyo nombre contenga `token`, `secret`, `session`, `api-key` o `apikey` (sin distinguir
  mayúsculas). Copiar un valor enmascarado copia la máscara, salvo que se haya mostrado.
- **FR-004b**: En el editor de un intercambio pausado, un header sensible MUST conservar su valor
  real si no se toca; al editar ese campo se muestra el valor real. Enmascarar nunca cambia lo
  que recibe el servidor o la página.
- **FR-005**: El historial MUST tener un tope de 2,000 intercambios por pestaña; al superarlo se
  descarta el más antiguo y el panel indica que está en el tope.
- **FR-006**: El dev MUST poder limpiar el historial y deshacer la limpieza durante al menos 10 s.
- **FR-007**: El historial MUST vivir solo en memoria mientras el panel está abierto en esa
  pestaña; no se escribe en disco y se pierde al cerrar el panel.

**Reglas**

- **FR-008**: Una regla MUST tener: nombre, prefiltro de URL (glob o regex), métodos (todos o una
  lista), tipos de recurso (todos o una lista), etapa (Request o Response), cero o más
  condiciones que deben cumplirse todas (Y), una acción y un estado activo/inactivo.
- **FR-009**: Las condiciones de etapa Request MUST incluir: método; header (por nombre sin
  distinguir mayúsculas: existe, no existe, igual, contiene, coincide con regex); query param
  (mismos operadores); JSONPath sobre el body; operationName de GraphQL (igual, distinto, coincide
  con regex).
- **FR-010**: Las condiciones de etapa Response MUST incluir: status (comparación `=`, `≠`, `<`,
  `≤`, `>`, `≥`; rango inclusivo; lista de códigos); header; JSONPath sobre el body;
  operationName de GraphQL (tomado del request); presencia de `errors` no vacío en una respuesta
  GraphQL.
- **FR-011**: Las condiciones JSONPath MUST ofrecer los operadores: existe, no existe, igual,
  distinto, contiene, coincide con regex, está vacío (arreglo, objeto o texto vacío, o nulo), no
  está vacío, y comparaciones numéricas (`<`, `≤`, `>`, `≥`).
- **FR-012**: Toda condición que no pueda evaluarse (body ausente, binario, mayor que 5 MB, JSON
  inválido, request que no es GraphQL) MUST considerarse no cumplida, sin retrasar el intercambio,
  y la entrada del historial MUST indicarlo.
- **FR-013**: El sistema MUST validar una regla al guardarla (regex compilable, JSONPath válido,
  status en 100–599, rangos con mínimo ≤ máximo, acción completa, límites de tamaño) y rechazarla con un mensaje que
  indique el campo y la causa.
- **FR-014**: Las reglas MUST persistir localmente entre sesiones del navegador y validarse al
  leerse; una regla inválida se descarta con aviso sin afectar a las demás.
- **FR-014a**: Cada regla MUST pertenecer al sitio (origen: esquema, host y puerto de la página
  inspeccionada) donde se creó y aplicarse solo en pestañas cuya página tenga ese origen; la
  lista de reglas MUST mostrar primero las del sitio actual e indicar a qué sitio pertenece cada
  una.
- **FR-015**: El dev MUST poder crear, editar, duplicar, activar/desactivar, reordenar (también
  con teclado) y eliminar reglas; eliminar se puede deshacer.
- **FR-016**: Si varias reglas activas coinciden con un intercambio en la misma etapa, MUST
  aplicarse solo la que está más arriba en la lista. Una regla de etapa Request y otra de etapa
  Response pueden aplicarse ambas al mismo intercambio.
- **FR-017**: Un interruptor global "pausar Nahual" MUST detener la aplicación de todas las reglas
  sin detener la captura; su estado MUST persistir entre sesiones y ser visible en el indicador
  desde que se abre el panel.
- **FR-018**: El sistema MUST incluir cuatro plantillas, todas con tipos de recurso Fetch/XHR:
  "Pausar respuestas con error" (etapa Response, status ≥ 400, prefiltro `*`); "Pausar respuestas
  vacías" (etapa Response, JSONPath `$` está vacío, prefiltro `*`); "Simular API caída" (etapa
  Request, Mock con status 503 y body JSON de error) y "Simular red lenta" (etapa Request,
  Retrasar 3,000 ms). Las dos últimas abren el editor con el prefiltro de URL vacío y exigen
  completarlo antes de guardar, para no afectar a todo el sitio por accidente. Una plantilla solo
  rellena el editor; nada se guarda hasta que el dev confirma.

**Acciones y cola de pausados**

- **FR-019**: Las acciones de una regla MUST ser: Pausar; Mock (status, headers y body; en etapa
  Request responde sin tocar la red, en etapa Response reemplaza la respuesta recibida); Fallar
  (error de red elegido de una lista: fallido, abortado, timeout, conexión rechazada, nombre no
  resuelto, acceso denegado, sin conexión); Retrasar (1–60,000 ms) y Solo registrar.
- **FR-020**: Al pausar, el panel MUST mostrar el intercambio editable (Request: método, URL,
  headers, body; Response: status, headers, body) con las acciones Continuar, Continuar sin
  cambios, Responder con mock y Abortar.
- **FR-021**: Lo que el dev edita y confirma MUST ser exactamente lo que recibe el servidor
  (Request) o la página (Response); si el cambio no puede aplicarse, el intercambio MUST continuar
  sin modificar y el panel MUST mostrar el error con causa y solución.
- **FR-022**: Todo intercambio pausado MUST mostrar una cuenta regresiva; el timeout MUST ser
  configurable entre 5 y 300 s (60 s por defecto) y al vencer el intercambio continúa sin cambios
  y se registra en su entrada del historial.
- **FR-023**: Los pausados MUST formar una cola por pestaña en orden de llegada, con un máximo de
  100; cada uno se resuelve en cualquier orden de forma independiente. Al llenarse, los nuevos
  continúan sin cambios y se registran.
- **FR-024**: El dev MUST poder "Continuar todos" sin cambios con un solo gesto. Si algún item
  tiene una edición sin aplicar, MUST pedirse confirmación indicando cuántas ediciones se
  perderán; sin ediciones pendientes no se pide.
- **FR-025**: Al navegar la pestaña, cerrarla, cerrar el panel o soltarse el debugger, el sistema
  MUST resolver toda la cola (continuar sin cambios o descartar si ya no tiene destino) y no
  dejar ninguna pausa pendiente.
- **FR-026**: Los intercambios que no cumplen ninguna regla MUST llegar a la página sin retraso
  perceptible (SC-002), y sin reglas activas el sistema MUST NOT interceptar, solo capturar.

**Primer uso, estado y UX**

- **FR-027**: En el primer uso, el panel MUST mostrar un onboarding de 3 pasos o menos (barra de
  aviso de Chrome, qué datos ve Nahual, que nada sale del navegador), omisible y reabrible desde
  la ayuda; su último paso ofrece "Adjuntar y empezar".
- **FR-027a**: Tras el primer consentimiento (adjuntar desde el onboarding o con "Adjuntar"),
  abrir el panel MUST adjuntar el debugger automáticamente a esa pestaña; un ajuste MUST permitir
  desactivar el adjunto automático. Sin consentimiento, el debugger nunca se adjunta solo, y
  nunca se adjunta con el panel cerrado.
- **FR-027b**: Si el dev pulsa "Soltar", el debugger MUST quedar suelto en esa pestaña hasta que
  pulse "Reconectar" o cierre y vuelva a abrir el panel; Nahual no lo readjunta por su cuenta,
  tampoco cuando el panel reconecta su puerto tras un reinicio del proceso en segundo plano. Sin un
  "Soltar" previo, esa reconexión sí readjunta si el adjunto automático está activo.
- **FR-028**: El panel MUST mostrar siempre el estado del debugger con texto e icono, la cantidad
  de reglas activas, el tamaño de la cola y si "pausar Nahual" está activo, con la acción
  "Soltar" o "Reconectar" según corresponda.
- **FR-029**: Las listas de tráfico, reglas y cola MUST tener estados vacío, de carga y de error
  que expliquen qué pasa y qué hacer; el de reglas incluye "Crea tu primera regla" y las
  plantillas de FR-018.
- **FR-030**: Las acciones frecuentes MUST tener atajo de teclado: pausar/reanudar Nahual,
  continuar todos, continuar el item seleccionado y buscar en el tráfico; todo el panel es
  operable solo con teclado.
- **FR-031**: El panel MUST cumplir WCAG 2.2 AA, seguir el tema claro/oscuro de DevTools,
  funcionar a 320 px de ancho y tener todos sus textos en español e inglés.

**Seguridad**

- **FR-032**: Todo contenido capturado (URLs, headers, bodies) MUST mostrarse como texto, nunca
  interpretarse como HTML ni ejecutarse.
- **FR-033**: Ningún dato capturado ni ninguna regla MUST salir del navegador; la extensión MUST
  NOT hacer tráfico de red propio.
- **FR-034**: La extensión MUST NOT pedir permisos nuevos respecto a la feature 001.
- **FR-035**: Todo mensaje entre el panel y el proceso en segundo plano MUST validarse en el
  receptor; un mensaje inválido se descarta y se registra sin afectar al tráfico.
- **FR-036**: Los registros internos (errores, timeouts) MUST NOT contener URLs, valores de
  headers sensibles (`Authorization`, `Cookie`, `Set-Cookie`, tokens) ni bodies; solo códigos,
  causas e identificadores internos.

### Key Entities

- **Intercambio capturado**: un request y su response en una pestaña. Método, URL, tipo de
  recurso, headers, bodies (o sus metadatos), status, tamaño, tiempos, si es preflight, y qué
  regla actuó y con qué resultado (pausado, mock, fallado, retrasado, registrado, timeout,
  descartado, condición no evaluable).
- **Regla**: sitio al que pertenece, nombre, prefiltro de URL, métodos, tipos de recurso, etapa, condiciones, acción,
  activa/inactiva y posición (prioridad) en la lista.
- **Condición**: tipo (método, header, query param, JSONPath, operationName, errors GraphQL,
  status), objetivo (nombre o ruta), operador y valor; válida solo para su etapa.
- **Acción**: Pausar, Mock (status, headers, body), Fallar (error de red), Retrasar (ms) o Solo
  registrar.
- **Item pausado**: intercambio en la cola con su etapa, hora de llegada, vencimiento, regla que lo
  pausó y la edición en curso.
- **Ajustes**: timeout de pausa, interruptor "pausar Nahual", si el onboarding ya se vio, si el
  dev ya dio su consentimiento para adjuntar y si el adjunto automático está activo.
- **Plantilla**: regla predefinida a partir de la cual se crea una nueva.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: al menos 4 de 5 devs que no conocen Nahual, en una prueba moderada sin
  documentación, pausan y editan su primera respuesta en menos de 2 minutos desde que abren el
  panel por primera vez.
- **SC-002**: el overhead por intercambio interceptado sin pausa (con reglas activas cuyo
  prefiltro coincide pero la condición no) tiene un p95 < 20 ms, medido en la app de prueba y
  reportado.
- **SC-003**: 0 casos de página colgada en la suite E2E, incluidos timeouts, detach con items en
  cola, navegación, cierre de pestaña y errores al aplicar cambios.
- **SC-004**: con 2,000 intercambios en el historial, cambiar un filtro muestra el resultado en
  menos de 300 ms y el desplazamiento de la lista sigue fluido.
- **SC-005**: el 100% de las reglas inválidas probadas (regex, JSONPath, rangos, status) se
  rechazan al guardar con un mensaje que indica el campo.
- **SC-006**: la verificación automatizada confirma 0 requests de red propios de la extensión y 0
  permisos nuevos respecto a 001.
- **SC-007**: el panel no tiene violaciones serias ni críticas de accesibilidad en ninguno de sus
  estados (tráfico, detalle, reglas, editor, cola, onboarding) y todos sus textos existen en `es`
  y `en`.

## Assumptions

- Base técnica de `001-spike-cdp`: panel solo en DevTools, debugger adjunto solo con el panel
  abierto, mensajería validada y limpieza al arrancar. Las decisiones de su `research.md` se
  reutilizan.
- Las reglas son por sitio (Clarifications): el sitio se toma de la página inspeccionada, no del
  destino del request, así que una regla del sitio de la app puede actuar sobre su API en otro
  origen. La prioridad (FR-016) se evalúa entre las reglas del sitio actual.
- El historial no persiste (solo memoria) por privacidad: contiene credenciales y bodies.
  Persistirlo o exportarlo es alcance de la feature 006.
- El primer adjunto es explícito (onboarding o "Adjuntar"); después es automático al abrir el
  panel (Clarifications). Abrir el panel de Nahual en DevTools cuenta como intención del dev, y
  la barra de aviso de Chrome sigue apareciendo cada vez.
- El rango de timeout pasa de 5–120 s (001) a 5–300 s con 60 s por defecto, para dar tiempo a
  editar bodies; no se puede extender una pausa en curso.
- Los límites de 100 items en cola y de 60,000 ms de retraso son defaults razonables para evitar
  que una regla demasiado amplia deje la página sin respuesta.
- Límites de reglas: hasta 500 reglas en total, body de un mock guardado de hasta 1 MB (el de un
  mock creado desde la cola, que no se guarda, hasta 5 MB) y regex de hasta 512 caracteres.
  Superarlos se rechaza al guardar con un mensaje que indica el límite (FR-013).
- Las plantillas son las cuatro de FR-018 (Clarifications); las de Mock y Retrasar dependen de la
  historia 4 y se entregan con ella. Más plantillas quedan para features posteriores.
- Fuera de alcance: WebSockets, Server-Sent Events como stream, requests del service worker de la
  página, iframes de otro proceso, importar/exportar reglas (006), CORS de desarrollo (003),
  repeater y diff (004) y hooks en código (005).
- Detección GraphQL: request con body JSON (o query `GET`) que tiene `query` y opcionalmente
  `operationName`; en un batch, la condición se cumple si alguna operación la cumple.
- El tamaño mostrado en la lista es el transferido; el detalle muestra también el
  descomprimido.
- Queda pendiente de 001 (sin bloquear esta feature): E5 / SC-001 de 001 y la definición de "en
  conflicto" cuando otro cliente usa el debugger en la misma pestaña.
