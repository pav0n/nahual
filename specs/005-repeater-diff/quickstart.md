# Quickstart: validar el repeater y el diff (005)

## Requisitos

Los de 004: Node.js 24, pnpm 10, Chromium de Playwright y Chrome estable para la validación
manual.

## Verificar y construir

```bash
pnpm install --frozen-lockfile
pnpm lint && pnpm typecheck && pnpm test          # dominio (diff, redacción, repeater) + integración del SW
pnpm build && pnpm verify:dist                    # manifest 0.5.0, único fetch marcado, plantilla con hash fijo
pnpm --filter @nahual/extension build:test
pnpm e2e                                          # incluye repeater-*.spec.ts, inyección y @perf (SC-003)
pnpm --filter @nahual/extension e2e:visual        # capturas nuevas del repeater y el diff
EXPERIMENTS=1 pnpm --filter @nahual/extension e2e # X1 (mundo aislado), X2 (permiso y fetch del SW), X3 (worker)
```

El servidor de prueba (`e2e/fixtures/servers.ts`) suma rutas para el diff (`/diff/a`, `/diff/b`
con cambios conocidos, `/diff/ids` con arrays reordenados, `/diff/text`, `/diff/big`), una ruta
que devuelve los headers y cookies recibidos (`/echo`) y una sin CORS (`/no-cors`).

## Validación manual (Chrome estable, perfil limpio)

`pnpm --filter @nahual/extension fixture:serve` y cargar `apps/extension/dist` sin empaquetar.
Iniciar sesión en la SPA de prueba (pone una cookie) y abrir el panel Nahual.

| # | Paso | Esperado | Cubre |
|---|---|---|---|
| 1 | Llamar a `/api/items`; clic derecho en la fila ⇒ "Enviar al repeater" | Sección Repeater con una pestaña `GET /api/items`, modo "Contexto de página" visible | US1-1/2, FR-001–003, FR-009 |
| 2 | Pulsar `Ctrl+Enter` (`Cmd+Enter` en macOS) sin editar | Respuesta con status, tiempo y tamaño; entrada nueva en el historial; en Tráfico aparece la fila marcada "repeater"; < 10 s desde el paso 1 | US1-3, FR-010a, SC-001 |
| 3 | Cambiar a `/echo`, añadir un header `X-Prueba: 1` y enviar en ambos modos | Contexto de página: el eco muestra la cookie y el origen de la app. Contexto limpio: Chrome pide acceso **solo** a ese origen; al concederlo, el eco no muestra cookies | US1-4, FR-011, FR-011a, SC-005, SC-005b |
| 4 | Negar el acceso en otro origen | El envío falla con la causa y propone el contexto de página; Ajustes ⇒ General no lista ese origen | FR-011a |
| 5 | Añadir un header `Cookie` en contexto de página | El editor lo marca como "el navegador no lo deja fijar"; el resultado lo lista como no enviado tal cual | FR-008, R6 |
| 6 | Crear la regla "Pausar respuestas con error" y enviar a `/api/error` | El envío queda pausado; aparece en Pausados; al continuar, el resultado dice qué regla actuó | FR-010a |
| 7 | Renombrar, duplicar y cerrar una pestaña; Deshacer | La pestaña vuelve con su historial | US1-6, FR-020 |
| 8 | Navegar la SPA a otro sitio con una pestaña del repeater abierta | Contexto de página deshabilitado con causa y solución; contexto limpio disponible | US1-8, FR-012 |
| 9 | En una pestaña de `/diff/a`, cambiar la URL a `/diff/b`, enviar y "Comparar con el original" | Lista de cambios con ruta (`+`, `−`, `~`), status y headers; `J`/`K` recorren los cambios | US2-1/3/5/8, FR-024/025/031/032 |
| 10 | Ignorar `$.meta.timestamp`; cerrar el diff; enviar otra vez y comparar | El timestamp sigue ignorado (indicador "1 ignorado"); el resto igual | US2-6, FR-028/029 |
| 11 | Comparar `/diff/ids` (mismos elementos reordenados y uno nuevo) | Solo el elemento nuevo aparece como añadido; el diff dice "por id" | FR-025a |
| 12 | Comparar dos respuestas con `Set-Cookie`, `access_token` en el body y `?token=` en `Location` | Valores redactados con "cambió"; "Mostrar valores sensibles" los revela solo en ese diff | US2-7, FR-030, SC-006 |
| 13 | Pegar un JSON esperado y compararlo con un envío | Solo diferencias de body; lados intercambiables | US2-9, FR-022a |
| 14 | Comparar `/diff/text` (texto plano) y `/diff/big` (1 MB de JSON) | Diff por líneas; el grande aparece en < 1 s sin congelar el panel | FR-026, SC-003 |
| 15 | Cerrar y reabrir DevTools | Repeater vacío con la explicación; `chrome.storage.local` solo tiene la lista de ignorados (claves hash) | FR-020a, SC-005a |
| 16 | Recorrer todo solo con teclado a 320 px, en claro y oscuro | Todo operable, foco visible, sin scroll horizontal | FR-033, SC-007 |
| 17 | Prueba de comprensión: un dev sin explicación envía al repeater y compara con el original | < 30 s; registrar el tiempo en research.md | SC-008 |
