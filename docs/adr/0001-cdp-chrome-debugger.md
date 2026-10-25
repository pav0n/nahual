# ADR 0001: Interceptar con `chrome.debugger` y CDP

- **Estado:** Aceptada
- **Fecha de la decisión:** 2026-10-22 (premisa de la constitución, confirmada en el spike 001)
- **Registrada:** 2026-10-25, de forma retroactiva
- **Relacionado:** `.specify/memory/constitution.md`, `specs/001-spike-cdp/plan.md` (permisos y
  modelo de amenazas), `specs/001-spike-cdp/research.md` (D5, E1–E4),
  `specs/005-repeater-diff/research.md` (X1)

## Contexto

Nahual tiene que ver, pausar, modificar y reenviar el tráfico HTTP de una pestaña desde un panel
de DevTools. Las features previstas son: intercept condicional con edición de request y respuesta
(002), CORS de desarrollo (003), repeater y diff (005), hooks en TypeScript (006) y exportación
(007).

La constitución exige:

- **Local-first:** todo funciona en el navegador, sin backend ni red propia.
- **Mínimo privilegio:** cada permiso se justifica en el `plan.md` de su feature.
- **Fallar de forma segura:** un error nunca deja la página bloqueada.

Además, toda decisión se evalúa contra el riesgo de una extensión que ve credenciales.

Una extensión de Chrome MV3 tiene cuatro vías para actuar sobre el tráfico:

- `chrome.debugger` con el Chrome DevTools Protocol (CDP);
- `declarativeNetRequest`;
- `webRequest`;
- inyectar un script en la página que reemplace `fetch` y `XMLHttpRequest`.

Fuera de la extensión queda una quinta: un proxy local.

## Decisión

Nahual intercepta con `chrome.debugger`. Usa los dominios `Fetch` (pausar, editar, responder
localmente) y `Network` (observar, tiempos, headers reales) de CDP sobre la pestaña inspeccionada.

Se piden solo los permisos `debugger` y `storage`. El debugger se adjunta únicamente por acción
explícita en el panel y se suelta al cerrarlo, con su estado siempre visible. No hay content
scripts.

## Alternativas descartadas

| Alternativa | Por qué no | Origen |
|---|---|---|
| `declarativeNetRequest` | No permite pausar un request ni editar el body de una respuesta, que es el núcleo del producto | Tabla de permisos de 001 |
| `declarativeNetRequest` para el CORS de desarrollo | Sus reglas no se acotan a la pestaña y al origen exactos como exige la constitución. Tampoco puede responder un preflight: E2 mostró que, con un preflight rechazado, cambiar solo la respuesta no basta (`PreflightInvalidStatus`) | D5 y E2 de 001 |
| Desactivar la seguridad web del navegador | Inaceptable: quita CORS a todo el navegador y no solo a la app en desarrollo | D5 de 001 |
| Script inyectado que reemplaza `fetch`/XHR | Ver "Script inyectado" debajo | Añadida al registrar este ADR |
| `webRequest` con bloqueo | En MV3 ya no permite modificar de forma bloqueante salvo en extensiones instaladas por política de empresa, y nunca permitió editar bodies de respuesta | Añadida al registrar este ADR |
| Proxy local (estilo Burp o mitmproxy) | Exige instalar un programa fuera del navegador y un certificado raíz para ver HTTPS. Choca con local-first ("todo en el navegador") y amplía la superficie de ataque a todo el sistema | Añadida al registrar este ADR |

### Script inyectado

Era la alternativa más cercana, y queda descartada por cinco razones:

- **Cobertura parcial:** solo ve lo que el JavaScript de la página pide con `fetch` o XHR. No ve
  navegaciones, imágenes, scripts, CSS, envíos de formularios, `sendBeacon`, el tráfico de los
  service workers de la página ni el de los iframes de otro origen.
- **CORS invisible:** el bloqueo y el preflight ocurren dentro del navegador, por debajo del
  JavaScript. Desde la página no se pueden observar ni responder, y sin eso no existe la
  feature 003.
- **Manipulable por la página:** la página puede detectar o deshacer el reemplazo, o saltárselo
  guardando el `fetch` original antes o usando un iframe limpio. Además, el content script abre
  un canal entre la página y la extensión, que el modelo de amenazas de 001 evita a propósito
  ("sin content scripts; la página no tiene canal hacia la extensión"). En 005, el envío en
  contexto de página corre en un mundo aislado de CDP, y un `window.fetch` reemplazado por la
  página no le afecta (X1).
- **Más permisos:** inyectar en cualquier sitio exige `<all_urls>` o permisos de host
  permanentes. `chrome.debugger` no necesita permisos de host.
- **Datos incompletos:** solo ve lo que la página pidió, no lo que salió. Le faltan los headers
  que añade el navegador (cookies, `Sec-Fetch-*`), los tamaños transferidos y los tiempos reales.

## Consecuencias

**A favor**

- **Cobertura completa** de los requests de la pestaña, preflights incluidos (E1: los `OPTIONS`
  pasan por `Fetch.requestPaused` en las etapas Request y Response).
- **Edición completa:** pausar, editar, responder localmente (`Fetch.fulfillRequest`) y retrasar,
  en las dos etapas.
- **Fuera del alcance de la página:** la página no tiene ningún canal hacia la extensión.
- **Overhead pequeño:** interceptar sin pausar cuesta un p95 de unos 0,6 ms en el fixture local
  (E4), frente a un presupuesto de 20 ms.
- **Sin permisos de host para capturar e interceptar.** El contexto limpio de 005 añade un
  permiso de host opcional, pedido por origen exacto.

**En contra (aceptado)**

- **Barra de aviso:** mientras el debugger está adjunto, Chrome muestra "Nahual está depurando
  este navegador", y el usuario puede cancelarla. Nahual lo detecta (`canceled_by_user`) y lo
  muestra en el panel.
- **Permiso sensible:** `debugger` despierta desconfianza en la Chrome Web Store y en los
  usuarios. Se mitiga adjuntando solo con el panel abierto, por acción explícita, con estado
  visible y un botón para soltar.
- **Sin modo en segundo plano:** el debugger no puede quedarse adjunto con el panel cerrado. Lo
  prohíbe la constitución.
- **Convivencia con otros clientes:** E3 mostró que Chrome admite varios clientes de
  `chrome.debugger` en la misma pestaña. La interferencia posible viene de dos clientes con
  `Fetch` activo sobre los mismos requests, como Local Overrides o el bloqueo de requests de
  DevTools. El orden de actuación en ese caso sigue pendiente de registrar (deuda de 001: E3(b)
  y la definición de "en conflicto").
- **Dependencia de CDP:** el protocolo puede cambiar entre versiones de Chrome. La lógica de CDP
  vive detrás de `DebuggerPort` (principio V), y la E2E corre sobre Chromium real.

## Revisar esta decisión si

- `declarativeNetRequest` u otra API de extensiones llega a permitir pausar y editar bodies de
  respuesta, acotados por pestaña.
- Chrome restringe `chrome.debugger` en extensiones publicadas, o la Chrome Web Store lo rechaza
  para este uso.
