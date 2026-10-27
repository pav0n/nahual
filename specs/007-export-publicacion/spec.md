# Feature Specification: Exportar al código, perfiles y publicación

**Feature Branch**: `007-export-publicacion`

**Created**: 2026-10-25

**Status**: Draft

**Input**: User description: "Especifica la exportación, los perfiles y la publicación de Nahual."
Entrada completa en `docs/speckit-inputs/07-export-publicacion.md`. Depende de
`002-captura-intercept` (reglas por sitio, redacción, límites), `003-cors-desarrollo` (las
relajaciones nunca se exportan), `004-rediseno-panel` (catálogo de acciones del request, selección
múltiple con acciones por lote, lugar en la barra para el selector de perfil, secciones de
Ajustes Perfiles e Importar y exportar), `005-repeater-diff` (requests del repeater, criterio de
redacción de body y query) y `006-hooks-typescript` (hooks importados desactivados, permisos que
no se exportan). Requisito transversal del usuario: todo cambio en la interfaz MUST integrarse a
la perfección con la interfaz actual del panel; nada debe sentirse como un añadido aparte.

## Clarifications

### Session 2026-10-25

- Q: ¿Qué versiones de Vitest, MSW y Zod debe producir el código exportado? → A: Las últimas
  mayores estables a la fecha del plan (orientativo: MSW 2, Zod 4, Vitest actual), una sola por
  herramienta, fijadas en el plan y declaradas en un comentario del código generado. Además, el
  usuario pide un sexto formato: colección de Postman (un request o varios en una sola colección).
- Q: ¿Qué debe hacer el test Vitest exportado al ejecutarse: llamar al servidor real o levantar el
  handler MSW y probar contra él? → A: Prueba de contrato contra el servidor real: envía el
  request, verifica el status y que el body cumple el schema inferido; las credenciales se leen de
  variables de entorno. Requiere servidor disponible; no incluye ni levanta el handler MSW.
- Q: ¿Una regla puede pertenecer a varios perfiles a la vez, o cada regla vive en un solo perfil?
  → A: A varios perfiles o a ninguno; la lista de reglas muestra sus perfiles como etiquetas.
  Eliminar un perfil solo quita esa etiqueta de sus reglas.
- Q: Cuando la entrada dice que "las reglas CORS no se exportan sin confirmación", ¿qué cuenta
  como regla CORS? → A: Ninguna regla. Lo único que relaja CORS en Nahual son las relajaciones de
  003, que no son reglas y nunca se guardan ni se exportan (FR-017 de 003); con eso el requisito
  queda cumplido. No se analizan mocks ni hooks en busca de headers `Access-Control-*` ni se pide
  una confirmación aparte.
- Q: ¿La configuración portable incluye también los Ajustes o solo reglas, hooks y perfiles? → A:
  Reglas, hooks, perfiles y, además, la lista de orígenes de producción de 003; al importar, los
  orígenes solo se añaden (nunca se quitan) y aparecen en la vista previa. Los demás ajustes
  (tiempo de pausa, duración CORS por defecto, adjuntar al abrir, preferencias de interfaz) no
  viajan.

### Session 2026-10-25 (segunda ronda)

- Q: Al cerrar DevTools o la pestaña, ¿Nahual recuerda el último perfil activo de ese sitio o cada
  pestaña nueva empieza en "Todas las reglas"? → A: Se recuerda el último perfil activo por sitio:
  al abrir el panel en una pestaña de ese sitio se restaura; cambiarlo en una pestaña no cambia el
  de otras pestañas ya abiertas. Si el perfil recordado ya no existe, se usa "Todas las reglas".
- Q: Al pasar la revisión de la Chrome Web Store, ¿la primera versión queda visible en las
  búsquedas de la tienda o se publica primero solo por enlace directo? → A: Pública desde el
  primer release aprobado: aparece en las búsquedas de la tienda. No hay fase no listada ni grupo
  de probadores.
- Q: Al deshacer una importación o la eliminación de un perfil, ¿cuánto tiempo tiene el dev? → A:
  10 segundos, con el mismo aviso con "Deshacer" que ya usan borrar regla y limpiar tráfico.
- Q: Con varias filas marcadas, ¿cURL y fetch también se exportan en lote? → A: No. Las acciones
  por lote son exactamente tres: "Exportar handlers MSW", "Exportar schema Zod" (solo con filas
  del mismo endpoint) y "Exportar colección de Postman". cURL, fetch y Vitest son siempre de un
  solo request.
- Q: ¿Quién valida la revisión visual y de usabilidad de cierre (SC-013)? → A: Como en 004: al
  menos 1 dev que usa DevTools a diario (puede ser el usuario) en la demo de cierre, más los que
  haya disponibles; se registran los tiempos de cada tarea y las diferencias visuales encontradas.

## User Scenarios & Testing *(mandatory)*

> Glosario: **exportador** = lo que convierte un request en un tipo de código o archivo (cURL,
> fetch, test Vitest, handler MSW, schema Zod, colección de Postman); **vista previa de
> exportación** = el diálogo donde el dev ve el código antes de copiarlo o descargarlo; **valor
> sensible** = el criterio de 005: headers `Authorization`, `Cookie`, `Set-Cookie` y nombres que
> contienen `token`, `secret`, `session`, `api-key` o `apikey`, más campos de body JSON y
> parámetros de query con esos nombres o `password`; **perfil** = un grupo con nombre de reglas de
> un sitio que el dev activa en una pestaña; **configuración portable** = el archivo JSON con
> reglas, hooks, perfiles y orígenes de producción; **relajación CORS** = la ayuda temporal de 003, que no es una regla y
> nunca se guarda ni se exporta.

### User Story 1 - Exportar un request al código (Priority: P1)

Como dev, quiero convertir un request capturado o del repeater en código, para llevarlo a mis
pruebas y mocks sin copiar a mano URL, headers y body.

**Why this priority**: es el diferenciador de Nahual: lo que se descubre en el navegador termina
en el repositorio del proyecto. Funciona sola, sin perfiles ni importación.

**Independent Test**: con el fixture de tráfico, exportar un `GET` con `Authorization` y un `POST`
JSON a cada formato; comprobar la vista previa, que los valores sensibles salen redactados, que
incluirlos pide confirmación, copiar y descargar; ejecutar el test Vitest y el handler MSW
exportados en un proyecto Vite estándar sin editarlos.

**Acceptance Scenarios**:

1. **Given** un request seleccionado en Tráfico, **When** el dev abre sus acciones (cabecera del
   detalle o menú contextual) y elige "Exportar como…", **Then** se abre la vista previa con un
   selector de formato (cURL, fetch, test Vitest, handler MSW, schema Zod, colección de Postman) y
   el código del formato elegido, sin escribir nada todavía en el portapapeles ni en disco.
2. **Given** la vista previa, **When** el dev cambia de formato, **Then** el código se actualiza en
   el mismo diálogo y el formato elegido se recuerda para la próxima exportación.
3. **Given** un request con `Authorization`, una cookie y `?token=` en la URL, **When** se muestra
   cualquier formato, **Then** esos valores salen redactados con un marcador visible que no
   contiene ningún fragmento del valor, y el diálogo indica cuántos valores se redactaron.
4. **Given** la vista previa con valores redactados, **When** el dev activa "Incluir valores
   sensibles", **Then** se le avisa de que el código contendrá credenciales y debe confirmarlo;
   al confirmar, el código los incluye solo en esa exportación y la opción vuelve a desactivarse
   al cerrar el diálogo.
5. **Given** la vista previa, **When** el dev elige "Copiar" o "Descargar", **Then** el código
   mostrado (y no otro) va al portapapeles o a un archivo con nombre y extensión adecuados al
   formato, y se confirma la acción.
6. **Given** una pestaña del repeater, **When** el dev elige "Exportar como…" desde su barra,
   **Then** se exporta el request en edición y, si hay una respuesta seleccionada, ella alimenta
   el handler MSW, el test Vitest y el schema Zod.
7. **Given** varias filas marcadas en Tráfico, **When** el dev elige la acción por lote "Exportar
   handlers MSW", **Then** la vista previa muestra un único archivo con un handler por request,
   en el orden de la lista, y avisa qué requests se omitieron y por qué.
8. **Given** un handler MSW exportado de un request con respuesta JSON, **When** se usa en las
   pruebas de un proyecto, **Then** responde con el mismo status, los mismos headers no sensibles
   y el mismo body que la respuesta capturada.
9. **Given** varios requests marcados del mismo endpoint, **When** el dev exporta el schema Zod,
   **Then** el schema acepta todas esas respuestas: los campos que faltan en alguna son opcionales
   y los que en alguna son `null` admiten `null`.
10. **Given** uno o varios requests marcados, **When** el dev elige "Exportar colección de
    Postman", **Then** la vista previa muestra una colección con un elemento por request (método,
    URL, headers, body y la respuesta capturada como ejemplo), los valores sensibles como variables
    de colección sin valor, y Postman la importa sin avisos.

---

### User Story 2 - Publicar la extensión (Priority: P1)

Como mantenedor, quiero publicar Nahual en la Chrome Web Store desde CI con un build verificable,
para que cualquier dev la instale con confianza y sepa por qué pide cada permiso.

**Why this priority**: sin publicación, Nahual solo existe para quien sabe cargar una extensión
sin empaquetar. Es independiente del resto de historias: publica lo que esté terminado.

**Independent Test**: lanzar el flujo de release en un tag de prueba; comprobar que dos builds
del mismo commit producen el mismo paquete byte a byte, que el release adjunta el paquete, el
SBOM y la firma, que la subida espera aprobación manual y que el listing, la política de
privacidad y la declaración de datos dicen lo mismo.

**Acceptance Scenarios**:

1. **Given** un tag de versión en `main`, **When** corre el flujo de release, **Then** construye
   el paquete, lo verifica (lint, typecheck, pruebas, auditoría, sin código remoto ni evaluación
   de código fuera del sandbox) y lo adjunta al release junto con su SBOM y su firma.
2. **Given** el mismo commit construido dos veces en CI, **When** se comparan los paquetes,
   **Then** son idénticos byte a byte.
3. **Given** un release listo, **When** llega el paso de subida a la Chrome Web Store, **Then**
   espera la aprobación manual de un mantenedor y solo entonces usa las credenciales de
   publicación, que no están disponibles en ningún otro paso.
4. **Given** el listing en español e inglés, **When** alguien lo lee antes de instalar, **Then**
   entiende para qué sirve cada permiso, por qué aparece la barra amarilla de depuración y cómo
   soltarla, con capturas y un video que la muestran.
5. **Given** la política de privacidad y la declaración de prácticas de datos, **When** se
   comparan con el comportamiento de la extensión, **Then** coinciden: cero recolección, todo
   local, sin red propia.
6. **Given** que la revisión de la tienda aún no termina, **When** un equipo interno quiere usar
   la versión publicada, **Then** puede descargar el paquete del release y cargarlo sin
   empaquetar siguiendo las instrucciones del README.

---

### User Story 3 - Perfiles de reglas (Priority: P2)

Como dev, quiero agrupar mis reglas en perfiles ("QA staging", "Bug 1234") y cambiar de uno a
otro con un clic, para no activar y desactivar reglas una por una cada vez que cambio de tarea.

**Why this priority**: ahorra tiempo cada día a quien tiene muchas reglas, pero las reglas de 002
siguen siendo útiles sin ella.

**Independent Test**: crear dos perfiles en un sitio con reglas distintas, abrir dos pestañas del
mismo sitio, activar un perfil distinto en cada una y comprobar que en cada pestaña solo actúan
sus reglas; cambiar de perfil con el ratón y con el atajo.

**Acceptance Scenarios**:

1. **Given** el panel abierto, **When** el dev mira la barra superior, **Then** ve siempre el
   perfil activo de la pestaña con texto (no solo color), también a 320 px.
2. **Given** el selector de perfil, **When** el dev lo abre con un clic o con su atajo, **Then**
   ve "Todas las reglas" y los perfiles del sitio, y elegir uno lo activa de inmediato en esa
   pestaña, sin recargar la página ni soltar el debugger.
3. **Given** un perfil activo en una pestaña, **When** llega tráfico, **Then** solo actúan las
   reglas activas que pertenecen a ese perfil; con "Todas las reglas" actúan todas las reglas
   activas del sitio, como en 002.
4. **Given** dos pestañas del mismo sitio, **When** el dev activa un perfil distinto en cada una,
   **Then** cada pestaña aplica el suyo sin afectar a la otra.
5. **Given** el editor de una regla, **When** el dev la añade a uno o varios perfiles, **Then**
   la lista de reglas muestra a qué perfiles pertenece y, con un perfil activo, distingue (con
   texto o icono, no solo color) las reglas que no actúan en esa pestaña.
6. **Given** la sección Perfiles de Ajustes, **When** el dev crea, renombra, duplica o elimina un
   perfil, **Then** el cambio se aplica al instante; eliminarlo no elimina sus reglas y se puede
   deshacer.

---

### User Story 4 - Configuración portable (Priority: P2)

Como dev, quiero exportar mi configuración completa a un archivo y cargarla en otro navegador o
pasársela a un compañero, sin que el archivo pueda hacer nada antes de que yo lo revise.

**Why this priority**: permite versionar y compartir el trabajo con reglas y hooks; las
historias 1 y 3 ya aportan valor sin ella.

**Independent Test**: con una relajación CORS activa, exportar una configuración con reglas de dos
sitios, hooks y perfiles; borrar todo; importar el archivo y comprobar la vista previa, que todo
queda desactivado y que la relajación no aparece en el archivo; importar archivos inválidos, de
otra versión y truncados y comprobar que nada cambia.

**Acceptance Scenarios**:

1. **Given** la sección Importar y exportar de Ajustes, **When** el dev elige "Exportar
   configuración", **Then** ve un resumen (reglas por sitio, hooks, perfiles, orígenes de
   producción) y descarga un archivo JSON con la versión del formato.
2. **Given** una relajación CORS activa en la pestaña, **When** el dev exporta, **Then** el archivo
   no contiene ningún rastro de ella y el resumen aclara que las relajaciones CORS nunca se
   exportan.
3. **Given** reglas con valores sensibles (en condiciones o en headers de un mock), **When** el
   dev exporta, **Then** esos valores salen redactados salvo que confirme incluirlos.
4. **Given** un archivo de configuración válido, **When** el dev lo importa, **Then** ve, sin que
   se aplique ni ejecute nada, qué reglas, perfiles, hooks y orígenes de producción se añadirán,
   con el código de cada hook completo como texto, y confirma o cancela.
4a. **Given** un archivo con orígenes de producción, **When** se importa, **Then** los orígenes
    que faltan se añaden a la lista local y ninguno de los existentes se quita; los que ya estaban
    se indican en la vista previa como "ya presente".
5. **Given** una importación confirmada, **When** termina, **Then** todo lo importado queda
   desactivado y marcado como "importado", los hooks sin los permisos de cambiar el destino ni de
   leer valores sensibles, nada existente se reemplaza y el dev puede deshacer la importación.
6. **Given** un archivo que no es JSON, no cumple el formato, es de una versión más nueva de
   Nahual, supera el tamaño máximo o dejaría la configuración por encima de un límite, **When**
   el dev lo importa, **Then** se rechaza entero con un mensaje que dice la causa y qué hacer, y
   la configuración queda exactamente como estaba.
7. **Given** un archivo de una versión anterior del formato, **When** el dev lo importa, **Then**
   se convierte a la versión actual y la vista previa lo indica.

---

### User Story 5 - Traer reglas de Requestly (Priority: P3)

Como dev que viene de Requestly, quiero importar mis reglas exportadas, para probar Nahual sin
reescribirlas.

**Why this priority**: facilita la adopción, pero solo a quien ya usa Requestly.

**Independent Test**: importar un export de Requestly con reglas redirect, modify headers, modify
response estático y otras no soportadas; comprobar la vista previa, que las soportadas se
comportan igual tras activarlas y que las no soportadas se listan con su motivo.

**Acceptance Scenarios**:

1. **Given** un archivo exportado de Requestly, **When** el dev lo importa desde Importar y
   exportar, **Then** ve qué reglas se convertirán, en qué se convierten y cuáles no se pueden
   importar, cada una con su motivo, antes de confirmar.
2. **Given** una regla modify response estática, **When** se importa, **Then** se convierte en una
   regla Mock de etapa Response con el mismo status, headers y body.
3. **Given** una regla redirect o modify headers, **When** se importa, **Then** se convierte en una
   regla con hook cuyo código legible hace lo mismo; la de redirect solo actúa si el dev, al
   activarla, concede el permiso de cambiar el destino.
4. **Given** una regla con una condición o una parte que Nahual no puede reproducir, **When** se
   analiza, **Then** no se importa ni en parte y aparece en la lista de no soportadas con el
   motivo.
5. **Given** grupos de Requestly, **When** se importan, **Then** cada grupo se convierte en un
   perfil del sitio actual con sus reglas.
6. **Given** la importación confirmada, **When** termina, **Then** las reglas quedan en el sitio de
   la pestaña inspeccionada, desactivadas y marcadas como "importado de Requestly".

---

### Edge Cases

- **Body binario, de más de 5 MB o no disponible**: los exportadores lo omiten y lo dicen en un
  comentario del código y en la vista previa; cURL y fetch siguen siendo ejecutables.
- **Body multipart o de formulario**: cURL y fetch lo reproducen como formulario; si contiene
  archivos, se omiten con un comentario.
- **Response que no es JSON**: el schema Zod no se ofrece y la vista previa explica por qué; MSW y
  Vitest usan el tipo de contenido original.
- **Response sin cuerpo o request sin respuesta** (fallado, pendiente, pausado): MSW y Zod se
  ofrecen deshabilitados con el motivo; cURL y fetch siguen disponibles.
- **Preflight**: "Exportar como…" no aplica a preflights (no está en sus acciones).
- **Exportación por lote con requests que no aplican** (sin respuesta, preflight): se omiten y
  se listan; si no queda ninguno, la acción explica por qué no hay nada que exportar.
- **Requests repetidos del mismo método y ruta en el lote MSW**: se exporta un handler por
  endpoint con la última respuesta y se avisa cuáles se fusionaron.
- **Caracteres especiales** (comillas, saltos de línea, `$`, Unicode) en URL, headers o body:
  el código generado los escapa y se ejecuta sin cambiar el contenido.
- **Valor sensible dentro de un body no JSON**: no se detecta; la vista previa avisa de que los
  bodies no JSON no se redactan.
- **Schema Zod de un body muy anidado o con arrays heterogéneos**: se generan uniones legibles y,
  pasada una profundidad máxima, `unknown` con un comentario.
- **Perfil activo cuyo perfil se elimina**: la pestaña vuelve a "Todas las reglas" y se avisa en
  la franja de indicadores; deshacer recupera el perfil, no la selección.
- **Navegación a otro sitio con un perfil activo**: la pestaña pasa al último perfil recordado del
  nuevo sitio (o "Todas las reglas" si no hay); al volver al sitio anterior se recupera el que
  tenía.
- **Perfil recordado que ya no existe** (eliminado desde otra pestaña o por una importación
  deshecha): la pestaña abre en "Todas las reglas" sin aviso; el recuerdo inválido se descarta.
- **"Pausar Nahual" con un perfil activo**: la pausa global manda; el perfil sigue visible.
- **Perfil vacío**: se puede activar; la barra indica que no tiene reglas y la lista de reglas
  ofrece añadir reglas a él.
- **Importación con nombres que ya existen**: nunca reemplaza; los perfiles con el mismo nombre en
  el mismo sitio se renombran con el sufijo "(importado)" y la vista previa lo dice.
- **Deshacer una importación que añadió orígenes de producción**: quita solo los orígenes que
  añadió esa importación; los que ya estaban se conservan.
- **Importación que superaría los límites** (500 reglas, 5 MB de hooks): se rechaza entera
  indicando el uso actual y el que resultaría.
- **Importación interrumpida** (se cierra el panel o se reinicia el service worker a mitad):
  la configuración queda como antes de empezar o con todo lo importado, nunca a medias.
- **Regla importada con un valor redactado**: queda desactivada con un aviso en la regla de que
  falta completar ese valor, y no se puede activar hasta completarlo.
- **Export de Requestly vacío, de un formato desconocido o de una versión no soportada**: se
  rechaza en línea, junto al control de importar, con un mensaje que dice qué se esperaba.
- **Regla de Requestly sin destino resoluble** (redirect a un mapeo local o a un archivo): se
  lista como no soportada con el motivo.
- **Build no reproducible en CI**: el flujo de release falla antes de subir nada y muestra qué
  archivos difieren.
- **Revisión de la tienda rechazada**: el release queda en GitHub con sus artefactos; la causa se
  documenta y se corrige en un release nuevo.

## Requirements *(mandatory)*

### Functional Requirements

**Integración con la interfaz actual (todas las historias)**

- **FR-001**: Toda interfaz nueva (vista previa de exportación, selector de perfil, sección
  Perfiles, sección Importar y exportar, vistas previas de importación) MUST construirse con los
  componentes, tokens visuales, tipografía, densidad, iconos y patrones de interacción ya
  existentes en el panel (004, 005, 006); MUST NOT introducir un estilo, un tipo de control o un
  patrón de diálogo que el panel no tenga sin documentar el desvío y su motivo en el plan.
- **FR-002**: Las nuevas acciones MUST entrar por los lugares que 004 reservó: "Exportar como…"
  en el catálogo único de acciones del request (cabecera del detalle y menú contextual) y en la
  barra del repeater; las tres acciones por lote de FR-016c en la selección múltiple; el
  selector de perfil como elemento de estado de la barra superior; Perfiles e Importar y exportar
  como secciones nuevas de Ajustes, sin cambiar las existentes.
- **FR-003**: El código en las vistas previas MUST mostrarse con el mismo editor de código del
  panel (el de hooks de 006), en modo solo lectura, con su resaltado y su tema.
- **FR-004**: Los avisos de cosas que ocurren fuera de la vista actual (perfil activo eliminado,
  importación deshecha desde otra pestaña) MUST usar la franja de indicadores existente, con
  causa y solución; un archivo de importación rechazado MUST mostrar su causa y solución en
  línea, junto al control que lo eligió, como los campos inválidos de Ajustes en 004; los
  deshacer nuevos (eliminar perfil, importación) MUST usar el mismo aviso con "Deshacer" que ya
  usan borrar regla y limpiar tráfico, y las confirmaciones (incluir valores sensibles) el mismo
  diálogo de confirmación del panel.
- **FR-005**: Los atajos nuevos (como mínimo, abrir el selector de perfil y "Exportar como…") MUST
  declararse en el registro único de atajos de 004, sin chocar con los existentes ni con los de
  DevTools, y aparecer en Ajustes > Atajos y en Ayuda.
- **FR-006**: Toda interfaz nueva MUST seguir el tema de DevTools, funcionar a 320 px sin scroll
  horizontal, operarse solo con teclado, cumplir WCAG 2.2 AA sin depender solo del color, estar en
  español e inglés y tener diseñados sus estados vacío, de carga y de error.
- **FR-007**: El panel MUST seguir sin mostrar nada de funciones que no existen; cada elemento de
  esta feature aparece solo cuando su historia está terminada.

**Exportar al código (US1)**

- **FR-008**: El dev MUST poder exportar un request capturado (no preflight) o el request en
  edición de una pestaña del repeater a seis formatos: comando cURL, llamada `fetch()`, archivo
  de prueba Vitest, handler MSW, schema Zod inferido de la respuesta y colección de Postman.
- **FR-008a**: Los exportadores de Vitest, MSW y Zod MUST producir código para una sola versión
  mayor de cada herramienta, la última estable a la fecha del plan, fijada en el plan y declarada
  en un comentario al inicio del código generado.
- **FR-009**: Antes de copiar o descargar, el dev MUST ver el código exacto en la vista previa;
  copiar y descargar MUST usar ese mismo código. La descarga MUST usar un nombre derivado del
  método y la ruta, con la extensión del formato.
- **FR-010**: Todos los exportadores MUST redactar por defecto los valores sensibles (criterio de
  005: headers, campos de body JSON y parámetros de query) con un marcador visible que no contiene
  ningún fragmento del valor, e indicar cuántos se redactaron. La redacción MUST ser la misma
  implementación que usan el diff de 005 y la consola de 006.
- **FR-011**: Incluir valores sensibles MUST requerir una acción explícita en la vista previa y
  confirmar un aviso; vale solo para esa exportación y MUST NOT recordarse.
- **FR-012**: El comando cURL y la llamada `fetch()` MUST reproducir método, URL, headers y body
  del request; ejecutados tal cual contra el mismo servidor, MUST enviar el mismo request (salvo los
  valores redactados).
- **FR-013**: El test Vitest MUST ser una prueba de contrato en un archivo que corre sin edición en
  un proyecto Vite estándar con las versiones objetivo (FR-008a): envía el request real al
  servidor y verifica el status y que el body cumple el schema inferido; MUST NOT incluir ni
  levantar el handler MSW. Si el servidor no responde, el test MUST fallar con un mensaje que lo
  diga, no con un error genérico. Los valores redactados MUST leerse de variables de entorno con
  nombres indicados en un comentario al inicio del archivo, para que el test corra sin escribir
  credenciales en el código.
- **FR-014**: El handler MSW MUST responder al mismo método y ruta (sin query: MSW no la usa
  para emparejar; la query original queda en un comentario sobre el handler) con el status, los
  headers no sensibles y el body de la respuesta capturada.
- **FR-015**: El schema Zod MUST inferirse del body JSON de la respuesta: tipos de cada campo,
  objetos anidados, arrays y `null`. Con varias respuestas del mismo endpoint, los campos ausentes
  en alguna MUST ser opcionales y los que son `null` en alguna MUST admitir `null`.
- **FR-016**: La acción por lote "Exportar handlers MSW" MUST producir un único archivo con un
  handler por endpoint (método + ruta) de los requests marcados, en el orden de la lista, y avisar
  de los omitidos y fusionados con su motivo.
- **FR-016a**: Con varias filas marcadas del mismo endpoint, "Exportar schema Zod" MUST estar
  disponible como acción por lote y usar todas sus respuestas (FR-015).
- **FR-016b**: La colección de Postman MUST poder exportarse de un request o, como acción por
  lote, de varios: un elemento por request en el orden de la lista, con método, URL, headers y
  body, y la respuesta capturada como ejemplo guardado. Los valores sensibles MUST salir como
  variables de colección sin valor (el nombre de la variable no contiene el valor); incluirlos
  sigue FR-011. El archivo MUST importarse en Postman sin errores ni avisos.
- **FR-016c**: Las acciones por lote de la selección múltiple MUST ser exactamente tres: "Exportar
  handlers MSW", "Exportar schema Zod" (habilitada solo cuando todas las filas marcadas son del
  mismo endpoint) y "Exportar colección de Postman". cURL, fetch y Vitest MUST NOT ofrecerse en
  lote: son siempre de un solo request (Clarifications).
- **FR-017**: Los exportadores MUST ser deterministas: el mismo request y las mismas opciones
  producen siempre el mismo código.
- **FR-018**: Exportar MUST ocurrir enteramente en el navegador del dev, sin red propia, y no
  guardar el código generado; solo se recuerda el último formato elegido.

**Perfiles (US3)**

- **FR-019**: Un perfil MUST pertenecer a un sitio (como las reglas de 002), tener un nombre único
  en ese sitio y agrupar reglas de ese sitio; una regla MAY pertenecer a cualquier número de
  perfiles o a ninguno, y la lista de reglas MUST mostrar sus perfiles como etiquetas. Eliminar un
  perfil MUST quitar solo esa pertenencia de sus reglas.
- **FR-020**: Cada pestaña inspeccionada MUST tener un perfil activo: "Todas las reglas" (por
  defecto, el comportamiento de 002) o un perfil del sitio. Con un perfil activo, MUST actuar solo
  las reglas activas de ese perfil, respetando la prioridad de 002 y la cadena de hooks de 006.
- **FR-021**: El perfil activo MUST mostrarse siempre en la barra superior con texto, y el
  selector MUST abrirse con un clic o con su atajo; elegir un perfil MUST aplicarse a los
  siguientes requests de inmediato, sin recargar la página.
- **FR-022**: El perfil activo de una pestaña MUST conservarse en recargas y navegaciones dentro
  del sitio mientras viva la pestaña. Nahual MUST recordar por sitio el último perfil activado y
  restaurarlo al abrir el panel en una pestaña de ese sitio; cambiarlo en una pestaña MUST NOT
  cambiar el de otras pestañas ya abiertas. Si el perfil recordado ya no existe, la pestaña
  empieza en "Todas las reglas". El recuerdo guarda solo el sitio y el identificador del perfil.
- **FR-023**: El dev MUST poder crear, renombrar, duplicar y eliminar perfiles en Ajustes >
  Perfiles, y asignar perfiles a una regla desde su editor y desde la lista de reglas. Eliminar
  un perfil MUST NOT eliminar sus reglas y MUST poder deshacerse durante 10 s con el mismo aviso
  con "Deshacer" de borrar regla (FR-004).
- **FR-024**: Con un perfil activo, la lista de reglas MUST distinguir sin depender del color las
  reglas que no actúan en esa pestaña, y el contador de reglas activas de la barra MUST contar
  solo las que actúan.
- **FR-025**: Los perfiles MUST persistir localmente con las reglas; las relajaciones CORS de 003
  MUST NOT depender del perfil activo.

**Configuración portable (US4)**

- **FR-026**: El dev MUST poder exportar en un archivo JSON todas sus reglas (de todos los
  sitios), los hooks de esas reglas, los perfiles y la lista de orígenes de producción de 003, con
  un campo de versión del formato. MUST NOT incluir relajaciones CORS, historial, pestañas del
  repeater, consola de hooks, los permisos de hook de cambiar el destino y leer valores sensibles,
  ni los demás ajustes (tiempo de pausa, duración CORS por defecto, adjuntar al abrir,
  preferencias de interfaz).
- **FR-026a**: Al importar, los orígenes de producción del archivo MUST añadirse a la lista local
  sin quitar ninguno de los existentes; la vista previa MUST distinguir los nuevos de los ya
  presentes. Un origen inválido MUST rechazar el archivo entero (FR-029).
- **FR-027**: Las relajaciones CORS de 003 MUST NOT aparecer en ninguna exportación (ni como
  opción); el resumen de exportación MUST decirlo cuando hay una activa. No existe ninguna otra
  categoría de "regla CORS" que requiera confirmación (Clarifications).
- **FR-028**: Los valores sensibles dentro de las reglas MUST redactarse por defecto al exportar;
  incluirlos requiere confirmación (FR-011). Al importar, una regla con un valor redactado queda
  desactivada y no se puede activar hasta completarlo.
- **FR-029**: Importar MUST validar el archivo completo (sintaxis, formato, versión, tamaño máximo
  y límites de 002 y 006) antes de aplicar nada; ante cualquier error MUST rechazarlo entero con un
  mensaje que dice la causa y la solución, sin ningún cambio.
- **FR-030**: Antes de confirmar una importación válida, el dev MUST ver qué se añadirá (reglas por
  sitio, perfiles, hooks con su código completo como texto) sin que se ejecute nada.
- **FR-031**: Aplicar una importación MUST ser todo o nada, también si se interrumpe; MUST añadir
  sin reemplazar nada existente y MUST poder deshacerse como una sola acción durante 10 s, con el
  mismo aviso con "Deshacer" de borrar regla (FR-004). Pasada la ventana, lo importado sigue
  desactivado y se borra regla a regla o perfil a perfil, como cualquier otro elemento.
- **FR-032**: Todo lo importado MUST quedar desactivado y marcado como "importado"; los hooks,
  además, sin los permisos de cambiar el destino y de leer valores sensibles (como en 006).
- **FR-033**: Los archivos de versiones anteriores del formato MUST convertirse a la actual con
  migraciones probadas; los de una versión más nueva MUST rechazarse indicando que se actualice
  Nahual.

**Importar desde Requestly (US5)**

- **FR-034**: El dev MUST poder importar un archivo exportado de Requestly con la misma vista
  previa, validación completa, todo o nada y deshacer de FR-029 a FR-031.
- **FR-035**: MUST convertirse: modify response estático → regla Mock de etapa Response; redirect
  → regla con hook que cambia el destino; modify headers (de request o de response) → regla con
  hook que fija, cambia o quita esos headers. Las condiciones de origen de Requestly (URL, host,
  ruta con igual, contiene, comodín o regex) MUST traducirse al prefiltro y las
  condiciones de 002.
- **FR-036**: Una regla de un tipo no soportado, o con alguna parte que no se puede reproducir,
  MUST NOT importarse ni en parte y MUST listarse con su nombre y el motivo. Una regla de
  Requestly con varias parejas se importa entera o no se importa: si una pareja no es
  convertible, la regla completa es no soportada.
- **FR-037**: Las reglas importadas de Requestly MUST crearse en el sitio de la pestaña
  inspeccionada, desactivadas y marcadas como "importado de Requestly"; los grupos de Requestly
  MUST convertirse en perfiles de ese sitio.
- **FR-038**: El código de los hooks generados MUST ser legible: plantilla fija, un comentario
  inicial que cita la regla de Requestly de origen, nombres descriptivos y como máximo 20 líneas
  de plantilla más una línea por modificación de header; y MUST pasar la validación de tipos de 006.

**Publicación (US2)**

- **FR-039**: El paquete publicado MUST generarse solo desde CI, a partir de un tag de versión, y
  el build MUST ser reproducible: dos builds del mismo commit producen el mismo paquete byte a
  byte.
- **FR-040**: Cada release MUST adjuntar el paquete, su SBOM y una firma o atestación verificable
  de su procedencia.
- **FR-041**: La subida a la Chrome Web Store MUST correr en un entorno con aprobación manual
  obligatoria; las credenciales de publicación MUST existir solo en ese entorno. El listing MUST
  publicarse con visibilidad pública desde el primer release aprobado (Clarifications): aparece en
  las búsquedas de la tienda, sin fase no listada ni grupo de probadores.
- **FR-042**: El flujo de release MUST fallar antes de publicar si falla lint, typecheck, pruebas,
  auditoría de dependencias, la comprobación de reproducibilidad o la comprobación de que no hay
  código remoto ni evaluación de código fuera del sandbox.
- **FR-043**: El listing MUST estar en español e inglés y explicar cada permiso y la barra amarilla
  de depuración (por qué aparece y cómo soltarla), con capturas y un video.
- **FR-044**: MUST existir una justificación escrita de cada permiso (`debugger`, `storage`, los
  demás del manifest y los permisos de host opcionales) coherente con el listing.
- **FR-045**: La política de privacidad (cero recolección, todo local, sin red propia) y la
  declaración de prácticas de datos de la tienda MUST publicarse y coincidir entre sí y con el
  comportamiento de la extensión.
- **FR-046**: El README MUST explicar cómo instalar el paquete de un release sin empaquetar, para
  equipos que lo necesiten antes de la aprobación de la tienda.
- **FR-047**: Esta feature MUST NOT añadir permisos al manifest salvo los que el plan justifique por
  escrito.

### Key Entities

- **Exportación**: request de origen (capturado o del repeater), respuestas usadas (una o varias),
  formato, si incluye valores sensibles, número de valores redactados, requests omitidos o
  fusionados y el código resultante. No se guarda.
- **Formato de exportación**: cURL, fetch, Vitest, MSW, Zod o colección de Postman; extensión de
  archivo, qué datos necesita (respuesta, body JSON), si admite lote y, si aplica, la versión
  mayor de la herramienta a la que apunta.
- **Perfil**: sitio, nombre único en el sitio y reglas que agrupa. Persistente.
- **Perfil activo de la pestaña**: pestaña inspeccionada, sitio y perfil elegido (o "Todas las
  reglas"); vive mientras la pestaña.
- **Último perfil por sitio**: sitio y perfil activado por última vez en él; persistente, sin
  datos de tráfico; se descarta si el perfil deja de existir.
- **Configuración portable**: versión del formato, fecha, reglas por sitio con sus hooks, perfiles,
  orígenes de producción y qué se redactó.
- **Importación**: origen (configuración de Nahual o Requestly), elementos a añadir, elementos no
  soportados con su motivo, migración aplicada y la acción de deshacer.
- **Release**: versión, paquete, SBOM, firma, aprobación y estado en la tienda.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un test Vitest exportado del fixture corre sin editarlo en un proyecto Vite estándar
  con las versiones objetivo y pasa contra el servidor del fixture.
- **SC-002**: Un archivo de handlers MSW exportado de 5 requests del fixture reproduce en un
  proyecto de prueba el status, los headers no sensibles y el body de las 5 respuestas
  capturadas.
- **SC-003**: Un schema Zod inferido de las respuestas del fixture acepta el 100% de esas
  respuestas y rechaza una respuesta con un tipo de campo cambiado.
- **SC-004**: En el código de las 6 salidas de un request con `Authorization`, `Cookie` y
  `?token=` aparecen 0 fragmentos de esos valores mientras el dev no confirme incluirlos.
- **SC-004a**: Una colección de Postman exportada de 5 requests del fixture se importa en Postman
  sin errores ni avisos y sus 5 elementos envían el mismo request que el capturado una vez
  rellenadas las variables.
- **SC-005**: De un request seleccionado a código copiado bastan 3 acciones (abrir acciones,
  "Exportar como…", "Copiar").
- **SC-006**: Cambiar de perfil cuesta 1 clic tras abrir el selector o un atajo, y el siguiente
  request ya respeta el perfil nuevo.
- **SC-007**: Importar 20 archivos inválidos o truncados de prueba deja la configuración idéntica en
  los 20 casos; ninguna importación interrumpida deja estado a medias.
- **SC-008**: Una configuración exportada e importada en un perfil de Chrome limpio reproduce las
  mismas reglas, hooks y perfiles (salvo lo que se excluye por diseño), todo desactivado.
- **SC-009**: Del export de Requestly de prueba, el 100% de las reglas soportadas se comportan
  igual que en Requestly en el fixture tras activarlas, y el 100% de las no soportadas aparecen
  con su motivo.
- **SC-010**: Dos builds de CI del mismo commit producen paquetes idénticos, y el release incluye
  paquete, SBOM y firma verificable.
- **SC-011**: La extensión pasa la revisión de la Chrome Web Store en el primer o segundo envío y
  queda visible en las búsquedas de la tienda.
- **SC-012**: 0 violaciones serias o críticas de accesibilidad en las vistas nuevas, en tema claro
  y oscuro, y las pruebas E2E de 002–006 siguen pasando.
- **SC-013**: En la demo de cierre, al menos 1 dev que usa DevTools a diario (puede ser el
  usuario), más los que haya disponibles, revisa las vistas nuevas lado a lado con las de 004–006
  y no encuentra diferencias de tipografía, densidad, colores, bordes, controles ni comportamiento
  fuera de los desvíos documentados; sin explicación previa, encuentra "Exportar como…" y el
  selector de perfil en menos de 10 s cada uno. Los tiempos de cada dev y tarea y las diferencias
  encontradas se registran, como en SC-005 de 004.

## Assumptions

- **Versiones objetivo de los exportadores** (Clarifications): una sola versión mayor por
  herramienta, la última estable a la fecha del plan (orientativo: MSW 2 y Zod 4, la mayor que ya
  usa el proyecto), fijada en el plan y declarada en un comentario del código generado. No hay
  selector de versiones en la vista previa.
- **Formato de la colección de Postman**: la versión del esquema de colección vigente en Postman a
  la fecha del plan (orientativo: Collection v2.1); se fija en el plan. Las variables de entorno
  de Postman y los scripts de pruebas quedan fuera de alcance.
- **Editor de la vista previa**: la entrada pide un editor de solo lectura tipo Monaco; se usa el
  editor de código que ya tiene el panel (decisión de 002 y 006 por tamaño y CSP) en modo solo
  lectura, que es además lo que exige FR-003 para integrarse con la interfaz actual.
- **Checklist de publicación de la entrada**: menciona `unlimitedStorage`, `alarms` y
  `declarativeNetRequestWithHostAccess`, que Nahual no usa (002 y 003 los descartaron); la
  justificación cubre solo los permisos que tenga el manifest al publicar (hoy `debugger`,
  `storage` y los permisos de host opcionales del repeater).
- **Requestly como referencia**: se lee su formato de exportación; no se reutiliza su código
  (licencia AGPLv3, decisión de 001).
- **Test Vitest como prueba de contrato** (Clarifications): envía el request real y verifica
  status y forma del body; requiere que el servidor esté disponible. Un test autocontenido que
  monta el handler MSW queda fuera de alcance; quien lo quiera combina los archivos MSW y Vitest
  exportados.
- **Requests para Vitest**: se ejecutan con el `fetch` nativo del entorno de pruebas de Vite, sin
  dependencias extra aparte de las versiones objetivo.
- **Perfiles por sitio**: siguen la decisión de 002 de reglas por sitio; perfiles que abarquen
  varios sitios quedan fuera de alcance.
- **Regla en varios perfiles** (Clarifications): una regla puede pertenecer a varios perfiles o a
  ninguno; "Todas las reglas" conserva el comportamiento de 002, así que nadie que no use perfiles
  nota un cambio. Una regla sin perfil solo actúa con "Todas las reglas".
- **"Reglas CORS" de la entrada** (Clarifications): se resuelve con lo que ya garantiza 003: las
  relajaciones nunca se exportan. Una regla Mock o un hook que toque headers `Access-Control-*`
  es una regla normal y viaja como cualquier otra, desactivada al importar.
- **Ajustes en la configuración portable** (Clarifications): viajan reglas, hooks, perfiles y la
  lista de orígenes de producción, porque es una protección que un equipo quiere compartir y al
  importar solo se amplía. Los demás ajustes son preferencias de cada dev y no viajan, para no
  relajar tiempos ni comportamientos del navegador de destino.
- **Tamaño máximo de un archivo importado**: 10 MB, suficiente para 500 reglas con mocks de 1 MB
  como máximo en la práctica y 5 MB de hooks; se fija en el plan.
- **Requestly**: se admite el formato JSON de exportación vigente de Requestly a la fecha del
  plan; tipos fuera de los tres (insert script, user agent, query param, delay, cancel, modify
  request body, modify response dinámica) se listan como no soportados. Redirect y modify headers
  se reproducen con hooks porque 002 no tiene esas acciones nativas.
- **Distribución sin empaquetar**: el paquete del release sirve para carga manual mientras se
  aprueba la tienda (FR-046); no hay canal de actualización automática fuera de la tienda. La
  validación con usuarios reales antes de la tienda se hace con ese paquete, no con una fase no
  listada (Clarifications).
- **Firma**: atestación de procedencia del build en CI; el formato exacto se fija en el plan.
- **Sin permisos nuevos esperados**: exportar usa copiar y descargar desde el panel; si el plan
  necesita alguno, lo justifica (FR-047).
- **Fuera de alcance**: bibliotecas de perfiles o reglas de equipo y sincronización en la nube
  (pago), exportar a otros formatos (Playwright, HAR), importar de otras herramientas
  distintas de Requestly, exportar sesiones de tráfico completas y actualización automática fuera
  de la tienda.
