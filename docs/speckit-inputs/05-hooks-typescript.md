# Nahual — 05 · Hooks en TypeScript

> Feature `005-hooks-typescript`. Depende de: `002-captura-intercept` (motor de reglas y acciones).
> Objetivo: que el dev transforme tráfico con lógica propia, escrita en TypeScript con autocompletado, sin poner en riesgo el navegador.

## Contexto para el agente

Nahual es una extensión de Chrome MV3 (`chrome.debugger` + CDP) para devs frontend. Las reglas ya soportan Pausar, Mock, Fallar, Retrasar y Registrar; esta feature agrega la acción **Modificar con hook**. Restricción MV3: no hay `eval` en el service worker ni en las páginas de la extensión. El código del usuario solo puede correr en una página declarada en `sandbox.pages` del manifest, comunicada por `postMessage`.

Es la feature con más superficie de ataque: el código del hook puede venir de terceros.

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
- Transpilado TS→JS con la herramienta elegida en research.md de 001 (esbuild-wasm o Sucrase).
- Validación del valor devuelto con Zod antes de aplicarlo.

apps/extension:
- Página sandbox (manifest sandbox.pages) embebida como iframe en el panel. Recibe { código, HookContext } por postMessage, transpila, ejecuta y devuelve el resultado o el error.
- El panel verifica event.source y el origen del sandbox en cada mensaje; responde siempre con targetOrigin explícito, nunca "*".
- Timeout de 2 s: si se excede, el panel recrea el iframe del sandbox (corta bucles infinitos) y el SW continúa el request sin cambios.
- Editor Monaco con HookContext.d.ts cargado.
- Consola de logs por request.

CSP:
- extension_pages: "script-src 'self'; object-src 'self'" sin cambios.
- sandbox: la mínima para ejecutar el hook ('unsafe-eval' o 'wasm-unsafe-eval' solo ahí, según el transpilador), con connect-src 'none', y sin acceso a chrome.* por diseño de MV3.

Seguridad: suite de pruebas de escape (fetch, XHR, WebSocket, importScripts, chrome, parent, top, document.cookie de la pestaña); hooks importados desactivados por defecto con vista previa; límite de tamaño; ningún permiso nuevo.

Pruebas: unitarias del runtime y de la validación del resultado; E2E de una regla con hook en ambas etapas; suite de escape; prueba de bucle infinito; medición de overhead.
```

## `/speckit.tasks`

```text
Genera tasks.md por historia (P1 escribir, P1 fallar seguro, P2 compartir).
Primero la suite de pruebas de escape del sandbox (debe existir antes del runtime). TDD en hook-runtime. [P] en lo paralelizable. Ruta de archivo en cada tarea.
Incluye revisión de CSP, E2E, revisión axe del editor y checkpoint demostrable.
```
