# Quickstart: validar CORS de desarrollo

## Requisitos

Los de [002](../002-captura-intercept/quickstart.md): Node.js 24, pnpm 10, Chrome estable ≥ 120.

## Verificar y construir

```bash
pnpm install --frozen-lockfile
pnpm lint && pnpm typecheck && pnpm test    # clasificador, headers, validador, reporte (TDD, ≥ 85%); protocolo v3; CorsRelaxer con CDP simulado
pnpm build && pnpm verify:dist              # manifest sin cambios; sin __nahualCorsTimeScale ni __nahualFaults en producción
pnpm e2e                                    # diagnóstico, relajación, aislamiento, expiración, limpieza, reporte, a11y
EXPERIMENTS=1 pnpm --filter @nahual/extension e2e   # X1–X4 y overhead (research R5–R7, R17)
```

Esperado: todo en verde; 0 permisos nuevos; los experimentos registran sus resultados en
[research.md](./research.md#resultados-por-registrar).

## App de prueba

`pnpm --filter @nahual/extension fixture:serve` sirve la SPA (origen A, `:4310`), la API (origen
B, `:4311`) y un tercer origen (C, `:4312`). Rutas CORS de la API (research R16):

| Ruta | Comportamiento | Causa esperada |
|---|---|---|
| `/cors/none` | Sin headers CORS | `missing_allow_origin` |
| `/cors/mismatch` | `Allow-Origin: https://otro.example` | `origin_mismatch` |
| `/cors/preflight-401` | `PUT`; el `OPTIONS` responde 401 | `preflight_status` |
| `/cors/preflight-redirect` | El `OPTIONS` redirige | `preflight_redirect` |
| `/cors/method` | Preflight sin el método pedido | `method_not_allowed` |
| `/cors/header` | Preflight sin `x-custom` | `header_not_allowed` |
| `/cors/wildcard-credentials` | `Allow-Origin: *` con `credentials: "include"` | `wildcard_with_credentials` |
| `/cors/no-credentials` | Origen exacto sin `Allow-Credentials`, con credenciales | `missing_allow_credentials` |
| `/cors/ok` | CORS correcto | No bloqueado |

La SPA tiene botones para cada ruta, con y sin credenciales, y uno que llama al origen C.

## Validación manual (perfil limpio)

| # | Paso | Resultado esperado | Spec |
|---|---|---|---|
| 1 | Pulsar cada botón de la tabla | Cada request aparece "Bloqueado por CORS" (salvo `/cors/ok`); el filtro "CORS: bloqueados" los aísla | US1-1, FR-001/002 |
| 2 | Abrir el detalle de cada uno | Causa y solución correctas; "qué pidió" y "qué respondió"; `unrecognized` nunca aparece en la tabla | US1-2/3, FR-003–005, SC-004 |
| 3 | Bloqueo por contenido mixto o bloqueador (ruta `/blocked` con regla de 002 "Fallar") | No se marca como CORS | US1-5 |
| 4 | Detalle de `/cors/preflight-401` ⇒ "Permitir CORS para desarrollo" ⇒ "Permitir" (2 clics) ⇒ repetir | La app recibe 200; el detalle del preflight muestra 401 del servidor y "reemplazado por Nahual" | US2-1/3, FR-012, SC-001 |
| 5 | Indicador | "CORS relajado" con A ⇒ B y cuenta regresiva de 8 h en todas las vistas | US2-5, FR-019 |
| 6 | Misma SPA en otra pestaña con el panel abierto; y botón del origen C en la pestaña relajada | Ambos siguen bloqueados | US2-8, SC-002 |
| 7 | `/cors/wildcard-credentials` relajado | Respuesta con origen exacto y `Allow-Credentials: true`; nunca `*` | FR-010/011, SC-005 |
| 8 | Añadir `http://localhost:4311` a producción con la relajación activa | La relajación termina con aviso; intentar relajar de nuevo muestra la entrada que coincide | US2-7, FR-029/030 |
| 9 | Relajar, apagar con `Alt+Shift+R` y repetir de inmediato | Vuelve a bloquearse (sin permiso guardado por el navegador) | FR-013/020 |
| 10 | Relajar y cerrar el panel / cerrar la pestaña / recargar la extensión | 0 relajaciones: al reabrir no hay indicador y el request se bloquea | US2-6, SC-003 |
| 11 | "Generar reporte para backend" con `Authorization` y cookie sembradas, framework Express ⇒ "Copiar" | Texto con orígenes, métodos, headers, credenciales, `Max-Age` 600, causas, endpoints sin query; ningún valor sensible; aviso de "solo en este navegador" | US3, FR-032–037, SC-006 |
| 12 | Tema oscuro y 320 px | Sección CORS, indicador, confirmación, ajustes y reporte legibles y operables con teclado | FR-039, SC-008 |
