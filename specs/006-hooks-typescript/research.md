# Research: Hooks en TypeScript (006)

Decisiones técnicas para [spec.md](./spec.md). Los hooks se ejecutan en el **panel**, dentro de
una página `sandbox.pages` embebida como iframe y, dentro de ella, en un **Web Worker por hook**;
el service worker pausa el intercambio, pide al panel que ejecute la cadena y aplica el resultado
con el ejecutor de 002. La lógica (contexto, enmascarado, validación, cadena, `state`, archivo
`.ts`) es TypeScript puro en un paquete nuevo, `packages/hook-runtime`, con TDD. Tres preguntas
sobre Chrome y sobre el tamaño del editor se verifican con experimentos al inicio (X1–X3); cada
una tiene respaldo.

La interfaz **sigue a DevTools** (petición expresa del usuario en `/speckit-plan` y lección de
005, donde hubo que rehacer el Repeater): cada pieza nueva se diseña a partir de su equivalente
nativo (R13).

Diferencias con la entrada de `/speckit-plan`, resueltas a favor de lo decidido después:

- **Ejecución**: la entrada propone ejecutar el hook en el iframe del sandbox y "recrear el
  iframe" para cortar un bucle. Se ejecuta en un Worker creado dentro del sandbox (R2): se corta
  con `terminate()` sin recrear nada, no puede navegar y aísla un hook de otro. El iframe queda
  como respaldo si X1 falla.
- **Editor**: la entrada dice "Monaco"; el input ajustado deja la elección a esta fase. Se elige
  CodeMirror 6 con el servicio de lenguaje de TypeScript (R4), a confirmar con las medidas de X3.
- **Cadena**: la entrada dice "orden por prioridad de regla"; las clarificaciones fijan la cadena
  sin límite propio, el hook que responde en etapa Request, los permisos por regla, el `state`
  con reintentos y la suspensión tras 5 errores. Todo ello entra en R5–R9.

---

## R1 — Dónde se ejecuta un hook y cómo viaja

- **Decision**: el SW detecta la cadena (R8), carga los bodies que falten como para una pausa de
  002 y envía al panel **un solo** evento `hookRun` con el intercambio y la cadena completa. El
  panel (`HookHost`) ejecuta la cadena hook a hook en el sandbox, valida cada resultado, lo
  combina y devuelve **un solo** comando `hookResult` con el resultado final (`unchanged`,
  `edit` o `respond`) y el resumen de cada ejecución. El SW lo valida otra vez (Zod y las mismas
  reglas de 002: `validatePausedEdit`, mock) y lo aplica con el ejecutor de 002
  (`continueEdited`, `respond` con los headers CORS de un mock local, o `continueUnchanged`).
- **Rationale**: la constitución pide el código del usuario en `sandbox.pages`, y una página de
  la extensión solo existe en el panel (el SW no puede tener iframes). Un viaje de ida y vuelta
  por cadena, no por hook, reduce el coste de mensajería (SC-002). Validar en ambos lados sigue
  "mensajería validada" (principio I) y deja al SW como única autoridad sobre lo que se aplica.
- **Timeouts del SW**: si el panel no responde en `2 s × hooks de la cadena + 3 s` (los 3 s cubren
  un arranque en frío del sandbox, R2), o el puerto
  se cierra, el SW continúa sin cambios (principio II). Al soltar el debugger, Chrome libera el
  intercambio.
- **Alternatives considered**: ejecutar en el SW (no admite `sandbox.pages` ni iframes, y `eval`
  está prohibido en él); una página offscreen (`chrome.offscreen`, permiso nuevo y sin sandbox);
  un viaje por hook (multiplica la latencia en cadenas).

## R2 — Aislamiento: página sandbox, canal y un Worker por hook

- **Decision**:
  - `src/sandbox/hook-sandbox.html` declarado en `sandbox.pages`, embebido por el panel en un
    `<iframe>` oculto. Se **precalienta** al abrir el panel si hay reglas con hook activas (o al
    activar la primera): iframe, Sucrase y canal listos (`ready`) antes del primer `hookRun`. Se
    destruye al cerrar el panel. Los 2 s de cada hook cuentan desde que el sandbox empieza a
    ejecutarlo, no desde que se crea (FR-020); un `hookRun` que llega durante un arranque en frío
    espera a `ready` dentro del límite del SW (R1).
  - CSP de `sandbox` en el manifest:
    `sandbox allow-scripts; default-src 'none'; script-src 'self' 'unsafe-eval' blob:;
    worker-src blob:; connect-src 'none'; img-src 'none'; style-src 'none'; frame-src 'none';
    form-action 'none'; base-uri 'none'`. Sin `allow-same-origin`, `allow-popups`,
    `allow-top-navigation` ni `allow-forms`: origen opaco, sin `chrome.*` (MV3) y sin acceso al
    panel.
  - **Canal sin `targetOrigin "*"`**: al cargar, el sandbox crea un `MessageChannel` y envía un
    puerto al panel con `parent.postMessage(hello, "chrome-extension://<id>")` (conoce el origen
    del panel por su propia URL). El panel acepta solo un `hello` cuyo `event.source` es la
    ventana de su iframe y cuyo `event.origin` es `"null"`; desde ahí todo va por ese
    `MessagePort`. Cada mensaje se valida con Zod en ambos extremos y lleva el `runId` pedido
    (FR-033); lo demás se descarta y se registra.
  - **Ejecución en Workers**: el sandbox crea un Worker por hook (clave: id de regla + hash del
    código) desde un `Blob` con el runtime fijo del worker; el código del dev entra por
    `postMessage`, nunca en la URL ni en el texto del runtime. El Worker hereda la CSP del
    sandbox: sin red (`fetch`, XHR, WebSocket, `EventSource`, `importScripts`), sin DOM ni
    `location` navegable. Un Worker inactivo 60 s se cierra. Es una ejecución **más estricta**
    que la página `sandbox.pages` sola (nace de ella y hereda su CSP); el Constitution Check lo
    deja escrito como interpretación de "correr solo en una página declarada en `sandbox.pages`".
  - **Mensajes del Worker**: el canal sandbox ↔ Worker es privado (solo el sandbox tiene la
    referencia al Worker). El runtime del Worker valida la forma de `load` y `exec` con
    comprobaciones propias, sin Zod (meter Zod en una función serializada a `Blob` la haría muy
    pesada), y descarta lo demás; el sandbox valida con Zod todo lo que recibe del panel antes de
    reenviarlo (contracts/sandbox-messaging.md).
  - **Corte**: a los 2 s el sandbox hace `terminate()` del Worker de ese hook; las ejecuciones en
    curso de ese mismo hook terminan como "tiempo agotado" (si estaba en un bucle síncrono, de
    todos modos no avanzaban). El siguiente uso crea otro Worker (FR-020, FR-021).
- **Rationale**: un Worker no puede navegar (un iframe sí podría hacerlo hacia otro dominio con
  datos en la URL, y la CSP no tiene `navigate-to`), se corta sin efecto en el resto y separa los
  globales de cada hook (un hook importado no puede envenenar `JSON.parse` de otro). La
  combinación sandbox + CSP es el modelo de la constitución; el Worker es una capa extra.
- **Experimento X1** (`e2e/experiments/x1-sandbox.spec.ts`, al inicio), en Chrome estable:
  (a) crxjs empaqueta la página de `sandbox.pages` y Chrome aplica la CSP declarada;
  (b) el canal con `MessageChannel` funciona y `event.origin` es `"null"`;
  (c) el sandbox crea un Worker desde un `Blob` y este puede usar `new Function`;
  (d) desde el Worker fallan `fetch`, XHR, WebSocket, `EventSource`, `importScripts`, un Worker
  anidado y `chrome`; (e) `terminate()` corta un `while (true)`; (f) un `Error` lanzado por el
  código evaluado conserva la línea (R3).
  **Respaldo** si (c) falla: ejecutar en el propio sandbox y, para cortar, recrear el iframe
  (la propuesta de la entrada); un iframe por hook para separar globales, y el panel destruye un
  iframe que dispara `load` después del primero (navegó).

## R3 — Transpilación y líneas de error

- **Decision**: **Sucrase** (D2 de 001) con las transformaciones `typescript` e `imports`, dentro
  de la **página sandbox** y con caché por hash del código. El resultado (`exports.default = …`)
  se evalúa en el Worker con `new Function("exports", "require", code + "\n//# sourceURL=hook.js")`;
  `require` lanza "los hooks no pueden importar". La línea de un error sale de la pila
  (`hook.js:L`) menos las líneas que añade `new Function`; Sucrase conserva los números de línea,
  así que es la línea del dev (FR-024, SC-008).
- **Rationale**: Sucrase es JavaScript puro, ~48 KB gzip y sin `eval` propio. Vivir en el sandbox
  lo deja fuera de la carga inicial del panel (SC-007) y se descarga solo cuando hay hooks
  activos. Falta lo que D2 dejó para 006: medir el tiempo de transformación de un hook típico
  (< 50 ms esperado) en X2.
- **Sintaxis no admitida**: `enum`, decoradores, `require`, `import` (salvo
  `import type` de `./nahual-hooks`, que Sucrase elimina; contracts/hook-file.md) y `export`
  distinto de `export default` se marcan como error en el editor (R4) y bloquean la activación.
- **Alternatives considered**: esbuild-wasm (descartado en D2: ~3,8 MB y `wasm-unsafe-eval`);
  TypeScript `transpileModule` (el compilador entero en el sandbox para quitar tipos);
  transpilar en el panel y guardar el JS (duplica el almacenamiento y separa código y binario).

## R4 — Editor y comprobación de tipos

- **Decision**: **CodeMirror 6** con resaltado de TypeScript (`@codemirror/lang-javascript`) y un
  **servicio de lenguaje de TypeScript** en un Worker del panel (`hook-types.worker.ts`) con un
  host en memoria propio (sin `@typescript/vfs`): `lib.es2022` (sin `lib.dom`, así que
  `fetch`, `window` y `document` ya son errores de tipo), el `HookContext.d.ts` de
  `packages/hook-runtime` y el archivo del hook. El editor pide al Worker diagnósticos,
  autocompletado y descripciones (`@codemirror/lint`, `@codemirror/autocomplete`, tooltip de
  hover), con 300 ms de espera tras dejar de escribir. Editor y Worker son un chunk aparte que
  se carga con `import()` al abrir un hook (FR-019, SC-007).
- **Teclado y lector de pantalla** (FR-018): Tab escribe una tabulación (`indentWithTab`);
  Escape y luego Tab sale del editor, como recomienda CodeMirror; el texto de ayuda lo dice junto
  al editor. Los diagnósticos se anuncian en una región `aria-live` resumida ("2 errores, línea
  4: …") y el panel de diagnósticos de `@codemirror/lint` es navegable con teclado.
- **Activación** (FR-016): el panel guarda con la regla `check: { hash, ok }` del último
  análisis; el SW activa una regla con hook solo si `ok` y `hash` coincide con el del código
  guardado (FNV-1a de `packages/hook-runtime`). El SW no puede compilar TypeScript (pesaría
  varios MB en el SW); el panel es una página de la extensión y es de confianza.
- **Experimento X3** (`e2e/experiments/x3-editor.spec.ts` + medición del build): con un hook de
  200 líneas, (a) tamaño gzip del chunk del editor y del Worker de tipos con CodeMirror frente a
  Monaco (`monaco-editor` ESM con su worker de TS); (b) ambos funcionan bajo
  `script-src 'self'` sin `unsafe-eval`; (c) latencia de diagnósticos y autocompletado < 1 s
  (SC-005). **Respaldo**: si CodeMirror no llega a SC-005 o Monaco es < 20 % más grande, Monaco.
- **Rationale**: la comprobación de tipos exige el compilador de TypeScript con cualquiera de los
  dos (~0,9 MB gzip); CodeMirror añade ~150 KB frente a varios MB de Monaco, es modular,
  accesible y se tematiza con los tokens de 004 (R13).
- **Alternatives considered**: Monaco (pesado, inyecta su propio CSS y su tema no sigue los
  tokens del panel); textarea con resaltado propio (sin autocompletado ni tipos: incumple
  FR-013); comprobar solo sintaxis con Sucrase (sin errores de tipo: incumple el escenario 3 de
  US1).

## R5 — Contexto del hook y enmascarado

- **Decision**: `buildHookContext(view, stage, permissions)` de `packages/hook-runtime` arma el
  objeto que viaja al Worker (solo datos, sin funciones); el runtime del Worker le añade las
  utilidades (`json()`, `setHeader()`, `removeHeader()`, `graphql.operationName`, `log()`,
  `respond()`) y `state`. Ver [contracts/hook-api.md](./contracts/hook-api.md).
- **Enmascarado** (FR-004): sin el permiso `readSensitive`, el valor de cada header sensible
  (`isSensitiveHeader` de 002) se reemplaza por `MASK` **en el panel, antes de enviarlo al
  sandbox**: el valor real nunca entra en el sandbox (SC-011). Al volver, `mergeMasked` resuelve
  cada header sensible: valor igual a `MASK` y nombre existente ⇒ valor original; valor nuevo ⇒
  el nuevo; ausente ⇒ quitado.
- **Rationale**: enmascarar fuera del entorno no confiable es la única forma verificable de que
  el código del dev (o de un tercero) no vea el valor.
- **Alternatives considered**: enmascarar dentro del Worker (el valor ya estaría en memoria del
  código no confiable); un objeto `Proxy` (mismo problema).

## R6 — Validación del resultado y permiso de destino

- **Decision**: `validateHookResult(before, after, stage, permissions)` compara el contexto
  devuelto con el original: (1) Zod de la forma por etapa; (2) campos de solo lectura sin
  cambios; (3) reglas de 002 (`validatePausedEdit` para Request/Response, `validateQueueMock`
  para `respond`): status 100–599, headers válidos, body de texto ≤ 5 MB; (4) si cambió el
  origen de la URL (`parseOrigin`) y la regla no tiene `changeDestination`, error
  `destination_not_allowed` (FR-010). Devuelve un `HookEffect` (`unchanged`, `edit` con las
  partes cambiadas, `respond`) o un error con campo y motivo. El SW repite (3) y (4) antes de
  aplicar.
- **Body no textual** (FR-006): llega `{ kind: "binary" | "tooLarge" | "none", contentType,
  size }`; si el hook fija un texto, reemplaza al original; si no lo toca, el original sigue
  intacto (la edición no incluye body).

## R7 — `state` compartido con reintentos

- **Decision**: el `state` vive en el panel (`HookHost`), por pestaña, con un número de versión.
  Cada ejecución recibe una copia y su versión; el Worker devuelve `stateChanged` y el `state`
  nuevo. Al terminar: sin cambios ⇒ nada; con cambios y versión igual ⇒ se guarda (versión + 1);
  con cambios y versión distinta ⇒ se repite la ejecución con el `state` actual, hasta 3 intentos
  en total dentro de los 2 s; después, error `state_conflict` (FR-009). Una ejecución con error o tiempo
  agotado no guarda (FR-023). Límite: 1 MB del JSON en UTF-8 al guardar (error `state_too_large`).
  Recargar o navegar no lo vacía; "Vaciar estado" en la consola, sí, con "Deshacer" durante
  10 s que restaura la copia anterior (`restore`, FR-008).
- **Reintentos en serie**: los primeros intentos corren en paralelo; los que chocan se repiten
  **de uno en uno** (cola del `HookHost`), cada uno con el `state` recién leído. Así 20
  ejecuciones simultáneas que incrementan un contador terminan en 20 con 2 intentos como mucho
  (SC-012, `hrtests/state.test.ts`).
- **Rationale**: copia + comparación de versión (concurrencia optimista) da contadores exactos
  con ejecuciones paralelas (SC-012) sin serializar todo. Repetir un hook es seguro: no tiene
  efectos fuera de su resultado (sin red) y solo cuentan los `log()` del último intento.
- **Alternatives considered**: serializar las ejecuciones (un hook lento frena a todos);
  `SharedArrayBuffer`/`Atomics` (exige aislamiento entre orígenes y no sirve para JSON).

## R8 — Cadena y prioridad

- **Decision**: nueva función de dominio `selectChain(rules, view, context)` en
  `packages/domain` junto a `selectRule`: recorre las candidatas en orden; si la primera que
  cumple es de otra acción, devuelve esa regla (comportamiento de 002); si es un hook, devuelve
  **todas** las reglas con hook que cumplen, en orden, saltando las de otras acciones
  (FR-012). Si alguna necesita el body, `needsBody` como hoy. `selectRule` queda para quien no
  conoce hooks. El `HookHost` pliega la cadena: cada hook recibe el resultado combinado; uno que
  falla no aporta (R6); uno que responde en etapa Request la termina (FR-010). Sin límite de
  tiempo propio (clarificación).
- **Efectos en Tráfico**: `RuleEffect` admite `hooked` (cambió algo), `hook_unchanged`,
  `hook_failed` y `hook_responded`, uno por regla de la cadena, con la duración; la pestaña Hooks
  usa el detalle que guarda el panel (R11).

## R9 — Suspensión automática

- **Decision**: el `HookHost` cuenta errores seguidos por regla; al quinto, la marca como
  suspendida (memoria del panel): sus ejecuciones se saltan sin enviarse al sandbox, el panel
  muestra un aviso con "Reanudar" y la lista de reglas la etiqueta. Una ejecución correcta pone
  la cuenta a cero; reanudar o guardar un cambio en el hook la quita (FR-022). El SW no se entera:
  sigue pausando, pero el panel responde al instante (< 1 ms de trabajo), sin esperar (SC-013).
- **Alternatives considered**: avisar al SW para quitar el patrón de `Fetch` (más mensajes y
  estado duplicado por una ganancia de microsegundos).

## R10 — Persistencia y límites

- **Decision**: la acción `hook` se añade a `ActionSchema`:
  `{ kind: "hook", source, imported, permissions: { changeDestination, readSensitive }, check:
  { hash, ok } }`, guardada en `nahual.rules.v1` como el resto (sin cambiar la versión: un
  miembro nuevo de la unión). `rule-store` rechaza al guardar: código > 100 KB, suma de todos los
  hooks > 5 MB (con el uso actual en el error) y activar con `check` no válido (FR-016, FR-034).
  Un hook importado se guarda con `enabled: false`, `imported: true` y permisos en `false`
  (FR-037).
- **Rationale**: 5 MB de hooks dejan espacio a reglas, ajustes e ignorados dentro de los 10 MB de
  `chrome.storage.local` sin `unlimitedStorage` (clarificación).

## R11 — Consola, pestaña Hooks e indicador

- **Decision**: el `HookHost` guarda en memoria las ejecuciones por intercambio (para la pestaña
  Hooks del detalle) y la consola: anillo de 1,000 entradas; los errores **consecutivos** del
  mismo hook con el mismo mensaje se agrupan con contador, como Console (FR-027); cada registro se
  convierte a texto en el Worker (como `JSON.stringify` con límite) y se recorta a 10 KB.
  Nada se guarda ni se exporta (FR-029). "Limpiar consola" se puede deshacer durante 10 s.
- **Redacción de registros** (FR-030, SC-014, principio I): al convertir cada registro a texto,
  el Worker recorre el valor y reemplaza por `MASK` los valores de claves con nombre sensible
  (`isSensitiveName` de 005: criterio de headers de 002 más `password`, `_` como `-`), incluidos
  los de objetos de headers, y los parámetros de query sensibles dentro de URLs; a los textos
  sueltos les aplica la redacción por pares clave/valor de `redactDiff`. Los valores reales viajan
  aparte, solo en memoria del panel, y se muestran con "Mostrar valores sensibles" (como el diff
  de 005) hasta cerrar la consola. No depende del permiso de leer valores sensibles.
  **Ajuste de implementación**: el runtime del Worker es una función serializada a `Blob` y no
  puede importar el dominio, así que el Worker solo convierte cada registro a texto (JSON con
  límite) y la redacción la hace el **panel** (de confianza) con la redacción de texto de 005
  (`redactText`: pares `"clave": valor`, query y líneas de header). El panel guarda el texto real
  aparte, en memoria. El indicador de la barra (slot `STATUS_ITEMS` de 004) cuenta errores sin leer; abrir
  la consola los marca leídos.
- **Detalle**: pestaña `hooks` en `DETAIL_TABS` (previsto en 004), visible cuando el intercambio
  tiene ejecuciones.

## R12 — Archivo `.ts`, importación y tipos

- **Decision**: formato en [contracts/hook-file.md](./contracts/hook-file.md): bloque inicial
  `/* @nahual-hook 1` + JSON de la regla + `*/`, y el código debajo. `serializeHookFile` y
  `parseHookFile` en `packages/hook-runtime` (Zod para el JSON). Importar: `<input type=file>`,
  `File.size` ≤ 100 KB antes de leer, `TextDecoder("utf-8", { fatal: true })`, vista previa con la
  configuración y el código como texto (sin cargar el editor ni ejecutar nada), regla nueva
  desactivada en el sitio actual. Exportar y "Descargar tipos" con un `Blob` y un enlace
  `download` (sin red). Los permisos nunca se exportan.
- **Tipos**: `packages/hook-runtime/src/hook-context.d.ts` es la fuente única: la usa el Worker de
  tipos y es el archivo que se descarga (FR-039).

## R13 — Interfaz igual a DevTools

Cada pieza nueva copia su equivalente nativo y reutiliza los componentes de 004 (Toolbar,
IconButton, Tabs, Drawer, detalle, densidad, tokens `--nh-*`). Ver
[contracts/panel-ui.md](./contracts/panel-ui.md).

| Pieza de Nahual | Equivalente en DevTools | Qué se copia |
|---|---|---|
| Editor del hook | Editor del panel Sources | Fuente monoespaciada y tamaño de Sources, numeración en el margen, línea activa, subrayado ondulado rojo/amarillo y marca en el margen para errores, colores de sintaxis de DevTools en claro y oscuro, caja de sugerencias como la de Sources/Console |
| Consola de hooks (cajón) | Console en el cajón (Esc) | Barra con limpiar (icono), filtro de texto y niveles; filas con icono de nivel, fondo y texto de error del tema; contador redondo para mensajes repetidos; enlace a la derecha ("regla · GET /ruta") como el `archivo:línea` de Console |
| Indicador de errores | Contador de errores de la barra de DevTools | Icono de error rojo + número; un clic abre el cajón en la consola |
| Pestaña Hooks del detalle | Pestañas Timing/Initiator de Network | Tabla compacta por ejecución con duración, como Timing |
| Permisos de la regla | Casillas de Ajustes de DevTools | Casilla + texto + explicación en gris |
| Vista previa al importar | Vista de un archivo en Sources (solo lectura) | Código con números de línea, sin edición |

Las capturas de regresión visual de 004 se amplían con estas vistas en claro y oscuro a 320, 800
y 1280 px.

## R14 — Protocolo v5

- **Decision**: `PROTOCOL_VERSION = 5`. Nuevo evento SW → panel `hookRun` y comando panel → SW
  `hookResult`; `RuleResult` amplía con los resultados de R8; la acción `hook` viaja en
  `setRule`/`rules` como cualquier acción. Ver
  [contracts/panel-protocol.md](./contracts/panel-protocol.md). La mensajería panel ↔ sandbox es
  propia (no es el protocolo del SW): [contracts/sandbox-messaging.md](./contracts/sandbox-messaging.md).

## R15 — Orden con la relajación CORS

- **Decision**: no requiere código nuevo de orden: la relajación de 003 envuelve al ejecutor
  (`createRelaxingExecutor`) y se aplica al ejecutar `continueEdited`/`respond`, es decir,
  **después** del hook (FR-013). Los preflight que responde localmente se resuelven antes de
  buscar reglas, así que nunca llegan a `selectChain`. Una prueba de integración lo fija.

## R16 — Rendimiento

- **Decision**: medir con el método de E4 (001) una regla con hook trivial: overhead p95 < 10 ms
  frente a la misma regla con "Solo registrar" (SC-002), en `e2e/hooks-perf.spec.ts` (`@perf`).
  El camino sin hooks no cambia (sin reglas con hook no se crea el iframe ni se carga Sucrase).
- **Experimento X2** (`e2e/experiments/x2-hook-latency.spec.ts`): ida y vuelta SW → panel →
  sandbox → Worker con un hook trivial y con un body JSON de 1 MB; tiempo de Sucrase para un hook
  típico (< 50 ms, pendiente de D2). **Respaldo** si p95 ≥ 10 ms: Worker precalentado por hook
  activo al abrir el panel y caché del código transpilado.

## R17 — Pruebas de escape y de garantías

- **Decision**: `e2e/hooks-escape.spec.ts` activa un hook por vector de FR-032 (`fetch`, XHR,
  WebSocket, `EventSource`, `importScripts`, `sendBeacon`, `chrome`, `parent`, `top`, `opener`,
  `document.cookie`, `localStorage`, `indexedDB`, Worker anidado, `location` y un `import()`
  dinámico) contra un servidor que registra cualquier request recibido: 0 requests y error de
  acceso en la consola (SC-001). `tests/dist`: la CSP de `sandbox` del manifest es la de R2;
  `extension_pages` sigue sin `unsafe-eval`; `new Function` solo aparece en el chunk del sandbox.
  Pruebas de la mensajería: un `hello` de otra ventana, un mensaje sin `runId` conocido o con
  forma inválida se descartan.

---

## Resultados

### Experimentos X1–X3 (2026-10-25, Chromium 156 de Playwright, Linux)

- **X1** (`e2e/experiments/x1-sandbox.spec.ts`), con una sonda solo del build de pruebas en
  `src/sandbox/sandbox.ts`:
  - (a) crxjs copia la página de `sandbox.pages`, pero no procesa su script; se añadió a
    `rollupOptions.input`. Con eso, el script de módulo carga con origen `null` y Chrome aplica la
    CSP del manifest: cada bloqueo sale en consola como violación de `connect-src 'none'`.
  - (b) el `hello` llega con `event.origin === "null"` y `event.source` igual al iframe; el canal
    con `MessageChannel` funciona sin `targetOrigin "*"`.
  - (c) el sandbox crea un Worker desde un `Blob` y el Worker evalúa con `new Function`.
  - (d) desde el Worker fallan `fetch` (`TypeError`), XHR (`NetworkError`), `importScripts`
    (`NetworkError`), un Worker anidado (`SecurityError`) e `import()` dinámico; `chrome` y `parent`
    no existen. `WebSocket` y `EventSource` se crean sin lanzar, pero la CSP bloquea la conexión;
    asignar `location.href` en el Worker no navega. **0 requests** en `/leak` de la API y del
    tercer origen. La página sandbox tampoco puede hacer `fetch`.
  - (e) `terminate()` corta un `while (true)` (respuesta a los ~310 ms con un corte de 300 ms).
  - (f) la pila conserva `hook.js:L`; `new Function` añade **2 líneas**: la línea 3 del texto del
    dev sale como `hook.js:5`.
  - **Consecuencia**: R2 sin respaldo. El runtime del Worker además reemplaza `fetch`,
    `XMLHttpRequest`, `WebSocket`, `EventSource`, `importScripts` y `Worker` por funciones que
    lanzan `access_denied`, para que el error sea inmediato y claro aunque la CSP ya bloquee.
- **X2** (`e2e/experiments/x2-hook-latency.spec.ts`): ida y vuelta panel ⇒ sandbox ⇒ Worker con un
  hook trivial: Worker en frío p50 5,1 ms / p95 7,0 ms; **en caliente p50 0,1 ms / p95 0,2 ms**; en
  caliente con un body JSON de 1,1 MB p50 4,2 ms / p95 5,1 ms. Sucrase con un hook de 46 líneas
  (en Node) p50 0,75 ms / p95 1,3 ms (D2 de 001: < 50 ms, cumplido). El tramo SW ⇔ panel se mide
  de punta a punta en T060. **Consecuencia**: R16 sin respaldo; un Worker por hook reutilizado
  basta; el precalentado (R2) evita el coste en frío en la primera ejecución.
- **X3** (builds mínimas con Vite 8.3.4 en un directorio temporal):

  | Editor | Chunk del editor (gzip) | Worker de TypeScript (gzip) | Total (gzip) | `eval`/`new Function` |
  |---|---|---|---|---|
  | CodeMirror 6 + servicio de lenguaje propio | 149 KB | 979 KB | **1,13 MB** | ninguno |
  | Monaco 0.52.2 (ESM, worker de TS) | 572 KB + 11 KB CSS + 81 KB worker | 1,31 MB | 1,98 MB | **sí, en su worker de TS** |

  **Consecuencia**: R4 confirmada: CodeMirror. Monaco pesa un 75 % más y su worker de TypeScript
  necesitaría `unsafe-eval` en las páginas de la extensión, que la constitución prohíbe. La
  latencia de SC-005 se mide con el servicio real en T033.

### Ajustes de implementación (Foundational)

- **Preflights fuera de los hooks**: como el Mock de 002, un preflight (`OPTIONS` con
  `Access-Control-Request-Method`) no pasa por hooks; su respuesta es del navegador y de la
  relajación CORS (R15). `rule-engine` lo comprueba antes de mandar la cadena.
- **Relajación sobre el resultado de un hook** (FR-013): la relajación de 003 respeta los
  `Access-Control-*` que el dev fija a mano en una pausa ("pinned") y no actúa si el servidor ya
  respondía con CORS válido. Para los hooks se pasa `fromHook` al ejecutor: lo que deja el hook se
  trata como la respuesta del servidor, así que la relajación decide sobre esos headers y
  prevalece (si un hook quita `Access-Control-Allow-Origin`, vuelve). Prueba en
  `tests/integration/hook-runner.test.ts`.
- **Chunk compartido**: Rollup había puesto Zod y el dominio en el chunk de entrada del panel y
  el sandbox lo importaba (cargaba código del panel). `vite.config.ts` los separa en `shared`;
  `tests/dist` comprueba que el único `Function(` del build está en el runtime del Worker y que
  Sucrase va solo en el sandbox y sin su CLI. Sucrase lleva como texto el código de su
  transformación de react-hot-loader (`eval(code)` dentro de una cadena), que Nahual no usa; se
  permite ese fragmento exacto.
- **`hashSource`** con aritmética de 16 bits: con `BigInt` por byte, guardar 51 hooks de 100 KB
  tardaba más de 5 s.
- **Suite de escape** (`e2e/hooks-escape.spec.ts`, T022/T031): 16 vectores × 2 destinos (API y
  tercer origen) = 32 casos en verde; ningún request llega a `/leak`.
- **Zod 4.6.6**: ver plan.md "Dependencias".

### Interfaz frente a DevTools (US1, T043)

- **D3** (`e2e/experiments/d3-devtools-syntax.spec.ts`, Chromium 156): tokens de sintaxis de
  Sources (`--sys-color-token-*`), superficies de error y aviso de Console
  (`--sys-color-surface-error`, `--sys-color-surface-yellow` y sus textos) y la fuente del editor
  (`--source-code-font-family`: Noto Sans Mono, 11 px). Se copiaron a `--nh-syntax-*`,
  `--nh-console-*` y `--nh-source-*`; todos superan 4,5:1 sobre su fondo en ambos temas.
- **Revisión de las capturas** (`e2e/visual`, claro y oscuro a 320, 800 y 1280 px): el editor
  coincide con Sources (fuente, numeración en gris, línea activa, colores, subrayado ondulado y
  marca de error en el margen); la pestaña Hooks coincide con Timing (tabla compacta, cabecera en
  la superficie de barra) y su error con una fila de error de Console. Diferencia que queda: la
  caja de sugerencias muestra como mucho 10 opciones a la vez (Sources muestra más con scroll),
  porque una lista con scroll propio no es enfocable y axe la marca (`scrollable-region-focusable`).
- **Teclado**: "Esc y luego Tab" sale del editor (lo trae CodeMirror, con 2 s de margen); con las
  sugerencias abiertas, la primera Esc las cierra, como en Sources.

### Ajustes de implementación (US2)

- **Cajón plegado y solo con hooks**: el cajón de 004 se mostraba siempre que tenía contenido y
  desplegado. Con la consola de hooks registrada, aparecería en todos los paneles. Ahora, como la
  consola de DevTools, empieza plegado (`drawerExpanded` en el store) y solo aparece si hay reglas
  con hook o registros (`DRAWER_SLOT.visible`). El contador de errores lo despliega filtrado a
  errores; ver la consola marca los errores como leídos.
- **Agrupado**: solo se agrupan errores consecutivos del mismo hook y mismo mensaje (Console
  hace lo mismo); un registro de otro hook en medio corta el grupo.
- **Icono de error**: círculo con ×, como Console (`icons.tsx`, `error`), en la consola, el
  contador y la pestaña Hooks.

### Rendimiento (SC-002, T060)

`e2e/hooks-perf.spec.ts` (`@perf`, método de E4: 300 requests por caso, se descartan los 20
primeros), Chromium de Playwright, Linux:

| Caso | p50 | p95 |
|---|---|---|
| Sin reglas | 1,1 ms | 2,0 ms |
| Regla "Solo registrar" | 1,8 ms | 2,6 ms |
| Misma regla con hook trivial | 3,3 ms | 5,5 ms |
| **Overhead del hook** | **1,5 ms** | **2,9 ms** |

Overhead p95 de 2,9 ms frente al límite de 10 ms. Sin reglas con hook el camino no cambia:
`selectChain` devuelve una cadena vacía y no se envía `hookRun`.

### Tamaño de los bundles (SC-007, T061)

Carga inicial del panel = `panel.html` y sus imports estáticos (sin `import()` dinámico), build de
producción. 005 se midió en un worktree de `main` (5cc7d55).

| | Bytes | gzip |
|---|---|---|
| 005 | 606.793 | 175.864 |
| 006 | 651.632 | 190.412 |
| Diferencia | +7,4 % | +8,3 % |

Chunks nuevos, fuera de la carga inicial:

| Chunk | Bytes | gzip | Se carga |
|---|---|---|---|
| `HookEditor-*.js` (CodeMirror 6 y el editor) | 476.914 | 157.478 | al abrir un editor de hook |
| `hook-types.worker-*.js` (TypeScript y `lib.es2022.d.ts`) | 4.167.532 | 1.066.672 | al abrir un editor de hook |
| `sandbox-*.js` (Sucrase y el runtime) | 206.531 | 47.573 | con la primera regla con hook activa |

Apertura del panel (7 aperturas tras una de calentamiento, mediana, desde la navegación a
`panel.html` hasta que la pestaña Traffic es visible): 005 78 ms, 006 77 ms.

`tests/dist/bundles.test.ts` fija lo anterior: la carga inicial no contiene CodeMirror, el
servicio de lenguaje de TypeScript ni Sucrase, y mide como mucho 1,10 × la de 005.
`tests/dist/no-network.test.ts` admite `declare function eval(` porque el chunk del servicio de
tipos lleva `lib.es2022.d.ts` como texto.

### Estabilidad (T065)

`pnpm e2e` (198 pruebas, 4 workers) tres veces seguidas y la suite visual:

- Primera serie: 198/198, 192 pasadas y 1 fallo, 198/198; visual 2/2. El fallo fue
  `hooks-a11y.spec.ts` "editor del hook solo con teclado", por dos causas de la prueba y no de
  la extensión: pedía sugerencias antes de que el servicio de tipos terminara de arrancar en frío
  (más de 5 s con el suite en paralelo), y pulsaba Enter dentro de los 75 ms en que CodeMirror
  ignora aceptar tras abrir la lista (`interactionDelay`, protege de aceptar por accidente). La
  prueba ahora espera "No problems." y la opción seleccionada; 10/10 repetida sola.
- Segunda serie, con la corrección: 198/198 las tres veces (5.1, 5.1 y 5.2 min).
- Sigue presente la intermitencia conocida de 003 (CORS); no apareció en estas corridas.
