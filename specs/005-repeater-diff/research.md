# Research: Repeater y diff de respuestas (005)

Decisiones técnicas para [spec.md](./spec.md). El repeater vive en el panel (estado en memoria)
y envía por el service worker; el diff y la redacción son funciones puras de `packages/domain`
(TDD). Tres preguntas sobre Chrome se verifican con experimentos al inicio (X1–X3); el diseño
tiene respaldo para cada resultado.

Diferencias con la entrada de `/speckit-plan`, resueltas a favor de lo decidido después en
`/speckit-clarify` (2026-10-24):

- **Permisos**: la entrada dice "ningún permiso nuevo"; la clarificación 3 eligió un permiso de
  host **opcional, por origen y pedido en el momento** para el contexto limpio (FR-011a). Se
  justifica en [plan.md](./plan.md#permisos-justificación) y R5.
- **Librería de diff**: la entrada dice "la elegida en research.md de 001" (microdiff, D4). D4
  dejó pendiente reevaluar si hacía falta emparejar arrays por identidad; la clarificación 4 dice
  que sí, y microdiff no lo hace. Se implementa el diff en el dominio sin dependencias (R7).

---

## R1 — Envío en contexto de página: mundo aislado y plantilla fija

- **Decision**: el SW crea un **mundo aislado** en el marco principal de la pestaña con
  `Page.createIsolatedWorld({ frameId, worldName: "nahual-repeater" })` y ejecuta
  `Runtime.callFunctionOn({ executionContextId, functionDeclaration: PAGE_SEND, arguments:
  [{ value: request }], awaitPromise: true, returnByValue: true })`. `PAGE_SEND` es una
  **constante de texto** del SW (`background/repeater/page-template.ts`); el request (método,
  URL, headers, body) viaja solo como **argumento serializado**, nunca concatenado en código.
  La plantilla hace `fetch(url, { method, headers, body, credentials: "include", signal })`, lee
  status y headers, descarta el body (lo da la captura, R3) y devuelve `{ ok, status }` o
  `{ ok: false, errorName, message }`.
- **Rationale**: `callFunctionOn` con argumentos separa código y datos por construcción (amenaza
  "Inyección en el repeater"). El mundo aislado comparte cookies y origen con la página pero no
  sus globales: una página que reemplaza `window.fetch` o `Headers` no puede leer ni alterar el
  request del dev (amenaza "Página maliciosa manipula la extensión"). `Runtime.evaluate` con texto
  armado queda prohibido; la plantilla no tiene `eval`, `Function` ni plantillas de texto con
  datos.
- **Alternatives considered**: `Runtime.evaluate` con el request concatenado (inyección);
  evaluate en el mundo principal (la página puede interceptar `fetch`); `Network.loadNetworkResource`
  (no pasa por las reglas ni por CORS de la página y su respuesta va a un stream aparte);
  re-ejecutar el request con `Fetch.continueRequest` sobre uno nuevo (no hay request nuevo que
  pausar).
- **Experimento X1** (al inicio, `e2e/experiments/x1-isolated-send.spec.ts`): en Chrome estable,
  un `fetch` del mundo aislado (a) lleva las cookies de la pestaña y el `Origin` de la app; (b)
  aparece en `Network.requestWillBeSent` y pasa por `Fetch.requestPaused` (reglas y CORS de 003);
  (c) no usa un `window.fetch` reemplazado por la página; (d) su `initiator` permite reconocerlo
  (R2). **Respaldo** si (a) falla: mundo principal con la plantilla tomando `fetch` de un
  `iframe` propio recién creado (globales limpios) — se documenta como desvío.

## R2 — Reconocer el request del repeater en la captura

- **Decision**: `PAGE_SEND` termina con un `//# sourceURL=nahual-repeater` **constante**: la
  `functionDeclaration` es idéntica en todos los envíos (hash fijo, T016) y el `sendId` viaja solo
  en `arguments`, como el resto. Los envíos en contexto de página van **de uno en uno por
  pestaña** (los siguientes esperan en cola en el servicio, con su progreso visible), así que el
  `requestWillBeSent` del marco principal cuyo `initiator.stack.callFrames[0].url` es
  `nahual-repeater` y llega mientras hay un envío en curso pertenece a ese envío: `NetworkCapture`
  marca el intercambio con `repeater: { sendId }` y avisa al servicio con ese `exchangeId`. Si
  X1(d) muestra que el `sourceURL` no llega al `initiator`, respaldo: el primer
  `requestWillBeSent` del marco principal con el mismo método y URL y `initiator.type ===
  "script"` en una ventana de 2 s desde la llamada.
- **Rationale**: la marca alimenta "repeater" en Tráfico (FR-010a), el efecto de reglas del
  resultado y la respuesta (R3) sin cambiar el request enviado (añadir un header o un parámetro
  alteraría lo que el dev quiere reproducir).
- **Alternatives considered**: header `X-Nahual-Repeater` (altera el request y lo ve el
  servidor); correlación solo por tiempo y URL (ambigua con la app haciendo el mismo request);
  `sourceURL` con el `sendId` concatenado (rompe la plantilla fija: el código cambiaría en cada
  envío, aunque el dato fuera un UUID validado).

## R3 — Respuesta del envío en contexto de página

- **Decision**: la respuesta (status, headers, body) sale de la **captura** del intercambio
  marcado, con `getBody` y los límites de 002 (5 MB, binario solo con metadatos), no del `fetch`
  de la plantilla. El envío termina cuando el intercambio pasa a `complete` o `failed`; si la
  plantilla rechaza antes (CORS, red, aborto) y la captura tiene el intercambio, el resultado
  combina ambos: status y headers de la captura (CORS deja ver la respuesta a CDP aunque la
  página no pueda leerla) y la causa de la plantilla, con el diagnóstico de 003 si lo hay
  (FR-016).
- **Rationale**: un solo camino para bodies y límites (FR-015), y el diff del original y del
  envío usan los mismos datos. El preflight lo relaciona la captura como en 002 (`preflightFor`).
- **Alternatives considered**: leer el body en la plantilla y devolverlo por `returnByValue`
  (duplica límites y codificación, y falla con CORS).

## R4 — Cancelar, navegar y perder el contexto

- **Decision**: la plantilla registra un `AbortController` en un mapa del mundo aislado por
  `sendId`; "Cancelar" ejecuta una segunda plantilla fija `PAGE_ABORT(sendId)`. Un
  `Runtime.executionContextDestroyed` del mundo, `Page.frameNavigated` del marco principal a otro
  sitio, el detach o el cierre de la pestaña terminan los envíos pendientes con `context_lost`
  (FR-012, edge case). Timeout de seguridad, en **ambos modos**: 5 min sin respuesta ⇒ `timeout`
  (cubre pausas de 002, cuyo máximo es 300 s); en contexto limpio también aborta el `fetch`.
- **Rationale**: principio II: ningún envío queda colgado. El mundo aislado se recrea en el
  siguiente envío si fue destruido.
- **Alternatives considered**: cancelar con `Fetch.failRequest` (solo si está interceptado).

## R5 — Envío en contexto limpio: `fetch` del SW con permiso opcional por origen

- **Decision**: el SW hace `fetch(url, { method, headers, body, credentials: "omit", cache:
  "no-store", redirect: "follow", signal })` desde `background/repeater/clean-send.ts`, el único
  módulo con `fetch` (lo verifica `verify:dist`, R14). Para leer la respuesta de otro origen sin
  depender de su CORS, el manifest declara `optional_host_permissions: ["http://*/*",
  "https://*/*"]` y **no** concede ninguna al instalar: el panel pide
  `chrome.permissions.request({ origins: ["<origen>/*"] })` en el clic de "Enviar" cuando el SW
  responde `error permission_required` (FR-011a). El body se lee como stream con corte en 5 MB
  (`tooLarge`).
- **Rationale**: es el patrón de mínimo privilegio de la constitución (`<all_urls>` opcional y
  pedido por dominio, por acción del dev). `credentials: "omit"` no envía cookies ni
  autenticación del navegador (SC-005). Las respuestas no pasan por la captura (el debugger es
  de la pestaña, no del SW), así que no tocan reglas (FR-011).
- **Alternatives considered**: sin permiso (falla con casi cualquier API sin CORS abierto;
  clarificación 3); fetch desde una página de la extensión (mismo permiso, más superficie);
  `Network.loadNetworkResource` (usa la red de la pestaña).
- **Experimento X2** (al inicio, `x2-clean-send.spec.ts`): (a) `chrome.permissions.request`
  funciona desde el panel de DevTools en un gesto del usuario; (b) con el permiso, el `fetch` del
  SW lee una respuesta de otro origen sin headers CORS; (c) el servidor de prueba no recibe
  `Cookie` ni `Authorization` heredados; (d) qué `Origin` envía el SW. **Respaldo** si (a) falla:
  el panel abre una página de la extensión (`permissions.html`) con un botón "Conceder acceso a
  <origen>" que hace la petición; el envío espera su respuesta.

## R6 — Headers que el navegador no deja fijar

- **Decision**: función pura `forbiddenHeaders(headers)` en el dominio con la lista de
  nombres prohibidos de la especificación Fetch (`Cookie`, `Host`, `Origin`, `Content-Length`,
  `Connection`, `Referer`, `Sec-*`, `Proxy-*`, etc.). El editor los marca (FR-008) y el resultado
  del envío los lista como "no enviados tal cual". Se envían igual a `fetch` (el navegador los
  ignora o los fija él); nunca se descartan en silencio.
- **Rationale**: es el comportamiento real de `fetch` en ambos modos; avisar evita reproducciones
  falsas.
- **Alternatives considered**: forzarlos con `Fetch.continueRequest` en contexto de página
  (aumenta la superficie y cambia lo que el navegador haría con la app real).

## R7 — Diff estructural de JSON propio en el dominio

- **Decision**: `diffJson(before, after, options)` en `packages/domain/src/diff/json.ts`, sin
  dependencias. Recorre los dos valores JSON: tipos distintos ⇒ `changed`; objetos por clave (el
  orden no cuenta); arrays por identidad si todos los elementos son objetos con el primer campo
  de `id`, `_id`, `uuid`, `key` que tengan todos con valores únicos (texto o número) en cada lado,
  y si no por posición (FR-025a). Devuelve cambios `{ kind: "added" | "removed" | "changed",
  path, before?, after? }` con rutas como segmentos (clave, índice o `{ idField, id }`) que se
  formatean como `$.items[id=42].price`. Reordenar elementos con identidad no cuenta. Un
  presupuesto de 50,000 cambios corta con `truncated: true`.
- **Rationale**: microdiff (001 D4) no empareja por identidad ni distingue `[]` de `{}` en todos
  los casos; jsondiffpatch sí empareja (`objectHash`) pero pesa 17 KB y trae `diff-match-patch`.
  El algoritmo es ~200 líneas de TS puro con TDD y cumple el principio VII (cero dependencias
  nuevas). Las rutas como segmentos permiten ignorar y redactar sin parsear texto.
- **Alternatives considered**: microdiff + normalizar arrays a objetos por id (las rutas y los
  cambios de tipo quedan ambiguos); jsondiffpatch solo con su delta (dependencia y formato
  interno complejo).

## R8 — Diff de texto por líneas

- **Decision**: `diffLines(before, after)` con el algoritmo de Myers O(ND) (variante lineal en
  espacio) en `packages/domain/src/diff/lines.ts`, sin dependencias. Normaliza fin de línea
  (`\r\n` ⇒ `\n`). Presupuesto: si el número de ediciones supera 5,000 líneas, devuelve
  `truncated: true` con el recuento de líneas de cada lado y el diff se muestra como "demasiadas
  diferencias para mostrarlas por línea" (edge case de bodies grandes). Hasta 5 MB por lado.
- **Rationale**: Myers es el estándar (git, jsdiff) y en ~120 líneas da resultados mínimos y
  probables. Evita añadir `diff` (jsdiff) como dependencia.
- **Alternatives considered**: `diff`/jsdiff (dependencia nueva, más API de la que se usa);
  diff por caracteres (ilegible en JSON minificado; para eso está el estructural).

## R9 — Normalización y decisión del tipo de diff

- **Decision**: `diffResponses(before, after, options)` en `diff/responses.ts` orquesta:
  status; headers por nombre en minúsculas (los repetidos se comparan como lista ordenada); body:
  si los dos son JSON válido ⇒ `diffJson`; si alguno no lo es ⇒ `diffLines` con aviso si el
  `content-type` decía JSON (FR-026); binario, > 5 MB o no disponible ⇒ solo tamaño y motivo
  (FR-027). Una respuesta pegada solo tiene body (FR-022a). Ignorados y redacción se aplican sobre
  el resultado (R10, R11).
- **Rationale**: una sola función pura cubre toda la suite de SC-002.

## R10 — Rutas ignoradas por endpoint

- **Decision**: el dev ignora una ruta de JSON (segmentos; un índice de array se puede ignorar
  como "cualquier elemento" `[*]`) o un nombre de header desde el diff. `applyIgnores(result,
  ignores)` separa los cambios ignorados (recuento y lista aparte, FR-028). La lista se guarda en
  `chrome.storage.local` bajo `nahual.repeater.ignores.v1`, indexada por
  `endpointKey = SHA-256("<MÉTODO> <origen><ruta>")` en hexadecimal: la clave **no guarda la
  URL** (una ruta puede contener ids o tokens) y el valor solo tiene rutas y nombres de header.
  Límites: 500 endpoints (se descarta el usado hace más tiempo) y 100 entradas por endpoint. La
  escribe el SW (como el resto de `storage.local`); el panel la pide y la actualiza por protocolo.
- **Rationale**: FR-029 ("nunca valores") y principio I; el hash basta para buscar, no para
  reconstruir la URL. `crypto.subtle.digest` existe en el SW.
- **Alternatives considered**: guardar la URL sin query (puede llevar datos); `localStorage` del
  panel (004 lo reservó para la interfaz y no lo escribe el SW).

## R11 — Redacción en el diff

- **Decision**: `isSensitiveName(name)` en `domain/sensitive.ts` = criterio de headers de 002
  (`isSensitiveHeader`) + `password`, sin distinguir mayúsculas. `redactDiff(result)` marca como
  sensibles: headers sensibles, cambios cuyo último segmento de clave es sensible (a cualquier
  profundidad, FR-030) y, en un diff por líneas, los valores de parámetros de query y de pares
  `"clave": valor` con nombre sensible dentro de cada línea. El resultado redactado sustituye
  esos valores por `MASK` y conserva `changed: true`; los valores reales se guardan aparte, en
  memoria del panel, y solo se muestran tras "Mostrar valores sensibles" en ese diff (FR-030).
  Las URLs que aparecen en el diff (cabeceras `Location`, etc.) redactan sus parámetros de query
  sensibles.
- **Rationale**: SC-006 se prueba con una suite que busca los valores secretos en el texto
  renderizado; tener la redacción en el dominio la hace verificable sin DOM.
- **Alternatives considered**: redactar al renderizar (no verificable en el dominio, fácil de
  saltarse en un componente nuevo).

## R12 — Dónde corre el diff: Web Worker del panel

- **Decision**: el panel ejecuta `diffResponses` en un **Web Worker** propio
  (`panel/repeater/diff.worker.ts`, empaquetado por Vite). Mensajería validada en **los dos
  receptores** (principio I): el worker valida la entrada con Zod y el panel valida la salida con
  `DiffResultSchema` (más los valores sensibles aparte) y solo acepta mensajes de la instancia
  `Worker` que creó, con un `requestId` que coincide con la petición en curso; un mensaje
  inválido se descarta, se registra y el diff termina con error ("No se pudo comparar"). El
  panel muestra "Comparando…" y termina el worker si el dev cierra el diff. Timeout de 10 s ⇒ el
  diff termina con `truncated` y la explicación.
- **Rationale**: SC-003 exige que el panel siga respondiendo; JSON de 1 MB tarda decenas de
  ms, pero un diff por líneas de 5 MB puede tardar segundos. El SW no se usa para no bloquear el
  camino del tráfico (principio VI).
- **Alternatives considered**: hilo principal con `requestIdleCallback` (bloquea igual con
  entradas grandes); SW (compite con el tráfico).
- **Experimento X3** (al inicio, prueba de build): Vite + crxjs emiten el worker como archivo
  propio cargable bajo la CSP `script-src 'self'` del panel. **Respaldo**: el worker como
  archivo `public/` compilado aparte con el mismo bundler.

## R13 — Estado del repeater en el panel

- **Decision**: store `repeater` (Zustand + Immer) del panel con `RepeaterTab[]`, la pestaña
  activa y los diffs abiertos; **sin persistencia** (FR-020a). El SW no guarda nada del
  repeater: recibe `repeaterSend`, devuelve el resultado y olvida. Límites FR-021 en el store
  (20 pestañas, 50 envíos; al pasar de 50 se descarta el más antiguo y se marca
  `droppedCount`). Deshacer al cerrar una pestaña: la pestaña cerrada queda 10 s en
  `recentlyClosed` (como 003).
- **Rationale**: memoria acotada (cada envío puede llevar hasta 5 MB de body ⇒ el store guarda el
  body de la respuesta solo si ≤ 5 MB y como texto; binarios, solo metadatos).

## R14 — `verify:dist` con un `fetch` permitido

- **Decision**: la prueba "sin red propia" sigue prohibiendo `fetch(` en todos los bundles salvo
  **un** uso, en el chunk que contiene `clean-send.ts`, reconocido por un marcador de texto junto
  a la llamada (`/* nahual:repeater-clean-send */`), y comprueba que ese chunk es del SW. La
  plantilla de página (`PAGE_SEND`) contiene `fetch(` **como texto** dentro de una constante: se
  permite solo con la marca `/* nahual:page-template */` y una prueba comprueba que el texto de
  la plantilla es exactamente el revisado (hash fijo en la prueba).
- **Rationale**: FR-036 y el principio I siguen verificados: cualquier `fetch` nuevo rompe el
  build de verificación.

## R15 — Protocolo v4

- **Decision**: `PROTOCOL_VERSION` pasa a 4 (sin compatibilidad con v3: panel y SW van juntos).
  Comandos nuevos: `repeaterSend`, `repeaterCancel`, `getIgnores`, `setIgnores`. Eventos nuevos:
  `repeaterResult`. `ExchangeFields` suma `repeater?: { sendId }`. Ver
  [contracts/panel-protocol.md](./contracts/panel-protocol.md).
- **Rationale**: el SW valida cada envío con `RepeaterRequestSchema` (no confía en la validación
  del panel) y decide el modo efectivo (contexto de página solo si la pestaña del puerto está
  adjunta y en el sitio de la sesión, FR-012).

## R16 — Body original no textual (FR-002a)

- **Decision**: al abrir desde un request capturado, el panel pide el body del request con
  `getBody`. `encoding: "text"` ⇒ editable. `base64` (binario) ⇒ el request del repeater guarda
  `body: { kind: "original", base64, contentType, size }`, no editable; se envía decodificado en
  ambos modos. Body no disponible (desalojado, `hasPostData` sin datos, > 5 MB) ⇒ `body: {
  kind: "none" }` y el aviso de FR-002a. "Reemplazar por texto" cambia a `{ kind: "text",
  text: "" }` con deshacer.
- **Rationale**: reproduce fielmente uploads y binarios dentro del límite de 5 MB; editar
  multipart o binarios queda para una feature futura (Assumptions de la spec).

## R17 — Atajos

- **Decision**: `repeaterSend` = `Ctrl+Enter` y `Meta+Enter` (dos entradas en `SHORTCUTS` con el
  mismo efecto), activo solo con el foco dentro de una pestaña del repeater; `nextChange` = `J` y
  `prevChange` = `K`, activos solo con el foco en la vista de diff y fuera de campos de texto
  (como `/` de 004). Sin atajo global para la sección. La prueba de unicidad y de choque con
  `DEVTOOLS_RESERVED` los cubre (FR-034).
- **Rationale**: `Ctrl/Cmd+Enter` lo pide la spec; `J`/`K` es la convención de navegación de
  listas en herramientas de desarrollo (GitHub, Gmail) y no choca con DevTools.
- **Alternatives considered**: `Alt+↑/↓` (ya son mover regla), `F7` (cerca de `F8`, pausa del
  depurador de DevTools).

## R18 — Rendimiento

- **Decision**: medir en E2E (`@perf`, proyecto `perf` de 004): diff de dos JSON de 1 MB < 1 s
  hasta mostrar el resultado (SC-003), con una tarea larga del hilo principal ≤ 50 ms mientras
  corre; de "Enviar al repeater" a la respuesta mostrada en el fixture local < 2 s (parte de
  SC-001). El contexto de página añade una llamada CDP por envío y no cambia el camino de los
  demás requests (principio VI: la detección del `initiator` es una comparación de texto en
  `requestWillBeSent`, medida con E4 de 001 sin regresión > 1 ms p95).

## Resultados

### Experimento X1 — envío desde un mundo aislado (2026-10-24, Chromium de Playwright 1.64)

`e2e/experiments/x1-isolated-send.spec.ts`, con el laboratorio CDP de 003 dentro del SW
(`chrome.debugger`):

| Pregunta | Resultado |
|---|---|
| (a) Cookies y origen de la app | Sí: el eco recibió `cookie: nahual_session=…` y `origin` de la app (`credentials: "include"`) |
| (b) Network y Fetch | Sí: `Network.requestWillBeSent` y `Fetch.requestPaused` en etapa Response |
| (c) `window.fetch` reemplazado por la página | No se usó (`__hijacked` falso) |
| (d) `initiator` reconocible | Sí: `type: "script"`, `stack.callFrames[0].url === "nahual-repeater"` |
| Inyección en la URL | Llegó literal al servidor (`/echo?q=%22);globalThis.__pwned=1;(%22`); `__pwned` no existe |

Se usa el camino principal de R1 y R2 (sin respaldo). Detalle: `callFunctionOn` envuelve la
declaración entre paréntesis, así que el `//# sourceURL=nahual-repeater` final debe ir seguido de
un salto de línea; sin él, el `)` queda comentado y la llamada falla con `SyntaxError`.

### Experimento X2 — permiso opcional y `fetch` del SW (2026-10-24)

`e2e/experiments/x2-clean-send.spec.ts`:

| Pregunta | Resultado |
|---|---|
| (a) `chrome.permissions.request` en un clic del panel | Abre el diálogo del navegador; Playwright **no puede contestarlo** y la promesa queda pendiente. Aceptarlo dentro de DevTools se comprueba a mano (quickstart, paso 3) |
| (b) Con el host concedido, lectura sin CORS | Sí: `fetch` del SW a `/no-cors` responde 200 con el body |
| (c) Sin cookies heredadas | Sí: el eco no trae `cookie` (la cookie de la app existe para 127.0.0.1); sí trae el `authorization` escrito por el dev |
| (d) `Origin` en un GET | No se envía |
| Sin host concedido | `TypeError: Failed to fetch` (como esperaba R5) |

**Desvío para las pruebas**: el build de pruebas (`--mode test`) declara además
`host_permissions: ["http://127.0.0.1/*"]` (los servidores locales, cualquier puerto) para que
las E2E envíen en contexto limpio de verdad; el flujo de pedir el permiso se prueba contra
`localhost` (no concedido) con el espía `__nahualPermissionsSpy`, que en el build de pruebas
sustituye la respuesta del diálogo. El build de producción no tiene `host_permissions`
(`tests/dist/manifest.test.ts`).

### Experimento X3 — worker del diff (2026-10-24)

`e2e/experiments/x3-worker.spec.ts`: Vite emite `assets/diff.worker-*.js` y el worker creado con
`new Worker(new URL("./diff.worker.ts", import.meta.url), { type: "module" })` responde al ping
sin violaciones de CSP. Sin respaldo.

### Mediciones de US1

- **SC-001** (parte automática, `e2e/repeater-send.spec.ts`, `@perf`): de "Send to repeater" a la
  respuesta mostrada, 302 ms en el fixture local (meta < 2 s; el resto de los 10 s es la persona).

### Decisiones tomadas al implementar US1

- **Headers del navegador copiados desactivados**: al abrir un request capturado, los headers que
  `fetch` no deja fijar (`sec-*`, `referer`, `origin`, `cookie`…) llegan desactivados. Saldrían
  igual del navegador y, activos, llenaban el editor de avisos (13 en un GET típico).
- **Contexto de página atado al sitio de la pestaña**: cada pestaña del repeater recuerda el sitio
  de la sesión al crearse; si la pestaña inspeccionada está en otro sitio, el modo se deshabilita
  con el motivo (FR-012, US1-8), porque enviaría con otras cookies y otro origen.
- **Permiso en el clic**: el panel llama a `chrome.permissions.request` antes de cualquier espera
  (resuelve al instante si el origen ya tiene acceso), así el gesto del dev sigue vigente.
- **Reintento solo si el contexto no existía**: `page-send` recrea el mundo aislado y reintenta
  solo ante "Cannot find context"; si se destruyó a mitad del envío no reintenta, porque el
  request pudo salir y se enviaría dos veces.
- **`getBody` con `binary`**: el body no textual de un request vuelve en base64 solo si lo pide el
  repeater; el detalle de Tráfico sigue igual.
- **Límite del diff por líneas en 5,000 ediciones** (no 20,000): Myers cuesta O(N·D) y con 20,000
  ediciones el peor caso tardaba 9,5 s en Node; con 5,000 queda por debajo de 1 s. Por encima, el
  diff dice "demasiadas diferencias para mostrarlas por línea" (edge case de bodies grandes).
- **Preferencia `split.repeater`** dentro de `nahual.ui.v1.split` (no una clave aparte), con default
  0.5 para preferencias guardadas por 004.

### Mediciones de US2

- **SC-003** (`e2e/repeater-perf.spec.ts`, `@perf`): diff de dos JSON de ~1 MB (9,000 filas, 9
  valores distintos), 247–459 ms en tres corridas, sin tareas largas (> 50 ms) en el panel. El
  clic y la espera se hacen sin las comprobaciones de Playwright: recorren el DOM (con la
  respuesta de 1 MB) en el hilo del panel y se medían como tareas largas suyas.

### Decisiones tomadas al implementar US2

- **Solo los arrays con cambios** se informan con su criterio (como mucho 50). Con todos, un JSON
  de 9,000 filas con un array `tags` cada una devolvía 9,000 entradas: validarlas en el panel y
  copiarlas desde el worker costaba ~90 ms en el hilo principal.
- **Lista de ignorados en memoria del SW** tras la primera lectura (solo el SW escribe la clave):
  cada guardado ya no relee ni valida la lista entera.
- **Sección Repeater como columna flexible**: el divisor ocupa el alto que queda bajo las pestañas
  y la barra; sin eso, a 320 px la parte inferior medía casi 0 y el divisor tapaba sus botones.
- **"Sin diferencias" determinista en las pruebas** con la respuesta pegada: dos envíos al mismo
  endpoint pueden diferir en el header `Date`, y eso es un cambio real.

### Camino del tráfico (R18, principio VI)

`e2e/experiments/e4-overhead-rules.spec.ts` (el de 002 R20, con el panel y el motor reales), tres
corridas de 500 fetch tras 10 de calentamiento, HeadlessChrome 156, 2026-10-24:

| Corrida | Overhead p95 en 002 (ms) | Overhead p95 en 005 (ms) |
|---|---|---|
| 3. Regla Request: prefiltro coincide, condición de header no | 2,5 | 3,4 · 3,6 · 2,0 |
| 4. Regla Response: JSONPath no (pide el body) | 2,6 | 2,4 · 3,0 · 2,4 |

La captura pasiva (corrida 2, donde vive el reconocimiento del `initiator`) sigue sin distinguirse
de la corrida sin debugger. Las corridas varían ±1 ms entre sí (una por encima de 002 en 1,1 ms y
otra por debajo en 0,5 ms): no hay regresión medible, y todo queda muy por debajo del presupuesto de
20 ms (SC-002 de 002).

### Estabilidad (T064)

Tres corridas seguidas de `pnpm e2e` (4 workers): 137/137, 132 + 1 fallo, 137/137; la regresión
visual (66 + 24 capturas nuevas) estable en tres corridas. El único fallo es una intermitencia de
003, no de 005: `cors-diagnosis.spec.ts` US1-3 a veces diagnostica un bloqueo CORS antes de recibir
los `ExtraInfo` de Network (headers de la respuesta o `Origin`/`Cookie` del request), que Network no
ordena respecto de `loadingFailed`. Ocurre también en `main` (2 de 240 repeticiones de la spec, mismo
síntoma). Un intento de esperar esos headers en el diagnóstico lo corregía, pero hacía que
`cors-relax.spec.ts` agotara su tiempo en ~2 % de las repeticiones, así que se revirtió: queda como
deuda de 003 para una corrección propia (con la causa del timeout entendida antes de cambiar la
espera).

### Tamaño de los bundles (`pnpm build`)

| Archivo | 004 | 005 | gzip (005) |
|---|---|---|---|
| Panel (`panel-*.js`) | — | 383,823 B | 115,039 B |
| Dominio + Zod compartido (`src-*.js`) | — | 200,220 B | 55,513 B |
| SW (`index.ts-*.js`) | — | 50,302 B | 16,367 B |
| **Worker del diff** (`diff.worker-*.js`, nuevo) | — | 184,807 B | 49,567 B |
| **Total JS** | 351,626 B | 819,401 B | 236,786 B |

El worker es la mayor parte del aumento: Vite lo construye como entrada aparte y no comparte chunks
con el panel, así que lleva su propia copia de Zod y del dominio (los necesita para validar la
petición y calcular el diff). Se carga solo al abrir un diff.
