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
- **Riesgo a verificar en implementación**: el modo dev (HMR) de crxjs con la CSP
  `script-src 'self'`. Si no funciona, el flujo de desarrollo usa `vite build --watch` y la E2E
  usa siempre el build de producción. Se documenta el resultado aquí.

### D2. Transpilador de hooks (para 005)

- **Decision**: **Sucrase** (provisional; se confirma en 005).
- **Rationale**: los hooks solo necesitan quitar tipos de TypeScript (el chequeo de tipos lo
  hace el editor). Sucrase es JavaScript puro, sin WebAssembly, pequeño y muy rápido para
  transformaciones de un solo archivo. Corre dentro de la página `sandbox.pages` sin cambiar la
  CSP de las páginas de la extensión. Licencia MIT.
- **Alternatives considered**:
  - *esbuild-wasm*: más completo (bundling, targets), pero el binario WASM pesa ~10 MB y
    requiere `wasm-unsafe-eval`; sobra para transformar un archivo.
  - *TypeScript `transpileModule`*: ya lo trae el editor, pero el compilador completo es muy
    pesado para cargarlo en el sandbox solo para quitar tipos.
- **Licencias**: Sucrase MIT; esbuild-wasm MIT (a confirmar en T de evaluación de candidatas).
- **Pendiente para 005**: medir tiempo de transformación de un hook típico (< 50 ms esperado) y
  cobertura de sintaxis (enums, decoradores no se admiten en hooks).

### D3. Librería de JSONPath (para 002/004)

- **Decision**: una implementación de **RFC 9535** sin evaluación dinámica; candidata
  principal `json-p3`, alternativa `jsonpath-plus` con `eval: false`.
- **Rationale**: la constitución prohíbe `eval` fuera del sandbox y JSONPath se evaluará en el
  service worker. Las librerías clásicas evaluaban filtros con `eval`/`static-eval` (p. ej. la
  vulnerabilidad de ejecución remota de `jsonpath-plus` < 10, CVE-2024-21534). Una
  implementación del estándar con su propio intérprete de filtros evita esa clase de fallo y
  fija una semántica predecible.
- **Alternatives considered**: `jsonpath` (dependencia de `static-eval`, sin mantenimiento),
  `jsonpath-plus` en modo por defecto (evalúa expresiones).
- **Licencias**: `json-p3` y `jsonpath-plus`: _pendiente_ de confirmar en la evaluación de
  candidatas de 001 (FR-018a).
- **Pendiente para 002**: versión de `json-p3`, tamaño del bundle, y que
  ninguna ruta de código use `Function`/`eval` (prueba con CSP estricta).

### D4. Librería de diff JSON (para 004)

- **Decision**: **microdiff** (provisional; se confirma en 004).
- **Rationale**: sin dependencias, muy pequeña, devuelve una lista de cambios con ruta
  (`CREATE`/`REMOVE`/`CHANGE`) fácil de renderizar como texto y de pasar por la redacción de
  headers y valores sensibles antes de mostrarla. Licencia MIT.
- **Alternatives considered**:
  - *jsondiffpatch*: detecta movimientos en arrays y tiene formateadores, pero su formateador
    visual genera HTML (no se podría usar) y es bastante más grande.
  - *deep-diff*: sin mantenimiento.
- **Licencias**: microdiff MIT; jsondiffpatch MIT (a confirmar en la evaluación de candidatas).
- **Pendiente para 004**: evaluar si hace falta diff de arrays por identidad (p. ej. por `id`);
  si sí, se reevalúa jsondiffpatch usando solo su formato delta.

### D5. Estrategia CORS (para 003)

- **Decision**: **provisional**, depende de E1 y E2:
  - Si los preflight OPTIONS llegan a `Fetch.requestPaused`: responderlos localmente con
    `Fetch.fulfillRequest` (204 + headers `Access-Control-*` con origen exacto) y ajustar
    `Access-Control-Allow-Origin`/`-Credentials` en la etapa Response del request real.
  - Si no llegan: solo se puede corregir el request real cuando no hay preflight; para los que
    lo tienen, el modo CORS de 003 se limita a diagnosticar y generar el reporte para backend.
- **Rationale**: modificar headers en Response no arregla un preflight rechazado (status no 2xx)
  porque Chrome lo evalúa antes de enviar el request real.
- **Alternatives considered**: `declarativeNetRequest` para reescribir headers de respuesta
  (no permite acotar a la pestaña y al origen con la precisión que exige la constitución);
  desactivar la seguridad web del navegador (inaceptable).

### D6. Arquitectura de la sesión del debugger

- **Decision**: una sesión por pestaña, propiedad exclusiva del puerto del panel de esa pestaña;
  registro en `chrome.storage.session`; limpieza al arrancar con `chrome.debugger.getTargets()`
  filtrando por `extensionId`.
- **Rationale**: cumple "debugger adjunto solo con el panel abierto" (el cierre del puerto es la
  señal), y `getTargets()` permite detectar sesiones propias aunque el registro se haya perdido.
  Desde Chrome 118 una sesión de debugger activa mantiene vivo al SW, por lo que el "reinicio"
  relevante es una recarga, actualización o caída de la extensión.
- **Alternatives considered**: mantener el debugger adjunto en segundo plano (viola la
  constitución); reconexión automática tras un detach externo (la spec exige reconexión
  explícita).

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

**Entorno**: _pendiente_ (app: …, versión: …, Chrome: …, SO: …)

### E1. ¿Los preflight CORS (OPTIONS) son interceptables con Fetch?

- **Método**: Fetch.enable con patrón `*` en etapa Request y en etapa Response; desde la app,
  provocar un request con preflight (método `PUT` o header personalizado). Registrar si llega
  `Fetch.requestPaused` con `request.method === "OPTIONS"` y `resourceType`; repetir con
  `Network.enable` para ver el evento `Preflight`.
- **Hipótesis**: los preflight se ven en Network pero pueden no pasar por Fetch según la versión
  de Chrome.
- **Resultado**: _pendiente_
- **Conclusión**: _pendiente_

### E2. ¿Basta modificar `Access-Control-*` en la etapa Response?

- **Método**: API configurada sin CORS. Caso A: request simple (sin preflight) ⇒ añadir
  `Access-Control-Allow-Origin: <origen exacto>` en Response. Caso B: con credenciales ⇒ añadir
  también `Access-Control-Allow-Credentials: true`. Caso C: con preflight rechazado (404/401).
  Si E1 es positivo, caso D: responder el preflight con `fulfillRequest`.
- **Hipótesis**: A y B funcionan; C falla siempre en Response; D funciona.
- **Resultado**: _pendiente_ (tabla caso × resultado × mensaje de consola)
- **Conclusión**: _pendiente_ (actualiza D5)

### E3. Comportamiento con DevTools nativas

- **Método**: con el panel de Nahual adjunto, probar: (a) cambiar entre paneles de DevTools;
  (b) activar Local Overrides y Network request blocking (también usan interceptación);
  (c) abrir DevTools desacopladas; (d) segunda extensión que use `chrome.debugger` en la misma
  pestaña; (e) cancelar desde la barra de aviso de Chrome. Registrar `onDetach.reason`, errores
  de `attach` y si las pausas siguen funcionando.
- **Hipótesis**: (a)(c) conviven; (b) puede interceptar antes o después que Nahual; (d) produce
  un error de attach ⇒ estado `conflict`; (e) ⇒ `canceled_by_user`.
- **Resultado**: _pendiente_
- **Conclusión**: _pendiente_ (mapa causa ⇒ estado del panel)

### E4. Overhead de interceptar sin pausar

- **Método**: página de carga en la app de pruebas que ejecuta 500 `fetch` secuenciales a la
  API. Tres corridas: sin debugger; con debugger adjunto y sin Fetch; con Fetch.enable que
  continúa inmediatamente (`continueRequest` sin cambios). Medir con Resource Timing en la página
  (`responseEnd - startTime`) y, en el SW, el tiempo entre `requestPaused` y la respuesta de
  `continueRequest`. Reportar p50 y p95 del overhead (corrida 3 − corrida 1), descartando
  10 requests de calentamiento.
- **Presupuesto**: p95 < 20 ms (SC-004).
- **Resultado**: _pendiente_ (tabla corrida × p50 × p95)
- **Conclusión**: _pendiente_

### E5. Prueba de salida: 1 hora de uso

- **Método**: 1 hora de uso continuo de la app de pruebas con ciclos repetidos de adjuntar,
  pausar, continuar, modificar header, soltar, cerrar DevTools y reiniciar el SW. Al final,
  `chrome.debugger.getTargets()` y el registro de `storage.session`.
- **Criterio**: 0 sesiones huérfanas y 0 requests sin resolver (SC-001).
- **Resultado**: _pendiente_
