# Quickstart: validar exportación, perfiles y publicación (007)

Guía para comprobar la feature de punta a punta. Los detalles están en
[contracts/](./contracts/) y [data-model.md](./data-model.md).

## Preparación

```bash
pnpm install
pnpm build                                      # dist/ con versión 1.0.0 e iconos
pnpm --filter @nahual/extension fixture:serve   # app :4310, API :4311, tercer origen :4312
```

Cargar `apps/extension/dist` sin empaquetar en `chrome://extensions` (debe verse el icono),
abrir la app de prueba, abrir DevTools ⇒ Nahual ⇒ adjuntar.

## Pasos

| # | Acción | Resultado esperado | Cubre |
|---|---|---|---|
| 1 | Clic derecho en un `POST /api/items` con `Authorization` ⇒ "Exportar como…" | Diálogo con el aspecto del de importar hook; pestañas cURL, fetch, Vitest, MSW, Zod, Postman; código en el editor de Sources; "3 valores redactados"; nada en el portapapeles | US1-1, FR-001, FR-003, SC-004 |
| 2 | Cambiar de pestaña de formato; cerrar y reabrir | El código cambia en el mismo diálogo; se recuerda el último formato | US1-2 |
| 3 | Activar "Incluir valores sensibles" | Confirmación con causa; al aceptar, el código muestra los valores; al cerrar el diálogo vuelve a redactar | US1-4, FR-011 |
| 4 | "Copiar" y "Descargar" en cURL | Portapapeles con el código mostrado; archivo `post-api-items.sh`; ejecutarlo contra la API devuelve lo mismo que el request original (salvo lo redactado) | US1-5, FR-012 |
| 5 | Exportar Vitest y pegarlo en `tooling/export-smoke/` (o un proyecto Vite nuevo) con `NAHUAL_AUTHORIZATION` definida | `vitest run` pasa sin editar el archivo; sin la variable, falla con "Missing NAHUAL_AUTHORIZATION"; con la API apagada, "Server unreachable" | FR-013, SC-001 |
| 6 | Marcar 5 filas (Ctrl+clic) ⇒ "Exportar handlers MSW" | Un archivo con un handler por endpoint; fusionados y omitidos listados; en el proyecto de prueba, `setupServer(...handlers)` devuelve los 5 status/bodies capturados | US1-7, FR-016, SC-002 |
| 7 | Marcar 3 respuestas de `GET /api/items` ⇒ "Exportar schema Zod" | Campos ausentes como `.optional()`, nulos como `.nullable()`; el schema acepta las 3 y rechaza una con `id` como string | US1-9, FR-015, SC-003 |
| 8 | Marcar 5 filas ⇒ "Exportar colección de Postman" e importarla en Postman | Importa sin avisos; 5 elementos con ejemplo de respuesta; variables `nahual_*` vacías | US1-10, FR-016b, SC-004a |
| 9 | En el repeater, "Exportar como…" con una respuesta seleccionada | Exporta el request en edición; MSW/Vitest/Zod usan esa respuesta | US1-6 |
| 10 | Ajustes ⇒ Perfiles: crear "QA staging" y "Bug 1234"; asignar reglas desde el editor | Etiquetas en la lista de reglas; misma estética que "importado" | US3-5, FR-023 |
| 11 | `Alt+Shift+O` ⇒ elegir "QA staging"; recargar la app | La barra muestra "Perfil: QA staging"; solo actúan sus reglas; el contador cuenta solo esas; las demás dicen "No actúa con QA staging" | US3-1/2/3, FR-020, FR-024, SC-006 |
| 12 | Abrir otra pestaña del mismo sitio y elegir "Bug 1234" | Cada pestaña aplica el suyo; cerrar DevTools y reabrir en una pestaña nueva del sitio restaura el último elegido | US3-4, FR-022 |
| 13 | Eliminar el perfil activo desde Ajustes | Aviso en la franja; la pestaña pasa a "Todas las reglas"; "Deshacer" (10 s) recupera el perfil, no la selección | Edge Cases, FR-023 |
| 14 | Ajustes ⇒ Importar y exportar ⇒ "Exportar configuración" con una relajación CORS activa | Resumen con reglas, hooks, perfiles y orígenes; nota de que las relajaciones no se exportan; el JSON no contiene `Authorization` ni la relajación | US4-1/2/3, FR-026, FR-027 |
| 15 | Borrar todo e importar el archivo | Vista previa con cada hook como texto y los orígenes "nuevo"/"ya presente"; tras confirmar, todo desactivado y "importado"; hooks sin permisos; "Deshacer" lo revierte entero | US4-4/5, FR-030–FR-032, SC-008 |
| 16 | Importar un `.txt`, un JSON con `"version": 2`, uno truncado y uno con 600 reglas | Cada uno rechazado con causa y solución; la configuración no cambia | US4-6, FR-029, SC-007 |
| 17 | Importar el export de Requestly de fixture | Vista previa: Response estática ⇒ Mock, Redirect y Headers ⇒ hooks legibles, grupos ⇒ perfiles; "No soportadas (3)" con motivo; al activar el redirect pide el permiso de destino y luego redirige | US5, FR-035–FR-038, SC-009 |
| 18 | Repetir 1, 11, 15 y 17 en tema oscuro, a 320 px y solo con teclado | Indistinguible de las vistas vecinas; sin scroll horizontal; axe limpio | FR-006, SC-012, SC-013 |
| 19 | Crear el tag `v1.0.0-rc.1` en una rama de prueba y ver el workflow | Job `build` verde con zip, SBOM y atestación en el release; `gh attestation verify nahual.zip --repo pav0n/nahual` pasa; release marcado como prerelease; el job `publish` no corre | US2-1/2/3, FR-039–FR-042, SC-010 |
| 20 | Leer `docs/store/` | Listing es/en explica permisos y barra amarilla; política y prácticas de datos coinciden; capturas y video generados | US2-4/5, FR-043–FR-045 |

## Comandos de verificación

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm verify:dist
pnpm --filter @nahual/export-smoke test            # Vitest + MSW + Zod reales (SC-001..003)
pnpm e2e                                           # incluye export, profiles, import y storage-privacy
pnpm --filter @nahual/extension e2e:visual
pnpm --filter @nahual/extension e2e:store          # capturas y video del listing
node scripts/build-zip.mjs && node scripts/build-sbom.mjs
```
