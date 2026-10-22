# Nahual — 01 · Spike CDP y base del proyecto

> Feature `001-spike-cdp`. Depende de: constitución (`00`).
> Objetivo: validar los riesgos técnicos más altos y dejar el esqueleto del monorepo sobre el que se construyen las demás features.

## Contexto para el agente

Nahual es una extensión de Chrome MV3 para desarrolladores frontend que intercepta y modifica tráfico HTTP con `chrome.debugger` + CDP. Esta feature no entrega funciones al usuario final: entrega la base técnica y decisiones documentadas. Restricciones conocidas de Chrome:

- Al adjuntar `chrome.debugger`, Chrome muestra una barra amarilla no descartable.
- Solo un cliente debugger por pestaña: abrir las DevTools nativas puede chocar.
- Si el service worker se reinicia, pueden quedar sesiones del debugger huérfanas.
- El body no está disponible en redirecciones.
- MV3 prohíbe `eval` en el service worker y en las páginas de la extensión.

---

## `/speckit.specify`

```text
Especifica el spike técnico y la base del proyecto Nahual.

Historia única (P1): Como equipo de desarrollo, queremos validar que podemos adjuntar el debugger a una pestaña, pausar y continuar requests y responses de forma estable, para decidir la arquitectura con datos y no con suposiciones.

Aceptación:
- Desde un panel mínimo de DevTools se adjunta y se suelta el debugger de la pestaña inspeccionada; el panel muestra el estado (adjunto, desconectado, en conflicto).
- Con un patrón de URL configurado, un request se pausa en etapa Request y otro en etapa Response; ambos se pueden continuar sin cambios y con un header modificado.
- Si el usuario abre las DevTools nativas o el debugger se suelta por otra causa, el panel lo detecta y ofrece reconectar.
- Si el service worker se reinicia, al arrancar no quedan sesiones colgadas ni requests sin resolver.
- Se documenta si los preflight CORS (OPTIONS) son interceptables con Fetch y si modificar los headers Access-Control-* en etapa Response basta para que Chrome acepte la respuesta.
- Se mide el overhead de interceptar sin pausar sobre una app real (p50, p95).

Criterio de salida: 1 hora de uso en una app real sin sesiones colgadas, y research.md con decisiones sobre: estrategia CORS, transpilador de hooks (esbuild-wasm vs Sucrase), plugin de build CRX, librería de JSONPath y librería de diff JSON.

Fuera de alcance: UI final, reglas persistentes, cualquier función de usuario.
```

## `/speckit.clarify` — preguntas sugeridas

1. ¿Licencia del proyecto (MIT/Apache-2.0 o comercial cerrado)? Afecta qué código de terceros se puede reutilizar (Requestly es AGPLv3).
2. ¿Panel solo en DevTools o también side panel de Chrome?
3. ¿Qué app real se usará como banco de pruebas del spike?

## `/speckit.plan`

```text
Planifica la base técnica de Nahual.

Monorepo pnpm + Turborepo:
- packages/domain: lógica pura (vacía en esta feature, con su configuración de pruebas lista).
- packages/protocol: contratos de mensajes entre contextos como schemas Zod con tipo, versión e id de correlación.
- apps/extension: manifest MV3, service worker, devtools_page, panel React mínimo.

Stack: TypeScript 5 strict, React 19, Vite + plugin CRX para MV3 (bundles separados por contexto), Vitest, Playwright con la extensión cargada, ESLint + Prettier, chrome.i18n con _locales/es y _locales/en desde el primer commit.

Componentes del service worker:
- DebuggerManager: attach/detach por pestaña, escucha chrome.debugger.onDetach, al arrancar hace detach de targets conocidos (limpieza de huérfanas), reconexión explícita a pedido del panel.
- FetchInterceptor (mínimo): Fetch.enable con patrones y etapa, maneja Fetch.requestPaused, Fetch.getResponseBody, continueRequest/continueResponse.
- Puerto de mensajería con el panel (chrome.runtime.connect), validación Zod y verificación sender.id === chrome.runtime.id.

Manifest de esta feature: permisos "debugger" y "storage"; host permissions opcionales. CSP extension_pages "script-src 'self'; object-src 'self'".

CI (GitHub Actions): lint, typecheck, pruebas, pnpm audit, build reproducible.

Experimentos a documentar en research.md: preflight CORS con Fetch, modificación de Access-Control-* en Response, comportamiento con DevTools nativas abiertas, medición de overhead.
```

## `/speckit.tasks`

```text
Genera tasks.md para el spike:
- Setup del monorepo, CI y configuración de pruebas primero.
- Pruebas de protocolo (Zod) antes de implementar la mensajería.
- Tareas de experimento con su entregable en research.md.
- Prueba E2E con Playwright: adjuntar, pausar, continuar, soltar.
- Prueba de robustez: reiniciar el service worker con un request pausado.
- Checkpoint final: demo de punta a punta y research.md completo.
Marca [P] lo paralelizable e indica la ruta de cada archivo.
```
