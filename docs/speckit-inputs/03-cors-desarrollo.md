# Nahual — 03 · CORS de desarrollo

> Feature `003-cors-desarrollo`. Depende de: `002-captura-intercept` (motor de reglas, lista de tráfico) y la decisión CORS en `specs/001-spike-cdp/research.md`.
> Objetivo: seguir trabajando cuando el backend aún no tiene CORS bien configurado, y decirle al backend exactamente qué corregir.

## Contexto para el agente

Nahual es una extensión de Chrome MV3 (`chrome.debugger` + CDP) para devs frontend. La captura, las reglas y la cola de pausados ya existen. Datos técnicos clave:

- El spike 001 documentó si los preflight CORS (OPTIONS) son interceptables por CDP Fetch. **Leer `research.md` antes de planear.**
- Respaldo si no lo son: reglas de sesión de `declarativeNetRequest` con `modifyHeaders`, acotadas por `tabIds`, `initiatorDomains` y `requestDomains`.
- Limitación: modificar headers no corrige un preflight con status no 2xx (401, 404, 500). Ese caso solo se resuelve en el servidor, salvo que el preflight se pueda responder localmente vía CDP.
- `Access-Control-Allow-Origin: *` no es válido con credenciales: hay que devolver el origen exacto y `Access-Control-Allow-Credentials: true`.

---

## `/speckit.specify`

```text
Especifica el manejo de CORS de desarrollo de Nahual.

P1 — Entender un error de CORS
Como dev, quiero saber por qué un request falla por CORS, en lenguaje claro.
Aceptación:
- Los requests bloqueados por CORS se marcan "Bloqueado por CORS" en la lista de tráfico.
- El detalle explica la causa: falta Access-Control-Allow-Origin, método no permitido, header no permitido, preflight con status no 2xx, credenciales con origen comodín, redirección en preflight.
- Muestra qué pidió la app (origen, método, headers solicitados, credenciales) y qué respondió el servidor.

P1 — Desbloquear para seguir trabajando
Como dev, quiero relajar CORS solo para mi app y mi API de desarrollo, sin abrir mi navegador a cualquier sitio.
Aceptación:
- Desde un request bloqueado, "Permitir CORS para desarrollo" crea una regla acotada a: esta pestaña, el origen de la app (ej. http://localhost:3000) y el origen de la API (ej. https://api-dev.empresa.com).
- Con la regla activa, las respuestas reciben: Allow-Origin con el origen exacto de la app (nunca "*"), Allow-Credentials cuando el request lleva credenciales, Allow-Methods y Allow-Headers derivados de lo que la app pidió, y Expose-Headers configurable.
- Los preflight que fallan se responden localmente con 204 y los headers permitidos cuando la técnica lo permite; si no, se informa que ese caso requiere un cambio en el servidor.
- Un indicador permanente "CORS relajado" muestra los orígenes afectados y el tiempo restante. Expira a las 8 horas por defecto y se apaga en un clic.
- La relajación se elimina al cerrar la pestaña, al soltar el debugger y al reiniciar el service worker.
- Nunca se activa en orígenes que el usuario marcó como producción; intentarlo muestra un aviso y no crea la regla.

P2 — Reporte para backend
Como dev, quiero pasarle al equipo de backend exactamente qué configurar.
Aceptación:
- "Generar reporte para backend" produce un texto copiable con: orígenes que deben permitirse, métodos, headers solicitados reales, si se usan credenciales, Max-Age sugerido y las causas detectadas.
- Incluye ejemplos opcionales de configuración para Express, NestJS, AWS API Gateway y Google Cloud Run.
- El reporte nunca incluye valores de headers sensibles.
- Aviso visible: la relajación solo existe en este navegador; en staging y producción fallará hasta corregir el servidor.

Casos límite: varias APIs con distintos orígenes en la misma app; respuestas opacas en modo no-cors (no se tocan); preflight con redirección; requests de iframes de otro origen; dos pestañas con la misma app (la regla aplica solo a la pestaña donde se creó).

Criterios de éxito:
- De un request bloqueado a la app funcionando en menos de 3 clics.
- 0 relajaciones activas fuera de la pestaña y los orígenes declarados (verificado en E2E con una segunda pestaña y un tercer origen).
- 0 relajaciones activas tras expirar, cerrar la pestaña o reiniciar el service worker.
```

## `/speckit.clarify` — preguntas sugeridas

1. ¿Duración por defecto de la relajación (8 h propuesto)? ¿Configurable?
2. ¿Cómo se marcan los orígenes de producción: lista manual, patrones (`*.empresa.com` sin `dev`/`staging`) o ambos?
3. ¿Qué frameworks incluir en el reporte de inicio?

## `/speckit.plan`

```text
Planifica el módulo CORS sobre 002, usando la decisión de research.md de 001.

packages/domain (TDD):
- Clasificador de causa CORS a partir de los datos del request, la respuesta y corsErrorStatus.
- Cálculo de headers a inyectar: origen exacto, credenciales, métodos y headers solicitados (desde Access-Control-Request-Method/Headers), Expose-Headers.
- Generador del reporte para backend y de los snippets por framework, como funciones puras.
- Validador de que una regla CORS nunca combine "*" con credenciales ni apunte a un origen de producción.

apps/extension, CorsRelaxer en el service worker:
- Detección con Network.loadingFailed + corsErrorStatus.
- Respuesta real: en etapa Response, añadir/reemplazar headers Access-Control-* con Fetch.continueResponse o fulfillRequest.
- Preflight: si research.md confirma que OPTIONS es interceptable, Fetch.fulfillRequest con 204. Si no, reglas de sesión de declarativeNetRequest (updateSessionRules) con condition.tabIds, initiatorDomains y requestDomains, y modifyHeaders.
- Expiración con chrome.alarms; limpieza al cerrar pestaña (tabs.onRemoved), al soltar el debugger y al arrancar el service worker (borrar reglas de sesión huérfanas).
- Panel: badge "Bloqueado por CORS", explicación, botón de relajación, indicador permanente con cuenta regresiva, reporte copiable.

Permisos: "alarms"; "declarativeNetRequestWithHostAccess" solo si el respaldo DNR es necesario (nunca "declarativeNetRequest" completo); justificar ambos en plan.md.

Seguridad: nunca reglas sin tabIds; nunca reglas dinámicas persistentes (solo de sesión); "*" con credenciales prohibido a nivel de validador; orígenes de producción bloqueados; la regla CORS no se exporta sin confirmación.

Pruebas: unitarias del clasificador, cálculo de headers y validador; E2E con un servidor de prueba sin CORS, con preflight 401, con credenciales y con una segunda pestaña y un tercer origen que deben seguir bloqueados.
```

## `/speckit.tasks`

```text
Genera tasks.md por historia (P1 entender, P1 desbloquear, P2 reporte).
TDD en packages/domain. [P] en lo paralelizable. Ruta de archivo en cada tarea.
Incluye pruebas E2E de aislamiento (otra pestaña, otro origen), de expiración y de limpieza tras reinicio del service worker, revisión axe del indicador y checkpoint demostrable.
```
