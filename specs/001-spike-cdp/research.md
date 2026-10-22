# Research: Spike CDP y base del proyecto

**Feature**: `001-spike-cdp` | **Fecha**: 2026-10-22

Este documento tiene dos partes:

1. **Decisiones de diseño y herramientas**: tomadas en `/speckit-plan` con los criterios
   indicados. Las cuatro decisiones de herramientas son entregables de la spec (FR-019).
2. **Experimentos**: método e hipótesis definidos ahora; **resultados pendientes**, se completan
   durante la implementación con los datos medidos (SC-001, SC-004, SC-005).

Criterios comunes para elegir dependencias: licencia compatible con Apache-2.0 (FR-018a), sin
`eval` ni generación de código en tiempo de ejecución, mantenida activamente, tamaño
razonable para una extensión, sin dependencias transitivas innecesarias.

---

## Parte 1 — Decisiones

### D1. Plugin de build para MV3

- **Decision**: `@crxjs/vite-plugin` sobre Vite.
- **Rationale**: manifest declarado como código TypeScript (`defineManifest`), detecta las
  entradas (service worker, `devtools_page`, panel) y genera un bundle por contexto; copia
  `_locales`; build de producción sin código de carga remota. Encaja con Vite + Vitest.
- **Alternatives considered**:
  - *WXT*: framework completo con convenciones propias, auto-imports y runtime adicional; más
    superficie de la necesaria.
  - *vite-plugin-web-extension*: válido, pero menos integración con el manifest tipado.
  - *Vite con múltiples `rollupOptions.input` a mano*: sin dependencia extra, pero hay que
    resolver a mano el formato del SW (ES module), el manifest y los locales.
- **Verificado** (`@crxjs/vite-plugin` 3.0.0, Vite 8.3.4): el build de producción cumple el
  contrato del manifest y es reproducible (dos builds ⇒ mismo SHA-256 del zip). El **modo dev
  (`vite`) no sirve** para Nahual:
  - escribe en el mismo `dist/` que producción;
  - añade `web_accessible_resources: ["**/*", "*"]` para `<all_urls>`, que expone todos los
    archivos de la extensión a cualquier página;
  - no genera `src/panel/panel.html` (ignora las entradas extra de Rollup), así que el panel no
    existe.
- **Flujo de desarrollo elegido**: `pnpm --filter @nahual/extension dev` (`vite build --watch`)
  y recargar la extensión. `pnpm verify:dist` falla si un `dist/` quedó contaminado por el modo
  dev (detecta `web_accessible_resources`). La E2E usa siempre `build:test`.

### D2. Transpilador de hooks (para 005)

- **Decision**: **Sucrase** (firme; su uso real se valida en 005).
- **Rationale**: los hooks solo necesitan quitar tipos de TypeScript (el chequeo de tipos lo
  hace el editor). Sucrase es JavaScript puro, sin WebAssembly, pequeño y muy rápido para
  transformaciones de un solo archivo. Corre dentro de la página `sandbox.pages` sin cambiar la
  CSP de las páginas de la extensión. Licencia MIT.
- **Alternatives considered**:
  - *esbuild-wasm*: más completo (bundling, targets), pero el binario WASM pesa ~10 MB y
    requiere `wasm-unsafe-eval`; sobra para transformar un archivo.
  - *TypeScript `transpileModule`*: ya lo trae el editor, pero el compilador completo es muy
    pesado para cargarlo en el sandbox solo para quitar tipos.
- **Evaluación de 001** (directorio temporal, fuera del workspace; empaquetado con esbuild,
  minificado, Chromium con CSP `script-src 'self'`):

  | Candidata | Versión | Licencia | Tamaño min / gzip | `eval`/`Function` | Bajo CSP estricta |
  |---|---|---|---|---|---|
  | Sucrase | 3.35.1 | MIT | 206 KB / 48 KB | 1 aparición dentro de un texto, no se ejecuta | Transforma bien, sin violaciones |
  | esbuild-wasm | 0.28.2 | MIT | 14,0 MB / 3,8 MB solo el `.wasm` | n/a | Requiere `wasm-unsafe-eval` |

  Sucrase correrá en la página `sandbox.pages`, donde la CSP es distinta; aun así funciona
  también con la CSP de las páginas de la extensión.
- **Pendiente para 005**: medir tiempo de transformación de un hook típico (< 50 ms esperado) y
  cobertura de sintaxis (enums, decoradores no se admiten en hooks).

### D3. Librería de JSONPath (para 002/004)

- **Decision**: **`json-p3`** (firme): implementación de RFC 9535 sin evaluación dinámica.
  `jsonpath-plus` queda descartada (ver evaluación).
- **Rationale**: la constitución prohíbe `eval` fuera del sandbox y JSONPath se evaluará en el
  service worker. Las librerías clásicas evaluaban filtros con `eval`/`static-eval` (p. ej. la
  vulnerabilidad de ejecución remota de `jsonpath-plus` < 10, CVE-2024-21534). Una
  implementación del estándar con su propio intérprete de filtros evita esa clase de fallo y
  fija una semántica predecible.
- **Alternatives considered**: `jsonpath` (dependencia de `static-eval`, sin mantenimiento),
  `jsonpath-plus` en modo por defecto (evalúa expresiones).
- **Evaluación de 001**:

  | Candidata | Versión | Licencia | Tamaño min / gzip | `eval`/`Function` | Bajo CSP estricta |
  |---|---|---|---|---|---|
  | json-p3 | 3.0.0 | MIT (dep. `iregexp-check`) | 61 KB / 16 KB | 0 | Filtro `?@.age > 30` correcto, sin violaciones |
  | jsonpath-plus | 11.2.0 | MIT (deps. `jsep`) | 28 KB / 9 KB | 1 `new Function` en el bundle (modo `native`) | `eval: "safe"` funciona; `eval: false` rechaza filtros |

  `jsonpath-plus` llevaría `new Function` al service worker aunque no se use: rompe la prueba
  `verify:dist` de "sin código evaluado" y el principio I.
- **Pendiente para 002**: semántica de los casos que use la UI de reglas.

### D4. Librería de diff JSON (para 004)

- **Decision**: **microdiff** (firme para 004; ver la reevaluación pendiente).
- **Rationale**: sin dependencias, muy pequeña, devuelve una lista de cambios con ruta
  (`CREATE`/`REMOVE`/`CHANGE`) fácil de renderizar como texto y de pasar por la redacción de
  headers y valores sensibles antes de mostrarla. Licencia MIT.
- **Alternatives considered**:
  - *jsondiffpatch*: detecta movimientos en arrays y tiene formateadores, pero su formateador
    visual genera HTML (no se podría usar) y es bastante más grande.
  - *deep-diff*: sin mantenimiento.
- **Evaluación de 001**:

  | Candidata | Versión | Licencia | Tamaño min / gzip | `eval`/`Function` | Bajo CSP estricta |
  |---|---|---|---|---|---|
  | microdiff | 1.6.0 | MIT, sin dependencias | 0,9 KB / 0,5 KB | 0 | Lista de cambios con ruta, sin violaciones |
  | jsondiffpatch | 0.7.6 | MIT (dep. `diff-match-patch`) | 17 KB / 5 KB | 0 | Delta correcto, sin violaciones |
- **Pendiente para 004**: evaluar si hace falta diff de arrays por identidad (p. ej. por `id`);
  si sí, se reevalúa jsondiffpatch usando solo su formato delta.

### D5. Estrategia CORS (para 003)

- **Decision** (con los datos de E1 y E2): en la feature 003, el modo CORS de desarrollo:
  1. responde **localmente** los preflight OPTIONS con `Fetch.fulfillRequest` (204 + headers
     `Access-Control-*` con el origen exacto de la app, nunca `*`), sin que lleguen al servidor;
  2. en la etapa Response del request real, reemplaza los `Access-Control-*` por
     `Access-Control-Allow-Origin: <origen exacto>` y, solo si el request lleva credenciales,
     `Access-Control-Allow-Credentials: true`, enviando siempre `responseCode` junto con los
     headers (D6b).
- **Rationale**: E1 muestra que los preflight sí pasan por `Fetch.requestPaused`, en las dos
  etapas. E2 muestra que modificar la etapa Response basta para requests sin preflight (casos A
  y B), pero **no** cuando el preflight devuelve un status no 2xx (caso C,
  `PreflightInvalidStatus`): Chrome lo evalúa antes de enviar el request real. Responder el
  preflight localmente lo resuelve (caso D) y el servidor nunca ve el OPTIONS.
- **Consecuencia para el threat model de 003**: como el preflight no llega al servidor, el
  reporte para backend debe indicar qué headers faltan; la relajación existe solo en el navegador
  del dev ("CORS oculta un bug real").
- **Alternatives considered**: `declarativeNetRequest` para reescribir headers de respuesta
  (no permite acotar a la pestaña y al origen con la precisión que exige la constitución);
  desactivar la seguridad web del navegador (inaceptable); modificar solo la etapa Response
  (insuficiente con preflight rechazado, caso C).

### D6. Arquitectura de la sesión del debugger

- **Decision** (actualizada con datos del spike): una sesión por pestaña, propiedad exclusiva del
  puerto del panel de esa pestaña; registro en `chrome.storage.session`; al arrancar, se intenta
  `chrome.debugger.detach()` en **toda** pestaña que `getTargets()` marque como adjunta y en las
  del registro, ignorando los errores.
- **Rationale**: cumple "debugger adjunto solo con el panel abierto" (el cierre del puerto dueño
  es la señal). La decisión inicial (filtrar `getTargets()` por `extensionId`) **no funciona**:
  - `TargetInfo.extensionId` identifica al target cuando el target es una extensión, no al
    cliente adjunto; para una pestaña adjuntada por Nahual llega vacío.
  - `attached: true` lo marca cualquier cliente (también Playwright o DevTools).
  - `detach()` solo suelta la sesión de quien lo llama: sobre una sesión ajena falla con
    "Debugger is not attached" sin efectos. Por eso intentar el detach en todas es seguro.
  - Para saber si una sesión es propia sin soltarla sirve un comando inocuo:
    `Target.getTargetInfo` responde solo si Nahual está adjunto (`Browser.getVersion` y
    `Schema.getDomains` no están disponibles para extensiones).
- **Medido** (Chromium de Playwright 1.64, headless): tras detener el service worker con un
  request pausado (`ServiceWorker.stopWorker`), la página recibe su respuesta sin cambios en
  < 5 s, el panel reconecta su puerto y muestra "desconectado", y no queda sesión propia ni
  registro (`e2e/sw-restart.spec.ts`, variante 2). Con `chrome.runtime.reload()` el request
  pausado también se libera en < 5 s; en el entorno de pruebas (`--load-extension`) la extensión
  no vuelve a cargarse tras la recarga, así que esa variante solo verifica la liberación.
- **Alternatives considered**: mantener el debugger adjunto en segundo plano (viola la
  constitución); reconexión automática tras un detach externo (la spec exige reconexión
  explícita); filtrar por `extensionId` (descartado: no identifica al cliente).

### D6b. `Fetch.continueResponse` exige status y headers juntos

- **Medido**: `Fetch.continueResponse` con `responseHeaders` y sin `responseCode` falla con
  "Cannot override only status or headers, both should be provided". Nahual envía
  `responseCode` (el status original) junto con los headers editados.
- Antes de corregirlo, el reintento único sin cambios (principio II) dejó pasar la respuesta
  intacta y el panel informó "Falló: continuó sin cambios": el fallo seguro funcionó.

### D7. Pruebas E2E con la extensión

- **Decision**: Playwright con `chromium.launchPersistentContext` y
  `--load-extension`/`--disable-extensions-except` sobre el build de producción, con el canal
  Chromium que admite extensiones en headless. Dos servidores locales en orígenes distintos
  (app y API) como fixture.
- **Rationale**: es el patrón documentado de Playwright para extensiones. Los paneles de DevTools
  no son automatizables directamente; la E2E abre `panel.html` en una pestaña con el parámetro
  `?__nahualTestTabId=` (solo en el build `build:test`, salida `dist-test`) para ejercer el
  mismo código del panel, y cubre la integración real con DevTools en la prueba manual del
  quickstart. El conflicto de debugger se provoca con una extensión auxiliar
  (`e2e/fixtures/conflict-extension/`) cargada junto a Nahual, porque la conexión CDP de
  Playwright no cuenta como cliente de `chrome.debugger`.
- **Alternatives considered**: Puppeteer (no aporta sobre Playwright y duplicaría herramientas).

### D8. Reinicio del SW en pruebas

- **Decision**: forzar el reinicio con `chrome.runtime.reload()` desde la página de pruebas o
  terminando el worker vía `chrome://serviceworker-internals` / CDP del navegador
  (`Target` del service worker) en Playwright.
- **Rationale**: reproduce los dos caminos reales (recarga y caída). Se documenta cuál de los
  dos reproduce mejor las sesiones huérfanas.

### D9. Build reproducible

- **Decision**: `pnpm install --frozen-lockfile`, `SOURCE_DATE_EPOCH` fijo, zip con orden y
  fechas deterministas; CI construye dos veces y compara el SHA-256 del zip.
- **Rationale**: principio VII. El SBOM y la publicación quedan para 006.

---

## Parte 2 — Experimentos

Todos se ejecutan sobre el banco de pruebas definido en la spec: app propia del equipo (SPA con
tráfico autenticado + API en otro origen), en local o staging. Registrar aquí **nombre y versión
de la app, versión de Chrome y sistema operativo** antes de cada resultado.

**Entorno de esta corrida**: fixture local de dos orígenes (`e2e/fixtures/servers.ts`: SPA en
`127.0.0.1:<puerto A>`, API en `127.0.0.1:<puerto B>`), Chromium de Playwright 1.64.0
(HeadlessChrome/156.0.0.0) en modo headless, Debian 13 (Linux 6.12), Node 24.18.

**App del equipo** (T055): el equipo corrió E3 (casos manuales), la repetición de E4 y la demo
del quickstart sobre su app con Chrome estable el 2026-10-22, y reportó que pasaron.
**Por registrar**: nombre, versión y orígenes de la app, versión de Chrome y SO. E5 sigue
pendiente.

Resultados crudos: `apps/extension/test-results/experiments/*.json`, generados con
`EXPERIMENTS=1 pnpm --filter @nahual/extension e2e`.

### E1. ¿Los preflight CORS (OPTIONS) son interceptables con Fetch?

- **Método**: Fetch.enable con patrón `*` en etapa Request y en etapa Response; desde la app,
  provocar un request con preflight (método `PUT` o header personalizado). Registrar si llega
  `Fetch.requestPaused` con `request.method === "OPTIONS"` y `resourceType`; repetir con
  `Network.enable` para ver el evento `Preflight`.
- **Hipótesis**: los preflight se ven en Network pero pueden no pasar por Fetch según la versión
  de Chrome.
- **Resultado** (`e1-preflight.spec.ts`, `PUT` con header `x-custom`):

  | Observación | Valor |
  |---|---|
  | `Fetch.requestPaused` con `OPTIONS` | **Sí**, en etapa Request y en etapa Response (status 204) |
  | `resourceType` del preflight | `XHR` (igual que el request real; no hay un tipo `Preflight` en Fetch) |
  | Evento `Network.requestWillBeSent` con `type: "Preflight"` | No se observó con `Network.enable` desde la extensión |
  | Lo que vio el servidor | `OPTIONS`, `PUT` |
  | Resultado del `fetch` | 200 |

- **Conclusión**: los preflight son interceptables con Fetch en ambas etapas; se identifican por
  `request.method === "OPTIONS"`. Hace posible responderlos localmente (D5).

### E2. ¿Basta modificar `Access-Control-*` en la etapa Response?

- **Método**: API configurada sin CORS. Caso A: request simple (sin preflight) ⇒ añadir
  `Access-Control-Allow-Origin: <origen exacto>` en Response. Caso B: con credenciales ⇒ añadir
  también `Access-Control-Allow-Credentials: true`. Caso C: con preflight rechazado (404/401).
  Si E1 es positivo, caso D: responder el preflight con `fulfillRequest`.
- **Hipótesis**: A y B funcionan; C falla siempre en Response; D funciona.
- **Resultado** (`e2-cors-headers.spec.ts`, API `/no-cors` sin headers CORS):

  | Caso | Qué hace Nahual | Resultado en la página | Error CORS de Chrome |
  |---|---|---|---|
  | A0 (control) | Nada | Falla (`TypeError: Failed to fetch`) | `MissingAllowOriginHeader` |
  | A | GET simple: ACAO exacto en Response | **OK** 200 | — |
  | B | GET con credenciales: ACAO exacto + Allow-Credentials | **OK** 200 | — |
  | B2 | Con credenciales, sin Allow-Credentials | Falla | `InvalidAllowCredentials` |
  | C | PUT con preflight 404: solo se modifica Response | Falla; el servidor solo vio `OPTIONS` | `PreflightInvalidStatus` |
  | D | PUT con preflight 404: preflight respondido con `fulfillRequest` | **OK** 200; el servidor solo vio `PUT` | — |

  En los casos que fallan, la consola de la página muestra "Access to fetch … has been blocked
  by CORS policy" y `net::ERR_FAILED`.
- **Conclusión**: basta modificar la etapa Response para requests sin preflight; con preflight
  rechazado hay que responder el preflight localmente. Actualiza D5.

### E3. Comportamiento con DevTools nativas

- **Método**: con el panel de Nahual adjunto, probar: (a) cambiar entre paneles de DevTools;
  (b) activar Local Overrides y Network request blocking (también usan interceptación);
  (c) abrir DevTools desacopladas; (d) segunda extensión que use `chrome.debugger` en la misma
  pestaña; (e) cancelar desde la barra de aviso de Chrome. Registrar `onDetach.reason`, errores
  de `attach` y si las pausas siguen funcionando.
- **Hipótesis**: (a)(c) conviven; (b) puede interceptar antes o después que Nahual; (d) produce
  un error de attach ⇒ estado `conflict`; (e) ⇒ `canceled_by_user`.
- **Resultado automatizado** (`detach-detection.spec.ts`):
  - **(d) refutada**: Chrome admite **varios clientes de `chrome.debugger` por pestaña**. Con
    otra extensión ya adjunta, Nahual se adjunta, pausa y continúa con normalidad; si la otra se
    adjunta después, ambas quedan adjuntas y Nahual no recibe `onDetach`.
  - Cerrar la pestaña objetivo ⇒ `onDetach` con `target_closed` y el panel muestra
    "desconectado" en < 1 s.
- **Resultado manual** (a), (b), (c), (e), con DevTools reales sobre la app del equipo: el equipo
  reportó el 2026-10-22 que se comportaron según lo esperado. **Por registrar**: el detalle de
  (b), es decir, el orden de actuación entre Local Overrides / bloqueo de requests y Nahual, y
  qué recibe la página.
- **Conclusión provisional**: el estado "en conflicto" no lo provoca otro cliente adjunto; queda
  para errores de attach `already_attached`. La interferencia real a investigar es (b): dos
  clientes con Fetch habilitado sobre los mismos requests. **Decisión pendiente para el equipo**:
  ajustar el escenario 6 de la spec y la definición de "en conflicto" a este comportamiento.

### E4. Overhead de interceptar sin pausar

- **Método**: página de carga en la app de pruebas que ejecuta 500 `fetch` secuenciales a la
  API. Tres corridas: sin debugger; con debugger adjunto y sin Fetch; con Fetch.enable que
  continúa inmediatamente (`continueRequest` sin cambios). Medir con Resource Timing en la página
  (`responseEnd - startTime`) y, en el SW, el tiempo entre `requestPaused` y la respuesta de
  `continueRequest`. Reportar p50 y p95 del overhead (corrida 3 − corrida 1), descartando
  10 requests de calentamiento.
- **Presupuesto**: p95 < 20 ms (SC-004).
- **Resultado en el fixture local** (`e4-overhead.spec.ts`, 500 requests por corrida tras 10
  de calentamiento, Resource Timing `responseEnd - startTime`):

  | Corrida | p50 (ms) | p95 (ms) |
  |---|---|---|
  | 1. Sin debugger | 0,9 | 1,2 |
  | 2. Debugger adjunto, sin Fetch | 0,8 | 1,1 |
  | 3. Fetch que continúa al instante | 1,5 | 1,8 |
  | **Overhead (3 − 1)** | **0,6** | **0,6** |
  | En el SW: `requestPaused` ⇒ respuesta de `continueRequest` | 0,3 | 0,4 |

- **Sobre la app del equipo** (FR-020): el equipo reportó el 2026-10-22 que la medición pasó el
  presupuesto (p95 < 20 ms). **Por registrar**: la tabla con p50 y p95 de las tres corridas.
- **Conclusión**: el overhead de interceptar sin pausar está dentro del presupuesto de 20 ms en
  p95 (~0,6 ms en el fixture local).
- **Nota para repetirlo**: `E4_TARGET_URL=<url de la API> EXPERIMENTS=1 pnpm --filter
  @nahual/extension e2e` mide contra esa API, pero la página de carga vive en el origen del
  fixture: la API debe aceptar CORS desde ahí, o se adapta la prueba para abrir una página de la
  propia app.

### E5. Prueba de salida: 1 hora de uso

- **Método**: 1 hora de uso continuo de la app de pruebas con ciclos repetidos de adjuntar,
  pausar, continuar, modificar header, soltar, cerrar DevTools y reiniciar el SW. Al final,
  `chrome.debugger.getTargets()` y el registro de `storage.session`.
- **Criterio**: 0 sesiones huérfanas y 0 requests sin resolver (SC-001).
- **Resultado**: _pendiente_
