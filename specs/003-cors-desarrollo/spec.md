# Feature Specification: CORS de desarrollo

**Feature Branch**: `003-cors-desarrollo`

**Created**: 2026-10-22

**Status**: Draft

**Input**: User description: "Especifica el manejo de CORS de desarrollo de Nahual" — seguir
trabajando cuando el backend aún no tiene CORS bien configurado, y decirle al backend exactamente
qué corregir. Entrada completa en `docs/speckit-inputs/03-cors-desarrollo.md`. Depende de
`002-captura-intercept` (lista de tráfico, motor de reglas) y de la decisión D5 de
`specs/001-spike-cdp/research.md`.

## Clarifications

### Session 2026-10-22

- Q: ¿Cuánto dura una relajación de CORS y cuánto lo puede ajustar el dev? → A: 8 h por defecto y
  como máximo; al crearla se elige 15 min, 1 h, 4 h u 8 h, y el valor por defecto se cambia en
  ajustes.
- Q: ¿Cómo marca el dev los orígenes de producción? → A: Lista manual con orígenes exactos y
  patrones de subdominio (`https://*.empresa.com`); empieza vacía y Nahual no adivina.
- Q: ¿Qué frameworks trae el reporte para backend desde el inicio? → A: Express, NestJS, AWS API
  Gateway y Google Cloud Run (para Cloud Run, el ejemplo indica que CORS se configura en la app o
  en el gateway).
- Q: Con una relajación activa, ¿los preflight se responden siempre en local o van primero al
  servidor? → A: Van al servidor; si su respuesta fallaría (status no 2xx, redirección o headers
  insuficientes), se reemplaza por un 204 local; si ya es válida, pasa sin cambios.

### Session 2026-10-23

- Q: ¿Cuántos clics cuesta relajar CORS desde un request bloqueado, contando la confirmación? →
  A: 2 desde el detalle abierto: "Permitir CORS para desarrollo" despliega en línea el alcance y la
  duración, y "Permitir" la crea; SC-001 se mide desde el detalle.

## User Scenarios & Testing *(mandatory)*

> Glosario: **origen de la app** = esquema + host + puerto de la página que hace el request (ej.
> `http://localhost:3000`); **origen de la API** = el del destino del request (ej.
> `https://api-dev.empresa.com`); **preflight** = la consulta previa (`OPTIONS`) que el navegador
> hace antes de ciertos requests entre orígenes; **relajación** = el permiso temporal que
> Nahual da para que la app lea las respuestas de un origen de API concreto; **origen de
> producción** = origen que el dev marcó para que Nahual nunca relaje CORS en él.

### User Story 1 - Entender un error de CORS (Priority: P1)

Como dev, quiero saber por qué un request falla por CORS, en lenguaje claro, sin descifrar el
mensaje de la consola.

**Why this priority**: es lo primero que necesita el dev ante un error de CORS y lo que permite
decidir si basta con relajar en local o hay que pedir un cambio al backend. Por sí sola ya ahorra
tiempo de diagnóstico, sin modificar ningún tráfico.

**Independent Test**: con el panel abierto y el debugger adjunto, la app de prueba hace requests a
una API que provoca cada causa de bloqueo (sin `Access-Control-Allow-Origin`, método no permitido,
header no permitido, preflight 401, comodín con credenciales, preflight con redirección); se
verifica la marca en la lista y la explicación del detalle, sin activar ninguna relajación.

**Acceptance Scenarios**:

1. **Given** el debugger adjunto, **When** el navegador bloquea un request por CORS, **Then** el
   intercambio aparece en la lista de tráfico marcado "Bloqueado por CORS" con texto e icono (no
   solo color), y el filtro de la lista permite mostrar solo los bloqueados por CORS.
2. **Given** un intercambio bloqueado por CORS, **When** el dev abre su detalle, **Then** una
   sección "CORS" explica la causa en una frase y qué la corrige; las causas reconocidas son: falta
   `Access-Control-Allow-Origin`, el origen permitido no coincide con el de la app, método no
   permitido, header no permitido, preflight con status no 2xx, credenciales con origen comodín
   (`*`), credenciales sin `Access-Control-Allow-Credentials` y redirección en el preflight.
3. **Given** el detalle CORS de un intercambio bloqueado, **When** el dev lo lee, **Then** ve qué
   pidió la app (origen de la app, método, headers solicitados, si envía credenciales) y qué
   respondió el servidor (status del request y, si Nahual lo observó, del preflight, y los headers
   `Access-Control-*` recibidos), con las diferencias resaltadas con texto.
4. **Given** un bloqueo cuya causa no está entre las reconocidas, **When** el dev abre el detalle,
   **Then** se muestra "Causa no reconocida" junto con el código que reporta el navegador, sin
   ofrecer una explicación inventada.
5. **Given** un request bloqueado por algo que no es CORS (contenido mixto, política de seguridad
   de la página, bloqueador de anuncios, error de red), **When** aparece en la lista, **Then** no
   se marca como "Bloqueado por CORS".
6. **Given** un request precedido por un preflight, **When** el dev abre el detalle del request,
   **Then** puede ir al preflight asociado y volver, y la lista muestra a ambos relacionados.

---

### User Story 2 - Desbloquear para seguir trabajando (Priority: P1)

Como dev, quiero relajar CORS solo para mi app y mi API de desarrollo, sin abrir mi navegador a
cualquier sitio, para no esperar a que backend corrija su configuración.

**Why this priority**: es el valor principal de la feature: convierte un bloqueo en minutos de
trabajo recuperados. Comparte prioridad con la historia 1 porque la relajación se crea desde el
diagnóstico, pero se puede probar por separado.

**Independent Test**: desde un request bloqueado de la app de prueba, el dev activa "Permitir CORS
para desarrollo"; se verifica que la app funciona, que una segunda pestaña con la misma app y un
tercer origen siguen bloqueados, y que la relajación desaparece al expirar, al apagarla, al cerrar
la pestaña, al soltar el debugger y al reiniciar el service worker.

**Acceptance Scenarios**:

1. **Given** un intercambio bloqueado por CORS, **When** el dev pulsa "Permitir CORS para
   desarrollo" en su detalle, **Then** Nahual despliega en línea, dentro del mismo detalle, el
   alcance (esta pestaña, el origen de la app y el origen de la API, tomados del intercambio), si
   la app envía credenciales, la duración y el aviso de que la relajación solo existe en este navegador, y la crea al pulsar
   "Permitir"; cancelar no crea nada.
2. **Given** una relajación activa, **When** la app repite el request, **Then** la respuesta llega
   a la app con `Access-Control-Allow-Origin` igual al origen exacto de la app (nunca `*`),
   `Access-Control-Allow-Credentials: true` solo si el request lleva credenciales, y los
   `Access-Control-Expose-Headers` que el dev configuró.
3. **Given** una relajación activa y un request que requiere preflight, **When** el preflight
   del servidor fallaría (status no 2xx, redirección o headers insuficientes), **Then** la app
   recibe un preflight exitoso (204) que permite exactamente el método y los headers que la app
   pidió, y el request real continúa.
4. **Given** un caso que Nahual no puede corregir en el navegador, **When** el dev intenta
   relajarlo, **Then** el detalle explica que ese caso requiere un cambio en el servidor (o que el
   request está fuera del alcance de Nahual) y no se crea una relajación inútil.
5. **Given** una relajación activa, **When** el dev mira el panel desde cualquier vista, **Then** un
   indicador permanente "CORS relajado" muestra los orígenes de API afectados, el origen de la app
   y el tiempo restante, y permite apagarla en un clic o con un atajo de teclado.
6. **Given** una relajación activa, **When** vence su duración (8 horas por defecto), se apaga, se
   cierra la pestaña, se suelta el debugger (por cualquier causa, incluido cerrar el panel) o se
   reinicia el service worker, **Then** la relajación deja de aplicarse de inmediato, el indicador
   desaparece y, si el panel sigue abierto, un aviso explica por qué terminó.
7. **Given** un origen de la app o de la API marcado como producción, **When** el dev intenta
   relajar CORS para él, **Then** Nahual muestra un aviso que nombra el origen marcado y no crea la
   relajación.
8. **Given** una relajación activa en una pestaña, **When** otra pestaña con la misma app, o la
   misma app hacia un tercer origen, hace requests, **Then** esos requests siguen bloqueados como
   sin Nahual.

---

### User Story 3 - Reporte para backend (Priority: P2)

Como dev, quiero pasarle al equipo de backend exactamente qué configurar, para que la relajación
deje de hacer falta.

**Why this priority**: resuelve el problema de raíz y reduce el riesgo de que CORS oculte un bug
real ("funciona en local, falla en staging"), pero el dev puede trabajar sin él gracias a la
historia 2.

**Independent Test**: tras provocar varios bloqueos contra un origen de API (con y sin
credenciales, con headers personalizados y un preflight 401), el dev genera el reporte; se
verifica su contenido, que no incluye valores sensibles sembrados en la prueba y que se copia al
portapapeles.

**Acceptance Scenarios**:

1. **Given** intercambios bloqueados por CORS (o relajados por Nahual) hacia un origen de API,
   **When** el dev pulsa "Generar reporte para backend" desde el detalle o desde el indicador,
   **Then** obtiene un texto copiable con: orígenes que deben permitirse, métodos, headers
   solicitados reales, si se usan credenciales, un `Max-Age` sugerido, las causas detectadas y los
   endpoints afectados (método y ruta, sin query string).
2. **Given** el reporte, **When** el dev elige un framework, **Then** el reporte añade un ejemplo
   de configuración para Express, NestJS, AWS API Gateway o Google Cloud Run coherente con los
   datos del reporte (origen exacto, nunca `*` si hay credenciales).
3. **Given** intercambios con headers sensibles (`Authorization`, `Cookie`, tokens), **When** se
   genera el reporte, **Then** solo aparecen nombres de headers, nunca sus valores.
4. **Given** el reporte en pantalla, **When** el dev lo lee, **Then** ve un aviso visible de que la
   relajación solo existe en este navegador y que en staging y producción fallará hasta corregir
   el servidor.
5. **Given** que no hay intercambios bloqueados ni relajados para ese origen de API, **When** el
   dev abre el reporte, **Then** un estado vacío explica que el reporte se genera a partir de
   requests bloqueados y cómo provocarlos.

---

### Edge Cases

- **Varias APIs en la misma app**: cada origen de API se relaja por separado, desde un request
  bloqueado hacia él; el indicador lista todos y permite apagarlos uno a uno o todos juntos. Cada
  uno tiene su propio vencimiento. Hay un máximo de 10 orígenes de API relajados por pestaña.
- **Respuestas opacas (modo `no-cors`)**: el navegador no las bloquea por CORS ni la app puede
  leerlas; Nahual no las marca ni las modifica.
- **Preflight con redirección**: se reconoce como causa propia; con relajación activa, la app
  recibe el preflight exitoso local en lugar de la redirección. El reporte indica que el servidor
  no debe redirigir el `OPTIONS`.
- **Requests desde un iframe de otro origen**: el origen de la app que cuenta es el del iframe,
  no el de la pestaña; la relajación creada para la página principal no lo cubre. Si el iframe
  está fuera del alcance de captura de Nahual (002), el diagnóstico no aparece.
- **Dos pestañas con la misma app**: la relajación aplica solo en la pestaña donde se creó.
- **Navegación de la pestaña**: recargar o navegar dentro del mismo origen de la app conserva la
  relajación; mientras la página esté en otro origen, la relajación no aplica a sus requests (el
  indicador lo dice) y vuelve a aplicar si se regresa al origen de la app antes de que venza.
- **Origen marcado como producción con una relajación activa**: la relajación de ese origen se
  apaga de inmediato con un aviso.
- **Vencimiento con requests en vuelo o pausados**: lo que llega después de que la relajación
  terminó se entrega sin relajación; un intercambio en la cola de pausados que se continúa después
  del vencimiento no recibe headers de relajación.
- **Permiso guardado por el navegador**: las respuestas de preflight que entrega Nahual no
  permiten que el navegador siga aceptando requests con ese permiso una vez apagada la relajación.
- **Servidor que ya responde bien**: si el servidor ya devuelve headers CORS correctos para el
  origen de la app, la relajación no cambia el resultado que ve la app y su preflight pasa sin
  reemplazo; el detalle lo indica, para que el dev sepa que puede apagar la relajación.
- **Interruptor "pausar Nahual" (002)**: mientras está activo, la relajación queda suspendida (no
  modifica respuestas) y el indicador lo muestra; el tiempo de vencimiento sigue corriendo.
- **Reglas de 002 sobre el mismo intercambio**: las reglas actúan primero (pausar, mock, fallar,
  retrasar); la relajación se aplica a la respuesta final que recibe la página, salvo los headers
  `Access-Control-*` que el dev fijó a mano en ese intercambio (edición en la cola o mock), que se
  respetan.
- **Origen `null`** (archivo local, iframe con sandbox, redirección opaca): no hay origen exacto
  que permitir; el detalle lo explica y no se ofrece relajar.
- **Comodín en métodos o headers con credenciales**: `Access-Control-Allow-Methods: *` o
  `Access-Control-Allow-Headers: *` no valen con credenciales; se diagnostica como método o header
  no permitido indicando el comodín, y la relajación usa listas explícitas.
- **Requests del mismo origen**: nunca son CORS; no se marcan ni se modifican.
- **Reinicio del service worker con requests en vuelo**: la relajación termina, los requests
  continúan sin modificar (002, fallar de forma segura) y el panel avisa al reconectar.
- **Fallo al aplicar la relajación**: si Nahual no logra modificar una respuesta, esta continúa sin
  modificar y el detalle indica el error; nunca queda colgada.

## Requirements *(mandatory)*

### Functional Requirements

**Diagnóstico**

- **FR-001**: El sistema MUST marcar como "Bloqueado por CORS" todo intercambio que el navegador
  bloquee por CORS en la pestaña adjunta, con texto e icono, y MUST NOT marcar los bloqueados por
  otras causas.
- **FR-002**: La lista de tráfico MUST permitir filtrar los intercambios bloqueados por CORS y los
  relajados por Nahual.
- **FR-003**: El detalle de un intercambio bloqueado MUST clasificar la causa en una de: falta
  `Access-Control-Allow-Origin`; origen permitido distinto del de la app (incluidos varios valores);
  método no permitido; header no permitido; preflight con status no 2xx; credenciales con origen
  comodín; credenciales sin `Access-Control-Allow-Credentials`; redirección en el preflight; o
  "Causa no reconocida" con el código del navegador.
- **FR-004**: Para cada causa reconocida, el detalle MUST explicar en lenguaje claro qué pasó y qué
  cambio en el servidor lo corrige, nombrando el header y el valor concretos.
- **FR-005**: El detalle MUST mostrar lo que pidió la app (origen, método, headers solicitados en
  el preflight, si envía credenciales) y lo que respondió el servidor (status del request y
  headers `Access-Control-*` recibidos; status y headers del preflight cuando Nahual lo observó y,
  si no, indicarlo y explicar cuándo puede observarlo).
- **FR-006**: El sistema MUST relacionar cada request con su preflight en la lista y en el detalle.
- **FR-007**: El sistema MUST indicar en el detalle cuándo un caso no se puede corregir desde el
  navegador (origen `null`, request fuera del alcance de captura, origen de producción) y por qué.

**Relajación**

- **FR-008**: Desde el detalle de un intercambio bloqueado, el dev MUST poder crear una relajación
  con "Permitir CORS para desarrollo"; antes de crearla, el sistema MUST mostrar en línea, en el
  mismo detalle, su alcance (pestaña, origen de la app, origen de la API), su duración, los
  `Expose-Headers` y el aviso de que solo existe en este navegador. La relajación MUST crearse con
  un solo clic más ("Permitir"), con la duración por defecto preseleccionada. La confirmación MUST
  incluir la opción "La app envía credenciales", marcada si Nahual lo detectó y editable por el
  dev.
- **FR-009**: Una relajación MUST aplicar solo a requests de la pestaña donde se creó, cuyo origen
  de la app sea el declarado y cuyo destino sea el origen de API declarado. Ningún otro request
  MUST verse afectado.
- **FR-010**: Con una relajación activa, las respuestas a requests en su alcance MUST llegar a la
  app con `Access-Control-Allow-Origin` igual al origen exacto de la app; el sistema MUST NOT
  producir nunca `Access-Control-Allow-Origin: *` en una relajación.
- **FR-011**: El sistema MUST añadir `Access-Control-Allow-Credentials: true` solo cuando el
  request lleva credenciales, y nunca combinarlo con un comodín en origen, métodos o headers.
- **FR-012**: Todo preflight en el alcance de una relajación MUST llegar primero al servidor. Si
  la respuesta del servidor ya permite el request, MUST pasar a la app sin cambios; si fallaría
  (status no 2xx, redirección o headers `Access-Control-*` insuficientes), la app MUST recibir en
  su lugar un preflight exitoso (204) con `Access-Control-Allow-Methods` y
  `Access-Control-Allow-Headers` iguales a lo que la app pidió (método y headers solicitados), no a
  un comodín. El detalle del preflight MUST conservar la respuesta real del servidor e indicar que
  Nahual la reemplazó.
- **FR-013**: Las respuestas de preflight entregadas por la relajación MUST NOT permitir que el
  navegador siga aceptando requests con ese permiso después de que la relajación termine.
- **FR-014**: El dev MUST poder configurar los `Access-Control-Expose-Headers` de cada relajación
  (vacío por defecto) eligiendo entre los nombres de headers que ha devuelto ese origen de API o
  escribiéndolos.
- **FR-015**: La duración de una relajación MUST ser una de 15 min, 1 h, 4 h u 8 h, elegida al
  crearla; la preseleccionada es el valor por defecto de ajustes (8 h de fábrica, cambiable a
  cualquiera de esas opciones). Ninguna relajación MUST superar 8 h. Una relajación activa no se
  extiende: se apaga y se crea otra.
- **FR-016**: Una relajación MUST terminar, y dejar de aplicarse de inmediato, cuando: vence; el
  dev la apaga; se cierra la pestaña; se suelta el debugger por cualquier causa (incluido cerrar el
  panel); se reinicia el service worker; o su origen se marca como producción.
- **FR-017**: Las relajaciones MUST NOT persistir: no sobreviven a ninguna de las causas de FR-016,
  no se restauran al volver a adjuntar el debugger y no se incluyen en ninguna exportación.
- **FR-018**: Al arrancar, el sistema MUST eliminar cualquier rastro de relajaciones de una sesión
  anterior antes de procesar tráfico.
- **FR-019**: Mientras haya una relajación activa en la pestaña, el panel MUST mostrar en todas sus
  vistas un indicador "CORS relajado" con el origen de la app, los orígenes de API, el tiempo
  restante y el estado (activa, suspendida por "pausar Nahual", sin efecto porque la página está
  en otro origen).
- **FR-020**: Desde el indicador, el dev MUST poder apagar una relajación o todas en un clic, y con
  un atajo de teclado apagarlas todas; apagarlas no pide confirmación.
- **FR-021**: Cuando una relajación termina por una causa distinta de la acción del dev, el panel
  MUST mostrar un aviso con la causa (vencida, debugger soltado, reinicio, origen marcado como
  producción).
- **FR-022**: El sistema MUST permitir hasta 10 orígenes de API relajados por pestaña; superar el
  límite se rechaza con un mensaje que indica el límite.
- **FR-023**: Además de indicarlo (FR-007), cuando un caso no se puede corregir desde el
  navegador el sistema MUST NOT crear la relajación y MUST indicar que requiere un cambio en el servidor.
- **FR-024**: La relajación MUST aplicarse después de las reglas de 002 sobre la respuesta final y
  MUST respetar los headers `Access-Control-*` que el dev fijó a mano en ese intercambio.
- **FR-025**: Con "pausar Nahual" activo, la relajación MUST quedar suspendida sin modificar
  respuestas.
- **FR-026**: El detalle de un intercambio relajado MUST indicar "CORS relajado por Nahual" y qué
  headers se añadieron o reemplazaron, conservando visibles los que envió el servidor.
- **FR-027**: Si aplicar la relajación falla, el intercambio MUST continuar sin modificar y el
  detalle MUST mostrar el error con causa.

**Orígenes de producción**

- **FR-028**: El dev MUST poder mantener en ajustes una lista de orígenes de producción, con
  orígenes exactos (`https://app.empresa.com`) y patrones de subdominio (`https://*.empresa.com`);
  la lista empieza vacía, se guarda en el navegador y se valida al guardar y al leerla. Un patrón
  coincide con subdominios de cualquier nivel con el mismo esquema y puerto, no con el dominio
  raíz (`https://empresa.com` se añade aparte). No hay excepciones: si un subdominio de
  desarrollo cae bajo un patrón, el dev lista orígenes exactos en su lugar.
- **FR-029**: El sistema MUST rechazar crear una relajación si el origen de la app o el de la API
  coincide con un origen de producción, mostrando qué entrada de la lista coincide.
- **FR-030**: Al añadir un origen de producción, toda relajación activa que lo afecte MUST
  terminar de inmediato (FR-016).
- **FR-031**: Quitar un origen de la lista de producción MUST poder deshacerse.

**Reporte para backend**

- **FR-032**: El dev MUST poder generar, desde el detalle o desde el indicador, un reporte para un
  origen de API a partir de los intercambios bloqueados o relajados de la pestaña hacia ese
  origen.
- **FR-033**: El reporte MUST incluir: orígenes de app que deben permitirse, métodos, headers
  solicitados reales, si se usan credenciales, un `Max-Age` sugerido, las causas detectadas y los
  endpoints afectados como método y ruta sin query string.
- **FR-034**: El reporte MUST poder incluir, a elección del dev, un ejemplo de configuración para
  Express, NestJS, AWS API Gateway o Google Cloud Run, coherente con los datos del reporte.
- **FR-035**: El reporte MUST NOT incluir valores de headers, cookies, bodies ni query strings;
  solo nombres de headers.
- **FR-036**: El reporte MUST mostrar el aviso de que la relajación solo existe en este navegador
  y que en staging y producción fallará hasta corregir el servidor.
- **FR-037**: El dev MUST poder copiar el reporte al portapapeles en una acción; el reporte se
  genera en el idioma de la interfaz y nunca sale del navegador por iniciativa de Nahual.

**Transversales**

- **FR-038**: Toda la feature MUST funcionar 100% en el navegador, sin red propia, y mostrar el
  contenido capturado siempre como texto.
- **FR-039**: La sección CORS del detalle, el indicador, la confirmación de relajación, los
  ajustes y el reporte MUST cumplir WCAG 2.2 AA, operarse solo con teclado, seguir el tema de
  DevTools, funcionar a 320 px y tener sus textos en `es` y `en`, con estados vacío y de error.
- **FR-040**: Todo permiso nuevo que requiera la feature MUST ser el mínimo necesario y
  justificarse en el plan; la feature MUST NOT pedir acceso a todos los sitios.

### Key Entities

- **Diagnóstico CORS**: asociado a un intercambio bloqueado. Causa clasificada (o código del
  navegador si no se reconoce), lo que pidió la app (origen, método, headers solicitados,
  credenciales), lo que respondió el servidor (status del preflight y del request, headers
  `Access-Control-*`) y el preflight relacionado.
- **Relajación CORS**: pestaña, origen de la app, origen de la API, `Expose-Headers`, creada a,
  vence a, estado (activa, suspendida, sin efecto) y causa de fin. Vive solo mientras dura la sesión
  del debugger en esa pestaña.
- **Origen de producción**: origen exacto o patrón de subdominio en la lista de ajustes.
- **Reporte para backend**: origen de API, orígenes de app, métodos, headers solicitados,
  credenciales, `Max-Age` sugerido, causas, endpoints y ejemplo de framework opcional. Se calcula
  al pedirlo y no se guarda.
- **Ajustes (ampliados)**: duración por defecto de la relajación y lista de orígenes de
  producción, además de los de 002.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: con el detalle de un request bloqueado por CORS abierto, el dev deja la app
  funcionando en menos de 3 clics ("Permitir CORS para desarrollo" y "Permitir") en la app de
  prueba.
- **SC-002**: 0 relajaciones aplicadas fuera de la pestaña y los orígenes declarados, verificado
  en E2E con una segunda pestaña con la misma app y un tercer origen de API que siguen bloqueados.
- **SC-003**: 0 relajaciones activas tras vencer, apagarla, cerrar la pestaña, soltar el debugger
  o reiniciar el service worker, verificado en E2E con un request que vuelve a bloquearse.
- **SC-004**: el 100% de las causas de FR-003 provocadas en la app de prueba se clasifican y
  explican correctamente, y ningún bloqueo por otra causa se marca como CORS.
- **SC-005**: 0 respuestas con `Access-Control-Allow-Origin: *` combinado con credenciales y 0
  relajaciones creadas sobre orígenes de producción en las pruebas que intentan provocarlo.
- **SC-006**: 0 valores sensibles en los reportes generados con tokens y cookies sembrados en la
  prueba.
- **SC-007**: con una relajación activa, el overhead por intercambio relajado tiene un p95 < 20 ms,
  medido en la app de prueba y reportado.
- **SC-008**: la sección CORS, el indicador, la confirmación, los ajustes y el reporte no tienen
  violaciones serias ni críticas de accesibilidad, y todos sus textos existen en `es` y `en`.

## Assumptions

- Base técnica de 001 y 002: debugger adjunto solo con el panel abierto, captura de tráfico,
  motor de reglas, cola de pausados, interruptor "pausar Nahual" y mocks con headers CORS para el
  origen exacto (R21 de 002). La decisión D5 de 001 confirma que los preflight pasan por la
  interceptación y pueden responderse localmente, así que no se espera un mecanismo de respaldo.
  A diferencia de D5, el preflight llega primero al servidor y solo se reemplaza si fallaría
  (Clarifications), para que el diagnóstico y el reporte reflejen lo que el servidor responde de
  verdad.
- La relajación es una ayuda temporal de la sesión, distinta de las reglas de 002: no aparece en
  la lista de reglas, no se guarda y no se exporta (FR-017). Por eso apagarla no se considera
  destructivo y no pide confirmación ni ofrece deshacer: crearla de nuevo cuesta 2 clics.
- Frameworks del reporte (Clarifications): los cuatro de FR-034; para Google Cloud Run, que no
  configura CORS por sí mismo, el ejemplo indica dónde configurarlo (en la app o en el
  balanceador o gateway delante del servicio). Más frameworks quedan para features posteriores.
- El `Max-Age` sugerido es un valor razonable para desarrollo y staging (por ejemplo 600 s); el
  reporte explica que es una sugerencia.
- El reporte usa los intercambios en memoria de la pestaña (historial de 002, máximo 2,000), así
  que solo cubre lo ocurrido desde que se adjuntó el debugger.
- La relajación permite que cualquier script de la página del origen de la app lea las respuestas
  de la API declarada; es el efecto buscado y se acota con pestaña, orígenes, expiración e
  indicador.
- Fuera de alcance: acceso a red privada (Private Network Access), que se muestra como "Causa no
  reconocida" con su código; WebSockets; requests del service worker de la página e iframes de
  otro proceso (como en 002); relajar CORS desde una regla guardada de 002; enviar el reporte a
  otros sistemas (solo se copia).
- Queda pendiente de 001 (sin bloquear esta feature): E5 / SC-001 de 001 y la definición de "en
  conflicto".
