# Nahual — 06 · Hooks en TypeScript

> Feature `006-hooks-typescript`. Depende de: `002-captura-intercept` (motor de reglas y acciones) y `004-rediseno-panel` (editor de reglas ancho y cajón de consola).
> Objetivo: que el dev transforme tráfico con lógica propia, escrita en TypeScript con autocompletado, sin poner en riesgo el navegador.

## Contexto para el agente

Nahual es una extensión de Chrome MV3 (`chrome.debugger` + CDP) para devs frontend. Las reglas ya soportan Pausar, Mock, Fallar, Retrasar y Registrar; esta feature agrega la acción **Modificar con hook**. Restricción MV3: no hay `eval` en el service worker ni en las páginas de la extensión. El código del usuario solo puede correr en una página declarada en `sandbox.pages` del manifest, comunicada por `postMessage`.

Es la feature con más superficie de ataque: el código del hook puede venir de terceros.

Decisiones previas que aplican:
- **Transpilador: Sucrase**, ya elegido en `specs/001-spike-cdp/research.md` (D2): JavaScript puro, ~48 KB gzip, sin WebAssembly. esbuild-wasm quedó descartado (~3,8 MB solo el `.wasm` y exige `wasm-unsafe-eval`). Falta medir lo que D2 dejó para esta feature: tiempo de transformación de un hook típico (< 50 ms esperado) y cobertura de sintaxis.
- **Editor de código: por evaluar** entre Monaco y CodeMirror 6. El tamaño importa: el JS total del panel ronda 0,8 MB tras 005 y Monaco pesa varios MB. Los errores de tipo antes de guardar necesitan el servicio de lenguaje de TypeScript con cualquiera de los dos editores, así que su peso entra en la comparación.

---

## `/speckit.specify`

```text
Especifica los hooks en TypeScript de Nahual.

P1 — Escribir un hook
Como dev, quiero escribir un hook (ctx) => ctx en TypeScript con autocompletado, para transformar tráfico con lógica.
Aceptación:
- Una regla con acción "Modificar con hook" tiene un script con firma: export default (ctx: HookContext) => HookContext | void | Promise<HookContext | void>.
- HookContext expone: request (url, method, headers, body parseado y crudo), response en etapa Response (status, headers, body), state (almacén compartido entre hooks durante la sesión), log() y helpers (json(), setHeader(), graphql.operationName).
- El editor muestra autocompletado y errores de tipo antes de guardar; no se puede activar un hook con errores de compilación.
- Plantillas de inicio: "agregar header", "cambiar un campo del JSON", "simular lista vacía".

P1 — Fallar de forma segura
Aceptación:
- Un hook que lanza una excepción, devuelve un valor inválido o tarda más de 2 s no altera el tráfico; el request continúa sin cambios.
- El error aparece en el panel con mensaje, línea y el request afectado.
- Los log() del hook se ven en una consola del panel, asociados al request.

P2 — Compartir hooks
Aceptación:
- Los hooks se exportan e importan como archivos .ts para versionarlos en el repo del proyecto.
- Al importar, el usuario ve el código completo antes de activarlo, y el hook queda desactivado por defecto.
- El archivo importado se rechaza si excede 100 KB.

Casos límite: hook que intenta usar fetch, XHR, WebSocket, importScripts, chrome.*, document o window.parent (todo debe fallar); bucle infinito (lo corta el timeout); hook que modifica un body binario; dos hooks que coinciden en el mismo request (orden por prioridad de regla).

Criterios de éxito:
- Las pruebas de escape del sandbox fallan en el 100% de los vectores listados.
- Overhead de un hook trivial < 10 ms p95.
- Abrir el panel no se vuelve más lento por los hooks: el editor se carga solo al abrir un hook.
```

## `/speckit.clarify` — preguntas sugeridas

1. ¿Los hooks pueden importar utilidades entre sí, o cada uno es un archivo aislado?
2. ¿El `state` compartido se limpia al recargar la página o al cerrar el panel?
3. ¿Se publica `HookContext.d.ts` como paquete npm para escribir hooks fuera del navegador?

## `/speckit.plan`

```text
Planifica sobre 002.

packages/hook-runtime:
- Tipos HookContext publicables como .d.ts.
- Transpilado TS→JS con Sucrase (decisión D2 de 001); medir el tiempo de transformación y la cobertura de sintaxis pendientes de D2.
- Validación del valor devuelto con Zod antes de aplicarlo.

apps/extension:
- Página sandbox (manifest sandbox.pages) embebida como iframe en el panel. Recibe { código, HookContext } por postMessage, transpila, ejecuta y devuelve el resultado o el error.
- El panel verifica event.source y el origen del sandbox en cada mensaje; responde siempre con targetOrigin explícito, nunca "*".
- Timeout de 2 s: si se excede, el panel recrea el iframe del sandbox (corta bucles infinitos) y el SW continúa el request sin cambios.
- Editor con HookContext.d.ts cargado. Elegir en research.md entre Monaco y CodeMirror 6 (con el servicio de lenguaje de TypeScript para autocompletado y errores de tipo) con estos criterios: tamaño del bundle, medido; autocompletado y errores de tipo con HookContext.d.ts; funcionamiento con la CSP de las páginas de la extensión sin `unsafe-eval`; accesibilidad con teclado y lector de pantalla; tema claro y oscuro de DevTools. El editor y el chequeo de tipos se cargan solo al abrir el editor de hooks, nunca en la carga inicial del panel. Registrar el tamaño resultante como en 005.
- Consola de logs por request.

CSP:
- extension_pages: "script-src 'self'; object-src 'self'" sin cambios.
- sandbox: la mínima para ejecutar el hook ('unsafe-eval' solo ahí, para ejecutar el JS transpilado; con Sucrase no hace falta 'wasm-unsafe-eval'), con connect-src 'none', y sin acceso a chrome.* por diseño de MV3.

Seguridad: suite de pruebas de escape (fetch, XHR, WebSocket, importScripts, chrome, parent, top, document.cookie de la pestaña); hooks importados desactivados por defecto con vista previa; límite de tamaño; ningún permiso nuevo.

Pruebas: unitarias del runtime y de la validación del resultado; E2E de una regla con hook en ambas etapas; suite de escape; prueba de bucle infinito; medición de overhead; tamaño del bundle con y sin el editor cargado.
```

## `/speckit.tasks`

```text
Genera tasks.md por historia (P1 escribir, P1 fallar seguro, P2 compartir).
Primero la suite de pruebas de escape del sandbox (debe existir antes del runtime). TDD en hook-runtime. [P] en lo paralelizable. Ruta de archivo en cada tarea.
Incluye revisión de CSP, E2E, revisión axe del editor y checkpoint demostrable.
```
