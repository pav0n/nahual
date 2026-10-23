# Quickstart: validar captura e intercept condicional

## Requisitos

Los de [001](../001-spike-cdp/quickstart.md): Node.js 24, pnpm 10 (`corepack enable`), Chrome
estable ≥ 120.

## Verificar y construir

```bash
pnpm install --frozen-lockfile
pnpm lint && pnpm typecheck && pnpm test    # dominio (TDD, ≥ 85%), protocolo, SW con CDP simulado
pnpm build && pnpm verify:dist              # manifest sin cambios, sin red propia ni eval
pnpm e2e                                    # Playwright: tráfico, reglas, acciones, onboarding, a11y, sin cuelgues
EXPERIMENTS=1 pnpm --filter @nahual/extension e2e   # overhead (research R20)
```

Esperado: todo en verde; `verify:dist` confirma 0 permisos nuevos (SC-006); la suite E2E termina
sin páginas colgadas (SC-003); axe sin violaciones serias o críticas (SC-007).

## App de prueba

El fixture `apps/extension/e2e/fixtures/servers.ts` sirve una SPA (origen A) y una API (origen B)
con: `/api/items` (200 con datos), `/api/empty` (200 `{"items": []}`), `/api/error` (500),
`/graphql` (operaciones `GetUser` con y sin `errors`), `/gzip` (JSON comprimido), `/binary`
(imagen), `/big` (6 MB) y `/redirect`. Se usa en E2E y en la validación manual
(`pnpm --filter @nahual/extension fixture:serve`).

## Validación manual (perfil de Chrome limpio)

Cargar `apps/extension/dist` en `chrome://extensions` y abrir el panel Nahual en DevTools sobre
la SPA del fixture.

| # | Paso | Resultado esperado | Spec |
|---|---|---|---|
| 1 | Abrir el panel por primera vez | Onboarding de ≤ 3 pasos; el último ofrece "Adjuntar y empezar" | US3-1/3, FR-027 |
| 2 | "Adjuntar y empezar" y recargar | Barra de Chrome visible; la lista se llena con método, URL, status, tipo, tamaño y tiempo | US1-1, FR-001/002 |
| 3 | Filtrar `items`, luego `/api\/(items\|empty)/`, `5xx`, tipo Fetch | "N de M" correcto en cada filtro | US1-2, FR-003 |
| 4 | Abrir `/api/items`, `/binary` y `/big` | JSON formateado; binario y > 5 MB solo con metadatos; `Cookie` enmascarada con "Mostrar" | US1-4/5, FR-004/004a |
| 5 | Lista de reglas vacía ⇒ plantilla "Pausar respuestas con error" ⇒ guardar | Regla activa para el sitio A | US3-6/7, FR-018 |
| 6 | En la SPA, llamar a `/api/error` y a `/api/items` | Solo el 500 entra en la cola con cuenta regresiva de 60 s; el 200 llega al instante | US2-3, FR-022/026 |
| 7 | Editar el body del 500 a `{"ok": true}`, status 200 y "Continuar" | La SPA muestra `{"ok": true}` | US2-8, FR-020/021 |
| 8 | Regla JSONPath `$.items` está vacío; llamar a `/api/empty` | Se pausa; con `/api/items` no | US2-4 |
| 9 | Tres pausas; resolver la segunda primero | Las otras siguen con su cuenta regresiva | US2-10, FR-023 |
| 10 | Con un item en cola, navegar a otra página | La cola se vacía; la entrada dice "descartado por navegación" | Edge cases, FR-025 |
| 11 | Plantillas "Simular API caída" y "Simular red lenta" con prefiltro `*api/items*` | 503 sin llegar al servidor; respuesta tras ≥ 3 s | US4-1/3 |
| 12 | Dos reglas que coinciden; reordenar con teclado | Se aplica la de arriba | US4-5, FR-016 |
| 13 | "Pausar Nahual" (`Alt+Shift+P`) | Ninguna regla actúa; la captura sigue; el indicador lo muestra | US4-8, FR-017 |
| 14 | Regex `([a-z` en el prefiltro | Rechazada al guardar con el campo señalado | US2-12, FR-013 |
| 15 | Cerrar y reabrir el panel | Se adjunta solo; historial vacío; reglas intactas | FR-007, FR-027a |
| 16 | Pulsar "Soltar" con un item en cola | Item continúa sin cambios; indicador "desconectado" con "Reconectar" | Edge cases |
| 17 | Abrir un sitio distinto (origen B como página) | Las reglas del sitio A no aplican ahí | US2-2, FR-014a |
| 18 | Chrome en inglés, tema oscuro, panel a 320 px, solo teclado | Todo en inglés, legible y operable | FR-030/031 |

## Prueba moderada de primer uso (SC-001)

Cinco devs que no conocen Nahual, sin documentación, con la consigna "haz que la llamada a
`/api/error` se detenga y cambia su respuesta antes de que llegue a la app". Se cronometra desde
la primera apertura del panel hasta "Continuar" con la respuesta editada. Éxito: al menos 4 de 5
en menos de 2 minutos. Registrar tiempos y puntos de fricción en `research.md`.
