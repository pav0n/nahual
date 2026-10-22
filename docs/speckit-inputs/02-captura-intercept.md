# Nahual — 02 · Captura e intercept condicional

> Feature `002-captura-intercept`. Depende de: `001-spike-cdp` (monorepo, DebuggerManager, mensajería y research.md).
> Objetivo: la primera versión usable. Ver el tráfico, crear reglas y pausar o modificar solo lo que cumple una condición.

## Contexto para el agente

Nahual es una extensión de Chrome MV3 (`chrome.debugger` + CDP) para devs frontend. La base técnica ya existe (ver `specs/001-spike-cdp/plan.md` y `research.md`). Esta feature agrega la lista de tráfico, el motor de reglas, las acciones sobre el tráfico y el onboarding.

---

## `/speckit.specify`

```text
Especifica la captura de tráfico y el intercept condicional de Nahual.

P1 — Ver el tráfico
Como dev, quiero ver los requests de la pestaña con su detalle, para entender qué hace mi app.
Aceptación:
- Lista con método, URL, status, tipo, tamaño y tiempo; filtro por texto, regex, status y tipo.
- Detalle con headers y body de request y response; JSON con formato, binarios y bodies > 5 MB solo con metadatos.
- Historial con tope de 2,000 entradas por pestaña; se puede limpiar con deshacer.

P1 — Pausar condicionalmente
Como dev, quiero que la app se detenga solo cuando una API responda con error o datos vacíos, para editar esa respuesta sin pausar todo lo demás.
Aceptación:
- Una regla tiene: prefiltro de URL (glob o regex), método, tipo de recurso, etapa (Request o Response) y condición.
- Condiciones en Request: método, header, query param, JSONPath sobre el body, operationName de GraphQL.
- Condiciones en Response: status (comparación, rango, lista), header, JSONPath sobre el body, operationName GraphQL, presencia de errors en GraphQL.
- Al pausar, el panel muestra el item editable (método, URL, headers, body) con: Continuar, Continuar sin cambios, Responder con mock, Abortar.
- Timeout configurable (60 s por defecto) visible en cuenta regresiva; al vencer continúa sin cambios y se registra.
- Varios pausados forman una cola en orden de llegada, resolubles en cualquier orden.
- Lo que no cumple la condición no se retrasa perceptiblemente.

P2 — Mock, fallo y retraso
Aceptación:
- Acciones por regla: Pausar, Mock (status, headers, body sin tocar la red), Fallar (error de red elegible), Retrasar (N ms), Solo registrar.
- Si varias reglas coinciden, se aplica la de mayor prioridad (orden visible y reordenable en la lista de reglas).
- Reglas activables o desactivables individualmente y con un interruptor global "pausar Nahual".

P1 — Primer uso comprensible
Como usuario nuevo, quiero entender por qué Chrome muestra la barra "está depurando este navegador" y qué ve Nahual, para confiar en la herramienta.
Aceptación:
- Onboarding de 3 pasos o menos en el primer uso: barra amarilla, qué datos ve la extensión, que nada sale del navegador.
- Indicador permanente del estado del debugger con acción para soltar o reconectar.
- Estado vacío con acción sugerida ("Crea tu primera regla" y una plantilla: "Pausar respuestas con error").

Casos límite: la pestaña navega o se cierra con items en cola; el debugger se suelta con items pausados (se continúan sin cambios); reglas con regex inválida (se rechazan al guardar con mensaje claro); bodies comprimidos; redirecciones sin body.

Criterios de éxito:
- Un usuario nuevo pausa y edita su primera respuesta en menos de 2 minutos sin documentación.
- Overhead p95 < 20 ms por request interceptado sin pausa.
- 0 casos de página colgada en las pruebas E2E.
```

## `/speckit.clarify` — preguntas sugeridas

1. ¿Las reglas se guardan globalmente o por dominio de la app?
2. ¿El historial persiste en IndexedDB o solo en memoria?
3. ¿Qué plantillas de regla incluir de inicio?

## `/speckit.plan`

```text
Planifica sobre la base de 001.

packages/domain (TDD, sin chrome.*):
- Rule, Condition, Action, CapturedExchange, PausedItem como tipos + schemas Zod.
- Evaluador de condiciones (JSONPath, comparadores de status, GraphQL operationName/errors) puro y con pruebas por caso.
- Resolución de prioridad cuando varias reglas coinciden.
- Cálculo de patrones Fetch.enable a partir de las reglas activas (agrupar por etapa, mínimo de patrones).

apps/extension:
- Service worker: RuleEngine conectado a FetchInterceptor; Network.enable para captura pasiva; Fetch.enable solo con patrones de reglas activas; cola de pausados con timeout y limpieza al navegar, cerrar o soltar.
- Store: chrome.storage.local para reglas (validadas con Zod al leer); historial en memoria con tope.
- Panel React: lista de tráfico virtualizada, detalle, editor de reglas, cola de pausados con cuenta regresiva, onboarding, indicador de estado. Zustand + Immer. Monaco o editor ligero para bodies JSON (decidir en research.md según peso del bundle).
- Componentes accesibles (Radix UI o similar), tema de DevTools (chrome.devtools.panels.themeName), atajos: pausar/continuar todo, continuar item actual, buscar.

Seguridad: los bodies se muestran siempre como texto; mensajes panel↔SW validados; las reglas importadas o leídas de storage se validan antes de usarse; ningún permiso nuevo respecto a 001.

Pruebas: unitarias del evaluador y la prioridad; integración con CDP simulado (requestPaused → acción); E2E con una app de prueba que responde 200/500/vacío; axe sobre el panel; medición de overhead.
```

## `/speckit.tasks`

```text
Genera tasks.md por historia (P1 tráfico, P1 pausar, P1 onboarding, P2 acciones).
TDD en packages/domain. [P] en lo paralelizable. Ruta de archivo en cada tarea.
Incluye por historia: pruebas E2E, revisión axe, verificación de que ningún error deja la página colgada, y un checkpoint demostrable.
```
