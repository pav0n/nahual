# Research: Captura de tráfico e intercept condicional

**Feature**: `002-captura-intercept` | **Fecha**: 2026-10-22

Decisiones tomadas en `/speckit-plan`. Parten de [001/research.md](../001-spike-cdp/research.md),
en especial D3 (json-p3), D6 (sesión), D6b (`continueResponse` con status), E1 (preflight
interceptable) y E4 (overhead de ~0,6 ms en el fixture local).

Criterios para dependencias (los de 001): licencia permitida por `scripts/check-licenses.mjs`,
sin `eval` ni `new Function` en el bundle (lo verifica `tests/dist/no-network.test.ts`), versión
exacta publicada hace al menos 14 días, mínimas dependencias transitivas.

---

## R1. Captura pasiva con el dominio Network

- **Decision**: con el debugger adjunto, siempre `Network.enable` con
  `maxResourceBufferSize = 5 MB` y `maxTotalBufferSize = 50 MB`. El SW traduce los eventos
  `requestWillBeSent`, `requestWillBeSentExtraInfo`, `responseReceived`,
  `responseReceivedExtraInfo`, `loadingFinished` y `loadingFailed` a actualizaciones de
  `CapturedExchange`. Los bodies no viajan con la captura: se piden bajo demanda al abrir el
  detalle (`Network.getResponseBody`, `Network.getRequestPostData`).
- **Rationale**: cumple "sin reglas activas, solo captura pasiva" (principio VI) y FR-001. Pedir
  bodies bajo demanda acota la memoria del panel (2,000 entradas sin bodies) y evita mover
  megabytes por el puerto. Los eventos `ExtraInfo` traen los headers reales (incluidas cookies)
  que el navegador envía y recibe.
- **Consecuencia**: si Chrome desalojó el body de su buffer, el detalle muestra "body ya no
  disponible" con la causa. Los bodies que Nahual obtuvo al interceptar (etapa Response) sí se
  conservan en el SW mientras el intercambio está en la cola.
- **Alternatives considered**: guardar todos los bodies en el SW (memoria sin tope, contrario a
  los límites del principio VI); usar solo Fetch para capturar (obligaría a interceptar todo y
  rompe "Fetch solo con patrones de reglas activas").

## R2. Correlación Network ↔ Fetch

- **Decision**: la identidad de un intercambio es el `requestId` de Network. `Fetch.requestPaused`
  trae `networkId`, que coincide con él; con eso se marca qué regla actuó (FR-002). Si un
  `requestPaused` llega antes que su `requestWillBeSent`, se crea la entrada con los datos del
  evento Fetch y se completa al llegar Network.
- **Redirecciones**: Network reutiliza el `requestId` en cada salto (`redirectResponse`); Nahual
  cierra la entrada anterior como 3xx sin body y abre una nueva con sufijo `#n` (edge case de
  redirecciones).

## R3. Cálculo de patrones de `Fetch.enable`

- **Decision**: función pura `computeFetchPatterns(activeRules)` en `packages/domain`:
  1. Solo reglas activas del sitio actual y con "pausar Nahual" apagado; sin ninguna ⇒
     `Fetch.disable`.
  2. Por cada regla y etapa: prefiltro glob ⇒ `urlPattern` igual al glob (misma sintaxis `*`/`?`
     que `Fetch.RequestPattern`); prefiltro regex ⇒ `urlPattern: "*"`.
  3. Tipos de recurso: si la regla filtra por tipos, un patrón por tipo (`resourceType`); si no,
     sin `resourceType`.
  4. Reducción: dentro de una etapa, un patrón `*` sin `resourceType` absorbe a todos los demás;
     un patrón `*` con tipo absorbe a los de ese tipo; se eliminan duplicados exactos.
  5. Tope de 50 patrones; si se supera, la etapa se reduce a `*` (correcto, porque el RuleEngine
     vuelve a evaluar el prefiltro con precisión).
- **Rationale**: Fetch solo pausa lo que podría cumplir una regla (principio VI); el RuleEngine
  evalúa después el prefiltro exacto, así que un patrón más amplio nunca cambia el resultado,
  solo el costo. Se recalcula al cambiar reglas, ajustes o el sitio de la pestaña.
- **Glob**: `*` = cualquier secuencia (incluida `/`), `?` = un carácter, el resto literal; el
  glob se compara con la URL completa. Se escapa `\` como en CDP.

## R4. Evaluación de reglas en el service worker

- **Decision**: `RuleEngine` (adaptador en el SW) llama a funciones puras de `packages/domain`:
  `selectRule(rules, exchangeView, stage) ⇒ { rule, evaluation } | null`. Orden de evaluación
  dentro de una regla, de barato a caro: método y tipo ⇒ prefiltro ⇒ status ⇒ headers y query ⇒
  condiciones que necesitan body. El body se pide (`Fetch.getResponseBody` en Response, `postData`
  en Request) solo si alguna regla candidata sobrevivió a las condiciones baratas y tiene una
  condición de body; se pide una vez por intercambio y se comparte entre reglas.
- **Prioridad**: la primera regla en el orden de la lista que se cumple gana (FR-016). Una regla
  de Request y otra de Response se evalúan por separado.
- **No evaluable** (FR-012): body ausente, binario (no UTF-8 válido o content-type no textual),
  > 5 MB (por `Content-Length` antes de pedirlo, o por tamaño real después), JSON inválido o
  request que no es GraphQL ⇒ la condición es `false` y la evaluación devuelve
  `unevaluable: reason`, que se registra en la entrada.
- **Fallo seguro**: cualquier excepción del motor ⇒ `continueRequest`/`continueResponse` sin
  cambios y error registrado sin valores (principio II).

## R5. JSONPath

- **Decision**: `json-p3` **3.0.0** (decidido en 001-D3; 3.0.0 es la versión evaluada allí y
  cumple los 14 días). Se usa en `packages/domain` para condiciones y en validación al guardar
  (FR-013: compilar la ruta). La consulta devuelve un nodelist; la semántica de operadores es:
  - `existe` ⇔ nodelist no vacío; `no existe` ⇔ vacío.
  - Los demás operadores se cumplen si **algún** nodo los cumple (`igual`, `contiene`, regex,
    numéricos) — salvo `está vacío`, que exige que **todos** los nodos estén vacíos y al menos
    uno exista. Vacío = `[]`, `{}`, `""` o `null`.
  - `igual`/`distinto` comparan JSON canónico (el valor del usuario se parsea como JSON; si no
    es JSON válido se trata como texto).
- **Alternatives considered**: ver 001-D3 (jsonpath-plus rechazada por `new Function`).

## R6. GraphQL

- **Decision**: sin librería. Un request es GraphQL si su body JSON (o la query de un `GET`)
  tiene `query` de tipo texto. `operationName` se toma del campo; si falta, de la primera
  definición `query|mutation|subscription <Nombre>` del texto con una expresión acotada. Batch
  (arreglo de operaciones): la condición se cumple si alguna operación la cumple. `errors`
  presente ⇔ la respuesta JSON tiene `errors` como arreglo no vacío.
- **Rationale**: lo que exige la spec no necesita un parser de GraphQL completo (~40 KB gzip y
  más superficie).

## R7. Aplicar acciones y ediciones con CDP

| Caso | Comando CDP |
|---|---|
| Continuar sin cambios | `continueRequest` / `continueResponse` sin parámetros |
| Request editado (método, URL, headers, body) | `continueRequest { method, url, headers, postData (base64) }` |
| Response editada solo en status/headers | `continueResponse { responseCode, responseHeaders }` (001-D6b) |
| Response con body editado | `fulfillRequest { responseCode, responseHeaders, body (base64) }` |
| Mock (Request o Response) | `fulfillRequest` |
| Fallar / Abortar | `failRequest { errorReason }` |
| Retrasar | temporizador ⇒ `continueRequest`/`continueResponse` |

- **Body editado y compresión**: `getResponseBody` devuelve el contenido ya descomprimido; al
  responder con un body nuevo, Nahual elimina `Content-Encoding` y recalcula `Content-Length`
  (edge case de bodies comprimidos).
- **Errores de red** (FR-019): fallido ⇒ `Failed`, abortado ⇒ `Aborted`, timeout ⇒ `TimedOut`,
  conexión rechazada ⇒ `ConnectionRefused`, nombre no resuelto ⇒ `NameNotResolved`, acceso
  denegado ⇒ `AccessDenied`, sin conexión ⇒ `InternetDisconnected`. Abortar desde la cola usa
  `Aborted`.
- **Verificado en la E2E** (`conditional-pause.spec.ts`, "research R7"): Chrome **acepta** un
  cambio de URL a otro origen en `continueRequest`. El request va al nuevo origen sin que la
  página lo note, pero la respuesta sigue sujeta a CORS frente al origen de la página: en la
  prueba, el 404 sin headers CORS del otro origen llegó como `TypeError: Failed to fetch`. La
  página no queda colgada. El editor no necesita advertirlo de antemano; FR-021 cubre los
  fallos de aplicación.
- **Fallo seguro**: igual que en 001 — si el comando falla, un reintento sin cambios y error al
  panel con `messageKey` (FR-021).

## R8. Cola de pausados, timeout y limpieza

- **Decision**: `PauseQueue` por pestaña en el SW (extiende el `FetchInterceptor` de 001):
  orden de llegada, máximo 100, timeout configurable 5–300 s (60 por defecto), resolución
  idempotente por id (lo primero entre acción del dev, timeout, navegación, detach o error).
- **Navegación** (FR-025): `Page.enable` y `Page.frameNavigated` del frame principal. Los items
  con `pausedAt` anterior al commit se resuelven con `continue*` sin cambios (ignorando errores) y
  se registran como `discarded_navigation`. Los pausados después del commit pertenecen al nuevo
  documento. Además se recalcula el sitio de la pestaña (R9).
- **Detach o cierre**: Chrome libera las pausas de una sesión que se cierra (001-D6); el SW marca
  todo como `abandoned`/`continued_on_detach` y avisa al panel si sigue abierto.
- **Retrasos**: viven fuera de la cola visible, con su propio temporizador; los limpia la misma
  rutina de navegación y detach.

## R9. Sitio de la pestaña

- **Decision**: el sitio es el `origin` de la URL del frame principal. Al adjuntar se obtiene con
  `Target.getTargetInfo` y se actualiza con `Page.frameNavigated` (frame sin `parentId`).
  Orígenes opacos (`data:`, `about:blank`, `file:`) ⇒ sitio `null`: no se aplican reglas, solo
  captura, y el panel lo explica.
- **Rationale**: no requiere permisos nuevos (`tabs` o `webNavigation`); CDP ya da la URL.

## R10. Persistencia de reglas y ajustes

- **Decision**: `chrome.storage.local` (cubierto por el permiso `storage` de 001) con claves
  versionadas: `nahual.rules.v1` (todas las reglas, con su `site`) y `nahual.settings.v1`. El SW
  es el **único escritor**: el panel manda comandos y el SW valida con los schemas de
  `packages/domain` antes de escribir. Al leer (arranque y `storage.onChanged`), se valida regla
  por regla; las inválidas se descartan de la memoria (no se borran del disco) y se avisa al panel
  con el conteo y la causa (FR-014).
- **Límites**: 500 reglas en total; body de un mock guardado ≤ 1 MB (el de un mock creado desde
  la cola, que no se guarda, ≤ 5 MB). Con esto el total queda por debajo de la cuota de 10 MB de
  `storage.local`, y no hace falta `unlimitedStorage`. Si la escritura falla por cuota, el error
  llega al panel con causa y solución.
- **Deshacer eliminar** (FR-015): el SW guarda la regla eliminada en memoria 10 s; `restoreRule`
  la reinserta en su posición.
- **Alternatives considered**: IndexedDB (más complejo; no hace falta para < 10 MB);
  `storage.sync` (subiría reglas a la cuenta de Google: contrario a "nada sale del navegador").

## R11. Historial en el panel

- **Decision**: el historial vive en el store del panel (memoria), no en el SW. El SW emite
  actualizaciones agrupadas cada 50 ms (máximo 200 por mensaje); el panel las aplica en un búfer
  circular de 2,000 entradas por pestaña. Cerrar el panel lo descarta (FR-007).
- **Rationale**: el panel ya es el dueño de la pestaña y su ciclo de vida coincide con el del
  historial; agrupar evita un render por request.
- **Deshacer limpiar** (FR-006): el panel conserva la lista limpiada 10 s.

## R12. Store del panel: Zustand + Immer

- **Decision**: `zustand` **5.0.15** con el middleware `immer`, `immer` **11.1.21**. Slices:
  `connection`, `traffic`, `rules`, `queue`, `settings`, `ui`. El búfer de tráfico se actualiza
  con mutaciones de Immer por lote, no por evento.
- **Rationale**: pedido en la entrada; ambas MIT, sin dependencias transitivas, pequeñas
  (~1 KB y ~5 KB gzip). Selectores finos evitan re-renders del resto del panel.
- **Alternatives considered**: `useReducer` + contexto (re-renders amplios con 2,000 filas);
  Redux Toolkit (más peso, incluye Immer igualmente).

## R13. Lista virtualizada

- **Decision**: `@tanstack/react-virtual` **3.14.13** (con `@tanstack/virtual-core` 3.17.11),
  MIT. La lista se marca como `role="grid"` con `aria-rowcount` total y `aria-rowindex` por fila,
  navegación con flechas y foco en la fila activa (patrón APG de grid).
- **Rationale**: SC-004 (filtro < 300 ms y scroll fluido con 2,000 entradas). Headless: no
  impone markup ni estilos, así que la accesibilidad queda bajo control propio.
- **Alternatives considered**: renderizar las 2,000 filas (~12,000 nodos; filtra lento y cada
  lote de actualizaciones re-renderiza todo); `react-window` (menos mantenido).

## R14. Editor de bodies

- **Decision**: sin editor de código en 002. El detalle muestra los bodies en `<pre>` (texto,
  JSON formateado con `JSON.stringify(…, null, 2)`); la edición usa `<textarea>` con acciones
  "Formatear" y "Validar JSON", contador de tamaño y aviso de JSON inválido (edge case de body
  editado inválido).
- **Rationale**: el criterio de la entrada era el peso del bundle. Monaco pesa varios MB, trae
  workers y su carga habitual requiere relajar la CSP; CodeMirror 6 (núcleo + JSON, ~100 KB gzip
  y 6–8 paquetes) es viable pero no lo pide la spec. Un `textarea` es nativo, accesible y sin
  dependencias (principio VII).
- **Reevaluación**: en 005 (hooks en TypeScript), donde un editor con resaltado sí aporta;
  CodeMirror 6 es la candidata preferida frente a Monaco.

## R15. Componentes accesibles

- **Decision**: sin librería de componentes. Elementos nativos (`<dialog>` con `showModal()` para
  onboarding y confirmaciones, `<button>`, `<input type="checkbox" role="switch">`, `<select>`,
  `<details>`) y tres componentes propios siguiendo APG: `Tabs`, `Toast` (región `aria-live`
  para deshacer) y `Grid` (R13).
- **Rationale**: la entrada pide "Radix UI o similar". Radix Dialog sola arrastra ~15 paquetes
  (`@radix-ui/*`, `react-remove-scroll`, `aria-hidden`); el panel corre en Chrome ≥ 120, donde
  `<dialog>` ya atrapa el foco y gestiona `Escape`. Los componentes nativos cumplen WCAG con menos
  superficie de cadena de suministro (principio VII). axe y las pruebas de teclado lo verifican.
- **Alternatives considered**: Radix UI (superficie de dependencias); React Aria (más pesada).

## R16. Atajos de teclado

- **Decision** (`event.code`, como en 001; no chocan con los de DevTools):

  | Atajo | Acción |
  |---|---|
  | `Alt+Shift+A` | Adjuntar / soltar (de 001) |
  | `Alt+Shift+P` | Pausar / reanudar Nahual |
  | `Alt+Shift+C` | Continuar el item seleccionado de la cola (de 001) |
  | `Alt+Shift+K` | Continuar todos |
  | `/` o `Alt+Shift+F` | Ir al buscador del tráfico (`/` solo fuera de campos de texto) |
  | Flechas, `Enter`, `Escape` | Navegar la lista, abrir detalle, cerrar |

- `Ctrl+F` no se usa: DevTools lo captura antes que el panel.

## R17. Adjunto automático y consentimiento

- **Decision**: `settings.attachConsent` y `settings.autoAttach` (por defecto `true` tras el
  consentimiento). Al recibir `hello`, el SW responde con el estado; si hay consentimiento y
  `autoAttach`, el panel envía `attach` de inmediato. Tras un "Soltar" manual el panel no
  reenvía `attach` hasta "Reconectar" o una nueva apertura (FR-027b). El panel recuerda ese
  "Soltar" mientras sigue abierto: si su puerto se reconecta tras un reinicio del SW, no reenvía
  `attach`; sin un "Soltar" previo, sí (con `autoAttach`).
- **Rationale**: la decisión de adjuntar sigue en el panel, que es la única señal de que el dev lo
  tiene abierto (constitución: debugger solo con el panel abierto).

## R18. Enmascarado de headers sensibles

- **Decision**: función pura `isSensitiveHeader(name)` en `packages/domain` (lista de FR-004a),
  usada por el panel para enmascarar y por el logger del SW para redactar (FR-036). Los valores
  reales viajan al panel de la misma pestaña (hacen falta para editar); el enmascarado es de
  presentación.

## R19. Riesgo de regex costosas

- **Decision**: las regex son del propio dev, pero corren en el SW: una con backtracking
  catastrófico bloquearía el SW y con él las pausas. Mitigaciones: longitud ≤ 512 caracteres,
  sin banderas `y`/`g`, compiladas una vez al guardar; texto evaluado acotado (URL ≤ 8 KB, valor
  de header ≤ 8 KB, valor JSON ≤ 64 KB). Riesgo residual documentado en el modelo de amenazas.
- **Alternatives considered**: RE2 en WebAssembly (requiere `wasm-unsafe-eval` en la CSP y
  ~1 MB); ejecutar las regex en un worker con timeout (no hay workers dedicados en el SW de MV3).

## R20. Medición de overhead (SC-002)

- **Decision**: repetir E4 de 001 con cuatro corridas: sin debugger; adjunto sin reglas
  (Network solamente); regla de Request cuyo prefiltro coincide y condición de header no;
  regla de Response con condición JSONPath que no se cumple (incluye pedir el body). Presupuesto:
  p95 del overhead < 20 ms en las corridas 3 y 4. Se registra en este archivo durante la
  implementación.
- **Resultado** (`e2e/experiments/e4-overhead-rules.spec.ts`, fixture local, HeadlessChrome 156,
  Debian 13, 500 fetch secuenciales por corrida tras 10 de calentamiento, 2026-10-22):

  | Corrida | p50 (ms) | p95 (ms) | Overhead p95 (ms) |
  |---|---|---|---|
  | 1. Sin debugger | 1,9 | 4,1 | — |
  | 2. Adjunto, sin reglas (solo Network) | 1,5 | 2,6 | — |
  | 3. Regla Request: prefiltro coincide, condición de header no | 2,6 | 6,6 | **2,5** |
  | 4. Regla Response: prefiltro coincide, JSONPath no (pide el body) | 2,5 | 6,7 | **2,6** |

  Dentro del presupuesto de 20 ms (SC-002). La corrida 2 sale por debajo de la 1 por ruido del
  fixture local; el overhead de la captura pasiva no es medible a esta escala.

## R21. Mocks locales y CORS (decisión de implementación)

- **Contexto**: hallado en la E2E de la historia 4. Un mock respondido con `Fetch.fulfillRequest`
  a un request de **otro origen** no lleva headers CORS, y la página lo descarta (`Failed to
  fetch`). Como casi todas las SPA llaman a su API en otro origen, sin esto "Simular API caída"
  (FR-018) y la acción Mock (FR-019) no servirían.
- **Decision**: función pura `mockHeadersFor` en `packages/domain`: si el request va a otro origen
  que la página y el mock no define `Access-Control-Allow-Origin`, se añade
  `Access-Control-Allow-Origin: <origen exacto de la página>` (nunca `*`) y
  `Access-Control-Allow-Credentials: true`. Se aplica a los mocks de reglas y a los creados desde
  la cola. Los preflight (`OPTIONS` con `Access-Control-Request-Method`) no se responden con el
  mock: continúan sin cambios.
- **Rationale**: el contenido del mock es sintético (lo escribió el dev), así que no expone datos
  de ningún servidor; el origen es exacto y solo afecta a ese mock. Es distinto del modo CORS de
  desarrollo de 003, que relaja respuestas reales del servidor.
- **Limitación**: si el preflight de un request no simple va a una API caída, el preflight falla
  y el mock nunca se aplica. Responder preflights localmente es alcance de 003.

## Tamaño de los bundles (R13/R14)

Build de producción (`pnpm build`), JS sin comprimir y total con `gzip -9`, 2026-10-22:

| Bundle | 001 (`cb2fc9f`) | 002 | Diferencia |
|---|---|---|---|
| Service worker (`index.ts-*.js`) | 9,4 KB | 27,6 KB | +18,2 KB |
| Compartido: Zod, protocolo y dominio con json-p3 (`src-*.js`) | 91,2 KB | 173,2 KB | +82,0 KB |
| Panel: React, Zustand, Immer, react-virtual y vistas (`panel-*.js`) | 224,2 KB | 300,8 KB | +76,6 KB |
| **Total** | **325,1 KB** (97,7 KB gzip) | **501,9 KB** (146,5 KB gzip) | **+176,8 KB** (+48,8 KB gzip) |

Sin editor de código (R14) ni librería de componentes (R15), el panel crece menos de lo que
añadiría solo Monaco. La verificación `verify:dist` confirma que json-p3, Zustand, Immer y
react-virtual están en los bundles revisados sin `eval`, `new Function` ni red propia.

## Estabilidad de la E2E (T106, SC-003)

Suite completa (54 pruebas, HeadlessChrome 156, Debian 13), 2026-10-22:

- **Primera tanda de 10 corridas**: 7 en verde y 3 con **una** prueba fallida cada una (corridas 3,
  5 y 6). El script solo guardaba el resumen, así que no se sabe qué prueba falló.
- **Segunda tanda de 10 corridas**, con registro de fallos: **10 de 10 en verde**, 0 páginas
  colgadas.

Queda una inestabilidad intermitente sin identificar (3 de 20 corridas). Si reaparece, el script
de la segunda tanda guarda el nombre y el error de la prueba.

## Resultados por registrar en implementación

- SC-001: resultados de la prueba moderada con 5 devs (quickstart). El recorrido guiado
  automatizado (`first-use.spec.ts`: onboarding ⇒ plantilla ⇒ pausa ⇒ edición ⇒ continuar) tarda
  ~1,3 s; es solo una referencia, no sustituye a la prueba con personas.
