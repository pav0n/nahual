# Research: CORS de desarrollo

Decisiones técnicas de 003 (Phase 0). Parte de `specs/001-spike-cdp/research.md` (D5, E1, E2) y de
`specs/002-captura-intercept/research.md` (R3, R7, R9, R21). Las preguntas que solo se pueden
cerrar con Chrome real se marcan como **experimento** (X1–X4): se corren al principio de la
implementación y el diseño funciona con cualquiera de sus resultados.

## R1. Estrategia de relajación: CDP Fetch, sin `declarativeNetRequest`

- **Decision**: toda la relajación ocurre en `Fetch.requestPaused`, **etapa Response**, sobre las
  sesiones de debugger que Nahual ya tiene por pestaña:
  1. Respuesta real en el alcance ⇒ `Fetch.continueResponse` con los headers `Access-Control-*`
     calculados y `responseCode` (obligatorio junto con headers, 001-D6b).
  2. Preflight en el alcance ⇒ llega al servidor (clarificación de la spec); si su respuesta
     pasaría la verificación CORS (R8) continúa sin cambios; si no, `Fetch.fulfillRequest` con
     204 y los headers de R7.
- **Rationale**: E1 (001) mostró que los `OPTIONS` pasan por `Fetch` en las dos etapas, y E2 que
  modificar la etapa Response basta para requests sin preflight y que responder el preflight
  localmente resuelve `PreflightInvalidStatus`. La sesión del debugger ya está acotada a una
  pestaña, así que el aislamiento por pestaña es estructural. Interceptar en Response (y no en
  Request como proponía D5) es lo que exige la clarificación: el diagnóstico y el reporte
  necesitan la respuesta real del servidor y el dev se entera cuando backend la corrige.
- **Cambio respecto a D5 de 001**: D5 respondía el preflight en la etapa Request, sin llegar al
  servidor. Ahora llega y solo se reemplaza si fallaría. Costo: el servidor recibe el `OPTIONS`
  (aceptable en desarrollo) y el preflight tarda lo que tarde el servidor.
- **Experimento X5** (resultado: ver abajo): un preflight 401 se reemplaza en etapa Response; uno
  con **redirección** no se puede corregir ahí. **Respaldo adoptado**: la relajación guarda las
  URLs (sin query) cuyo preflight redirige, sembradas con el diagnóstico desde el que se crea
  (`preflight_redirect`) y aprendidas cuando un preflight en el alcance llega a Response con 3xx;
  mientras haya alguna, se añade un patrón de etapa Request para el origen de la API (R11) y los
  `OPTIONS` a esas URLs se responden con 204 local en Request, sin llegar al servidor. El resto de
  requests de esa etapa continúan de inmediato.
- **Alternatives considered**:
  - *Reglas de sesión de `declarativeNetRequest`* (respaldo de la entrada): innecesario porque E1
    fue positivo. Además exige `declarativeNetRequestWithHostAccess` + permisos de host, no
    puede decidir según la respuesta del servidor (no reemplaza un preflight 401 por 204) y su
    `modifyHeaders` no permite derivar `Allow-Headers` de cada preflight.
  - *Responder siempre el preflight en Request* (D5 original): descartado en la clarificación.

## R2. Permisos: ninguno nuevo

- **Decision**: 003 no añade permisos. Se descartan los que proponía la entrada:
  - `alarms`: la relajación vive solo mientras vive la sesión del debugger, y esta no sobrevive
    a un reinicio del service worker (001-D6). Basta con un `setTimeout` por relajación para
    terminarla y avisar, más una comprobación de `expiresAt` contra el reloj en **cada**
    request: aunque el temporizador se retrase, ninguna respuesta se relaja después de vencer.
    Si el SW se suspende, la relajación termina (falla cerrada, FR-016).
  - `declarativeNetRequestWithHostAccess`: no hace falta el respaldo (R1).
  - `tabs` (para `tabs.onRemoved`): cerrar la pestaña produce `chrome.debugger.onDetach` con
    `target_closed` (001-E3), que ya termina todo lo de la pestaña. `tabs.onRemoved` tampoco
    necesita el permiso, pero sería una segunda vía para lo mismo.
- **Rationale**: principio I (mínimo privilegio) y FR-040. `manifest.test.ts` sigue igual.
- **Alternatives considered**: `alarms` para sobrevivir a la suspensión del SW: no aplica,
  porque la relajación no debe sobrevivirla.

## R3. Detección y clasificación de bloqueos CORS

- **Decision**: `Network.loadingFailed` trae `corsErrorStatus: { corsError, failedParameter }`
  cuando el bloqueo es de CORS; si no lo trae (aunque haya `blockedReason`), no es CORS (FR-001,
  escenario 5 de la historia 1). `NetworkCapture` lo pasa al clasificador puro
  `classifyCorsFailure` (`packages/domain/src/cors/classify.ts`), junto con el request (método,
  headers crudos de `requestWillBeSentExtraInfo`), la respuesta si la hubo y el preflight
  relacionado si se observó (R6).

  | `corsError` de Chrome | Causa (FR-003) |
  |---|---|
  | `MissingAllowOriginHeader`, `PreflightMissingAllowOriginHeader` | `missing_allow_origin` |
  | `AllowOriginMismatch`, `InvalidAllowOriginValue`, `MultipleAllowOriginValues` y sus `Preflight*` | `origin_mismatch` |
  | `WildcardOriginNotAllowed`, `PreflightWildcardOriginNotAllowed` | `wildcard_with_credentials` |
  | `InvalidAllowCredentials`, `PreflightInvalidAllowCredentials` | `missing_allow_credentials` |
  | `MethodDisallowedByPreflightResponse`, `InvalidAllowMethodsPreflightResponse` | `method_not_allowed` |
  | `HeaderDisallowedByPreflightResponse`, `InvalidAllowHeadersPreflightResponse` | `header_not_allowed` |
  | `PreflightInvalidStatus` | `preflight_status` |
  | `PreflightDisallowedRedirect` | `preflight_redirect` |
  | Cualquier otro (acceso a red privada, `DisallowedByMode`, `CorsDisabledScheme`, `InvalidResponse`, `RedirectContainsCredentials`, valores futuros) | `unrecognized` con el código |

  `failedParameter` da el header, método u origen concreto que se nombra en la explicación
  (FR-004). Con comodín en métodos o headers y credenciales, el clasificador lo indica como
  parámetro (`*`). El clasificador se prueba con una tabla por valor de `corsError`, incluido
  uno desconocido.
- **Relajable**: solo las causas reconocidas, con origen de la app no `null`, distinto del de
  la API y fuera de la lista de producción (FR-007, FR-023). `unrecognized` muestra el código y
  no ofrece relajar.
- **Alternatives considered**: leer la consola (`Log.entryAdded`): texto no estructurado y
  dependiente del idioma; inferir la causa recalculando CORS a partir de headers: no ve todo lo
  que ve Chrome (redirecciones, modo del request).

## R4. Origen de la app de cada request

- **Decision**: el SW mantiene un mapa `frameId → origin` por pestaña con `Page.frameNavigated`
  (todos los frames, no solo el principal; `frame.securityOrigin`, o el origen de `frame.url`
  si no viene) y lo limpia con `Page.frameDetached` y al soltar. El origen de la app de un
  request es el de su `frameId` (`Network.requestWillBeSent.frameId`,
  `Fetch.requestPaused.frameId`). Si el frame no se conoce, se usa el header `Origin` crudo del
  request; si tampoco hay, el origen es `null` (no relajable).
- **Rationale**: el header `Origin` lo añade el navegador y no siempre aparece en los headers que
  ve `Fetch`; el `frameId` sí. Un iframe de otro origen da su propio origen (caso límite de la
  spec), y los iframes de otro proceso quedan fuera como en 002.
- **Alternatives considered**: usar solo el sitio de la pestaña (002-R9): trataría los iframes
  como la página principal y la relajación los cubriría por error.

## R5. ¿El request lleva credenciales?

CORS distingue el modo de credenciales (`include`), que CDP no expone directamente.

- **Decision**: señal por request, en este orden:
  1. los headers del request en `Fetch.requestPaused` llevan `Cookie` (X1);
  2. el diagnóstico del bloqueo lo implica (`wildcard_with_credentials`,
     `missing_allow_credentials`);
  3. la relajación ya **aprendió** que ese origen de API usa credenciales: si una respuesta
     relajada sin `Allow-Credentials` vuelve a bloquearse con `InvalidAllowCredentials`, la
     relajación marca `credentials: true` para los siguientes y el detalle pide reintentar.
  `Access-Control-Allow-Credentials: true` se añade si alguna señal es positiva (FR-011). Al
  crearse, la relajación toma `credentials` de la casilla "La app envía credenciales" de la
  confirmación, premarcada con la señal del diagnóstico; el aprendizaje (3) queda como respaldo si
  el dev la dejó sin marcar.
- **Experimento X1** (resultado: sí): los headers de `Fetch.requestPaused` en etapa Response
  incluyen `Cookie` cuando el navegador la envía. En el diagnóstico (sin Fetch) la señal sale de
  `requestWillBeSentExtraInfo`.
- **Riesgo residual**: un request con `credentials: "include"` pero sin cookies ni diagnóstico
  previo necesita un reintento (señal 3), mitigado por la casilla de la confirmación. Se documenta
  en el detalle; no rompe el aislamiento.
- **Alternatives considered**: añadir siempre `Allow-Credentials: true`: más simple, pero
  contradice FR-011 y amplía lo que la relajación permite.

## R6. Preflight: visibilidad en Network y relación con su request

- **Experimento X2**: E1 (001) no vio `Network.requestWillBeSent` con `type: "Preflight"`. Se
  repite con el `NetworkCapture` de 002 (que ya marca `isPreflight`) en Chrome estable y en el
  Chromium de Playwright: ¿llega el preflight por Network?, ¿con `initiator.type ===
  "preflight"` e `initiator.requestId`? Prueba: `e2e/experiments/x2-preflight-network.spec.ts`.
- **Decision** (X2 positivo): Network emite el preflight; se relaciona por `initiator.requestId`
  (exacto). `linkPreflights` usa ese id y, solo si falta, la heurística (misma URL,
  `Access-Control-Request-Method` igual al método, preflight ≤ 5 s después, el más cercano). No
  se emiten intercambios sintéticos. Si el preflight no se observó (p. ej. adjunto a mitad de
  la secuencia), el detalle lo indica; la causa sale igual de `corsError` (R3).
- **Rationale**: FR-005/FR-006 piden status del preflight "si los hubo"; la clasificación no
  depende de verlo.

## R7. Headers que inyecta la relajación

- **Decision** (`computeRelaxedHeaders`, `packages/domain/src/cors/headers.ts`, función pura):
  - Se eliminan los `Access-Control-Allow-*`, `Access-Control-Expose-Headers` y
    `Access-Control-Max-Age` del servidor (salvo los que el dev fijó a mano, R9) y se ponen:
  - `Access-Control-Allow-Origin: <origen exacto de la app>`; nunca `*`.
  - `Vary: Origin` (añadido al `Vary` existente si no lo trae).
  - `Access-Control-Allow-Credentials: true` solo con credenciales (R5).
  - Respuesta real: `Access-Control-Expose-Headers` con la lista configurada, si no está vacía.
  - Preflight reemplazado: status 204, sin body, `Access-Control-Allow-Methods` = el
    `Access-Control-Request-Method` del preflight, `Access-Control-Allow-Headers` = los nombres
    de `Access-Control-Request-Headers` (en minúsculas, sin duplicados), y
    `Access-Control-Max-Age: 0` (FR-013, experimento X3).
  - Si el preflight no pide headers, no se envía `Allow-Headers`.
- **Garantía**: la función nunca devuelve `*` en `Allow-Origin`, `Allow-Methods`,
  `Allow-Headers` ni `Expose-Headers`; se prueba con todas las combinaciones de la tabla de casos y
  con entradas que contienen `*` (un `Access-Control-Request-Headers: *` se trata como el nombre
  literal, que el validador de nombres rechaza ⇒ no se relaja ese preflight).
- **Experimento X3**: con `Max-Age: 0`, apagar la relajación y repetir el request de inmediato
  ⇒ debe volver a bloquearse (`e2e/cors-relax.spec.ts` lo cubre como prueba normal). Chrome usa
  5 s por defecto si falta el header, por eso se envía explícito.
- **Experimento X4**: tras `continueResponse` con headers modificados, ¿qué headers reporta
  `Network.responseReceived(ExtraInfo)`? Da igual para el diseño: el detalle muestra los headers
  originales del servidor que el SW guardó al pausar y los que Nahual añadió (FR-026), sin
  depender de Network.

## R8. ¿El preflight del servidor pasaría?

- **Decision**: `preflightPasses(response, request, { appOrigin, credentials })` en
  `packages/domain/src/cors/headers.ts`, versión reducida del algoritmo de la especificación
  Fetch:
  1. status 200–299 (un 3xx ⇒ falla: redirección en preflight);
  2. `Allow-Origin` es exactamente el origen de la app, o `*` sin credenciales;
  3. con credenciales, `Allow-Credentials` es `true`;
  4. el método pedido es `GET`/`HEAD`/`POST` o está en `Allow-Methods` (o `*` sin credenciales);
  5. cada header pedido está en `Allow-Headers` (o `*` sin credenciales y que no sea
     `authorization`).
  Si falla cualquiera ⇒ se reemplaza por el preflight local. La comparación ignora mayúsculas en
  nombres y métodos.
- **Rationale**: si la función se equivoca hacia "pasa", el preflight real llega a Chrome y
  falla como sin Nahual (la app ve el error y el detalle lo marca); si se equivoca hacia "no
  pasa", Nahual responde un preflight válido de todas formas. Ningún error rompe el aislamiento.
- **Alternatives considered**: reemplazar siempre el preflight en el alcance: descartado en la
  clarificación (el detalle no distinguiría si backend ya lo corrigió).

## R9. Orden con las reglas de 002 y ediciones del dev

- **Decision**: `RuleEngine.handle` decide primero la regla (002) y la relajación se aplica al
  final, sobre la respuesta que se entregará:
  - sin regla o regla `log`: `continueResponse` con headers relajados en lugar de
    `continueRequest` (camino rápido);
  - `pause` ⇒ al continuar (con o sin edición), se relajan los headers finales; los nombres
    `Access-Control-*` que el dev cambió respecto a los del servidor se respetan (FR-024);
  - `mock` ⇒ los headers del mock (con R21 de 002) se relajan respetando los
    `Access-Control-*` que el dev puso en el mock; los preflight siguen sin mockearse;
  - `fail` ⇒ no hay respuesta que relajar;
  - `delay` ⇒ se relaja al soltar el retraso, comprobando de nuevo que la relajación siga activa.
  La relajación consulta su estado en el momento de entregar (vencida ⇒ sin relajar, caso límite
  de la spec).
- **Rationale**: una sola vía de salida de la respuesta, con la relajación como último
  transformador puro (`applyRelaxation(headers, ctx)`), probado en integración.

## R10. Ciclo de vida de la relajación

- **Decision**: `CorsRelaxer` (SW) guarda las relajaciones en memoria por pestaña. Estados:
  `active`, `suspended` (con "pausar Nahual", FR-025) e `idle` (ningún frame de la pestaña tiene
  el origen de la app). Termina con causa `expired`, `user`, `detached` (incluye `target_closed`
  y `panel_closed`), `production` o `restart` (la ve el panel al reconectar: el SW nuevo no
  tiene relajaciones y el panel tenía alguna). Al terminar: se borra, se recalculan los patrones de
  `Fetch.enable` de la pestaña y se emite `relaxations` + `notice` con la causa (salvo `user`).
- **Sin persistencia**: ni `storage.local` ni `storage.session` (FR-017). Al arrancar no hay
  nada que limpiar: `cleanupOrphans` de 001 ya suelta toda sesión, y con ella toda
  interceptación (FR-018); la prueba de reinicio lo verifica.
- **Límite**: 10 orígenes de API por pestaña; un origen de API ya relajado ⇒ `error
  already_relaxed` (no se extiende, FR-015).

## R11. Patrones de `Fetch.enable` con relajaciones

- **Decision**: `computeFetchPatterns(rules, { site, globalPaused, relaxedApiOrigins })` añade
  `{ urlPattern: "<origen de API>/*", requestStage: "Response" }` por relajación activa (no
  suspendida), y `{ …, requestStage: "Request" }` solo si esa relajación tiene URLs con preflight
  que redirige (respaldo de X5, R1). Se combina con la reducción de R3 de 002: un `*` en Response los absorbe. Los
  orígenes validados no contienen `*`, `?` ni `\`, así que no hace falta escaparlos.
- **Respaldo de X5** (R1): en la etapa Request solo se actúa sobre los `OPTIONS` a URLs con
  preflight que redirige; el resto continúa de inmediato.
- **Rationale**: principio VI: sin relajación ni reglas, sigue solo la captura pasiva.

## R12. Orígenes de producción

- **Decision**: `Settings.productionOrigins: string[]` (≤ 100 entradas de ≤ 256 caracteres). Cada
  entrada es un origen exacto (`https://app.empresa.com`, `http://localhost:8080`) o un patrón
  `<esquema>://*.<dominio>[:puerto]`. Se normalizan (minúsculas, sin puerto por defecto, sin
  barra final) al guardar. El patrón coincide con subdominios de cualquier nivel con el mismo
  esquema y puerto, no con el dominio raíz (clarificación). `matchProductionOrigin(origin, list)`
  devuelve la entrada que coincide.
- **Falla cerrada**: si al leer ajustes la lista tiene alguna entrada inválida, se conservan
  las válidas en la UI, pero **no se permite relajar** hasta que el dev guarde la lista de nuevo
  (`notice` con la causa). Un dato corrupto nunca deja pasar una relajación sobre producción.
- **Al añadir** una entrada, el SW termina las relajaciones que coinciden (FR-030). Quitar una
  entrada se deshace con el toast de 002 (el panel reenvía la lista anterior, FR-031).

## R13. Reporte para backend y ejemplos por framework

- **Decision**: funciones puras en `packages/domain/src/cors/report.ts` y `snippets.ts`:
  - `buildCorsReport(exchanges, apiOrigin)` ⇒ datos: orígenes de app, métodos (sin simples si no
    hicieron falta), headers solicitados reales (no safelisted, sin los que pone el navegador:
    `Origin`, `Cookie`, `Referer`, `User-Agent`, `Sec-*`…), credenciales, causas con conteo,
    endpoints `MÉTODO /ruta` sin query string (≤ 50, deduplicados) y `Max-Age` sugerido de 600 s.
  - `renderCorsReport(report, { t, framework })` ⇒ texto; los textos vienen de `t` (i18n del
    panel), así que el dominio no lleva cadenas por idioma.
  - Ejemplos: Express (paquete `cors`), NestJS (`app.enableCors`), AWS API Gateway (HTTP API:
    `CorsConfiguration`; nota para REST API) y Google Cloud Run (nota de que se configura en la
    app o en el gateway, con el bloque de headers). Comentarios del código en inglés.
- **Sin valores sensibles** (FR-035): las entradas son nombres de headers ya validados como
  tokens, orígenes validados y rutas; ningún valor de header, cookie, body ni query entra en el
  modelo del reporte. Prueba con tokens sembrados en headers, query y body.
- **Se genera en el panel**: el historial vive en el panel (002-R11); no hace falta comando.

## R14. Copiar al portapapeles desde el panel de DevTools

- **Decision**: el reporte se muestra en un `<textarea readonly>`; "Copiar" intenta
  `navigator.clipboard.writeText` y, si falla (los frames de DevTools suelen bloquearlo), selecciona
  el `textarea` y usa `document.execCommand("copy")` dentro del gesto del usuario. Si ambos
  fallan, un aviso pide `Ctrl+C` con el texto ya seleccionado.
- **Rationale**: no requiere `clipboardWrite` (FR-040); se prueba en la E2E leyendo el
  portapapeles con permisos concedidos al contexto de Playwright.

## R15. Interfaz

- **Detalle**: nueva sección "CORS" en `ExchangeDetail` (causa, explicación, "qué pidió / qué
  respondió" como dos listas con las diferencias marcadas con texto, enlace al preflight, botón
  "Permitir CORS para desarrollo" que despliega la confirmación en línea con duración, alcance,
  `Expose-Headers` y aviso; "Permitir" la crea: 2 clics, SC-001).
- **Lista**: badge "Bloqueado por CORS" / "CORS relajado" con icono y texto en la columna de
  status; filtro de tipo "CORS: bloqueados / relajados" en `Filters`.
- **Indicador**: banda "CORS relajado" bajo `StatusBar`, visible en todas las vistas, con origen
  de la app, orígenes de API, cuenta regresiva (reutiliza `Countdown` de la cola), estado y
  botones "Apagar" y "Reporte"; `role="status"` sin anunciar cada segundo.
- **Atajo**: `Alt+Shift+R` apaga todas las relajaciones (no lo usa 002 ni DevTools).
- **Ajustes**: duración por defecto (15 min, 1 h, 4 h, 8 h) y editor de la lista de producción
  con validación por entrada.
- **Reporte**: `<dialog>` nativo con selector de framework, `textarea` y "Copiar".

## R16. Pruebas E2E y control del tiempo

- **Fixture**: `e2e/fixtures/servers.ts` suma un tercer origen y rutas `/cors/*` en la API:
  sin CORS, preflight 401, preflight con redirección, comodín con credenciales, origen distinto,
  método y header no permitidos, credenciales sin `Allow-Credentials`, y una ruta ya correcta.
  Registra lo que recibe (para comprobar si el `OPTIONS` llegó).
- **Tiempo**: el build de pruebas expone en `test-hooks.ts` un factor de escala para la duración de
  las relajaciones (`__nahualCorsTimeScale`), ausente en producción (`verify:dist` lo comprueba,
  como `__nahualFaults`). Así la expiración de "15 min" se prueba en segundos.
- **Aislamiento** (SC-002): segunda pestaña con la misma app y tercer origen desde la pestaña
  relajada; ambos deben seguir fallando con el mismo `corsError`.

## R17. Rendimiento

- **Decision**: medir con un experimento como R20 de 002
  (`e2e/experiments/e4-overhead-cors.spec.ts`): p95 del tiempo de requests relajados vs. sin
  Nahual, en la app de prueba. Meta: < 20 ms (SC-007). El camino relajado es una función pura
  sobre ≤ 500 headers más un `continueResponse`.

## Resultados por registrar

Experimentos corridos el 2026-10-23 en el Chromium de Playwright 1.64 (HeadlessChrome 156), con
`EXPERIMENTS=1 pnpm --filter @nahual/extension e2e` (T006–T009). Resultados en
`apps/extension/test-results/experiments/*.json`.

> **Hallazgo del laboratorio**: desde 002, el `FetchInterceptor` de Nahual responde todo
> `Fetch.requestPaused` de la extensión, también los de la sesión del laboratorio, y los
> experimentos de 001 (E2) daban "Invalid state for continueInterceptedRequest". El build de
> pruebas añade `__nahualLabTabs` (`test-hooks.ts`, ausente en producción, verificado en
> `tests/dist/manifest.test.ts`) para que el interceptor ignore las pestañas del laboratorio. Con
> eso, E2 reproduce los resultados de 001 (A, B y D funcionan; C falla con
> `PreflightInvalidStatus`).

- **X1 (credenciales)**: `Fetch.requestPaused` en etapa Response **sí** trae `Cookie` (y `Origin`)
  en `request.headers`; sin cookie, no la trae. `requestWillBeSentExtraInfo` llega antes que la
  etapa Response. ⇒ R5: la señal 1 se toma de los headers de Fetch.
- **X2 (preflight en Network)**: **sí** llega. `Network.requestWillBeSent` del `OPTIONS` con
  `initiator: { type: "preflight", requestId: <id del request real> }`, y su `responseReceived`
  con `type: "Preflight"` y el status (401, 204). ⇒ R6: relación exacta por
  `initiator.requestId`; no hace falta el intercambio sintético. Además, un preflight 401 **sin**
  headers CORS da `PreflightMissingAllowOriginHeader` (no `PreflightInvalidStatus`) ⇒ R3: si se
  observó el preflight con status no 2xx, la causa es `preflight_status`.
- **X3 (`Max-Age: 0`)**: _pendiente, se verifica en `cors-relax.spec.ts` (T057)_.
- **X4 (headers en Network)**: tras `continueResponse` con headers cambiados,
  `Network.responseReceived` reporta los headers **modificados** y `responseReceivedExtraInfo` los
  **originales** del servidor. La captura de 002 ya usa los de ExtraInfo; el detalle muestra
  además lo que guardó el SW (R7), sin cambios de diseño.
- **X5 (preflight en etapa Response)**: un preflight 401 se pausa en Response y
  `fulfillRequest` 204 funciona (el servidor vio `OPTIONS` y `PUT`; la página recibió 200). Un
  preflight **302** también se pausa en Response, pero ni `fulfillRequest` ni `continueResponse`
  lo corrigen (`ERR_INVALID_REDIRECT`, `PreflightDisallowedRedirect`). `fulfillRequest` en etapa
  **Request** sí lo resuelve (como D5). ⇒ R1: se usa el respaldo para redirecciones.
- Overhead de R17: _pendiente_.
