# Quickstart: validar los hooks (006)

Guía para comprobar la feature de punta a punta. Los detalles están en
[contracts/](./contracts/) y [data-model.md](./data-model.md).

## Preparación

```bash
pnpm install
pnpm build                       # dist/ para Chrome estable
pnpm --filter @nahual/extension fixture:serve   # app :4310, API :4311, tercer origen :4312
```

Cargar `apps/extension/dist` sin empaquetar en `chrome://extensions`, abrir la app de prueba,
abrir DevTools ⇒ Nahual ⇒ adjuntar.

## Pasos

| # | Acción | Resultado esperado | Cubre |
|---|---|---|---|
| 1 | Reglas ⇒ nueva regla ⇒ acción "Modificar con hook" | Editor con el aspecto de Sources, función de ejemplo, ayuda de teclado; el panel no cargó el editor hasta este paso (pestaña Network de DevTools sobre el panel) | US1-1, FR-019, SC-007 |
| 2 | Escribir `ctx.` | Autocompletado con descripción en < 1 s | US1-2, SC-005 |
| 3 | Escribir `ctx.response.status = "x"` | Error ondulado en la línea, en Problemas, y el interruptor deshabilitado con motivo | US1-3, FR-016 |
| 4 | Plantilla "Cambiar un campo del JSON" en `/api/items`, etapa Response; activar; recargar la app | La página recibe la respuesta real con el campo cambiado; Tráfico marca el request; la pestaña Hooks muestra resultado, duración y "body" | US1-5, US1-14, SC-004 |
| 5 | Plantilla "Agregar header" en etapa Request; recargar | El eco de la API muestra el header | US1-4 |
| 6 | Hook de etapa Request con `ctx.respond({ status: 200, body: { id: 1 } })` | La página recibe esa respuesta y la API no ve el request | US1-12, FR-010 |
| 7 | Dos reglas con hook sobre `/api/items` (header + body) | Se aplican las dos en orden; la pestaña Hooks muestra la cadena y su duración | US1-10, FR-012 |
| 8 | Hook que cambia el host al tercer origen (`127.0.0.1:4312`) sin permiso | Sale al destino original; error "falta el permiso" en la consola; con la casilla marcada, va al nuevo destino y Tráfico muestra ambos | US1-11, FR-010 |
| 9 | Hook que hace `ctx.log(ctx.request.headers.authorization)` sin permiso | La consola muestra `••••••`; con el permiso, el valor llega al hook pero la consola lo sigue redactando hasta "Mostrar valores sensibles" | US1-13, FR-004, FR-030, SC-014 |
| 10 | Hook contador en `state` "fallar 1 de cada 3"; recargar varias veces | El patrón sigue entre recargas; "Vaciar estado" lo reinicia y "Deshacer" lo recupera | US1-8, FR-008 |
| 11 | Hooks que lanzan, devuelven status 999, tardan 5 s y hacen `while(true)` | La página recibe lo original en ≤ 2,5 s; consola con tipo, mensaje y línea; contador de errores en la barra | US2-1/2/3, SC-003, SC-008 |
| 12 | Dejar el `while(true)` activo y recargar 6 veces | Tras el quinto error, aviso de suspensión; la página deja de esperar; "Reanudar" lo vuelve a ejecutar | FR-022, SC-013 |
| 13 | Hook con `fetch("http://127.0.0.1:4311/leak")` | Error "acceso no permitido"; la API no recibe nada | FR-031, SC-001 |
| 14 | Relajación CORS activa + hook que quita `Access-Control-Allow-Origin` | La página sigue leyendo la respuesta | FR-013 |
| 15 | Exportar el hook del paso 4, borrar la regla, importar el archivo | Vista previa con configuración y código; regla desactivada, "importado", sin permisos; al activarla funciona igual | US3, FR-035–FR-037, SC-006 |
| 16 | Importar un archivo de 150 KB y uno binario | Rechazados con motivo | FR-038 |
| 17 | "Descargar tipos" y abrirlo en un editor con un hook exportado | Autocompletado de `HookContext` | FR-039 |
| 18 | Repetir 1, 4, 11 y la consola en tema oscuro, a 320 px y solo con teclado (Esc + Tab para salir del editor) | Igual que DevTools en ese tema; sin scroll horizontal | FR-040 |

## Comandos de verificación

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm verify:dist
pnpm e2e                                          # incluye hooks-escape y @perf
pnpm --filter @nahual/extension e2e:visual
EXPERIMENTS=1 pnpm --filter @nahual/extension e2e # X1–X3 (solo al inicio)
```
