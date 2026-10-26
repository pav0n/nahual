---
description: "Lista de tareas de 007-export-publicacion"
---

# Tasks: Exportar al código, perfiles y publicación

**Input**: Design documents from `/specs/007-export-publicacion/`

**Prerequisites**: plan.md, spec.md, research.md (R1–R18), data-model.md, contracts/ (exporters,
portable-config, requestly-import, panel-protocol, panel-ui, storage, manifest, release),
quickstart.md

**Tests**: obligatorias. La constitución (principio IV, NO NEGOCIABLE) exige TDD en la lógica
pura y pruebas que intenten violar las garantías; la spec exige además la **ejecución real** de
lo exportado (SC-001..003). Cada prueba de dominio, de protocolo y de integración se escribe,
se ejecuta y **falla** antes de su implementación.

**Interfaz**: requisito transversal del usuario (FR-001 a FR-007, contracts/panel-ui.md). Ninguna
tarea de UI está terminada si introduce un control, estilo o patrón que el panel no tenga:
solo `Dialog`, `ConfirmDialog`, `Menu`, `Tabs`, `Toolbar`, `IconButton`, `Switch`, `Field`,
`EmptyState`, `Toast` con "Deshacer", la franja de indicadores, `AutoSaveField`, CodeMirror de
006 y los tokens `--nh-*`. Cada pieza se compara con su vecina de 004–006 en claro y oscuro
antes de darla por terminada.

**Organization**: una fase por historia en el orden de la spec: US1 exportar al código (P1),
US2 publicación (P1), US3 perfiles (P2), US4 configuración portable (P2), US5 Requestly (P3).
US2 es independiente del resto; US4 necesita US3; US5 necesita US4.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: se puede hacer en paralelo (archivos distintos, sin dependencias pendientes)
- **[USn]**: tarea de la historia de usuario n
- "Prueba primero" = escribir la prueba, verla fallar y solo entonces implementar
- Rutas abreviadas: `domain/` = `packages/domain/src/`; `dtests/` = `packages/domain/tests/`;
  `proto/` = `packages/protocol/src/`; `bg/` = `apps/extension/src/background/`; `panel/` =
  `apps/extension/src/panel/`; `e2e/` = `apps/extension/e2e/`; `tests/` =
  `apps/extension/tests/`; `smoke/` = `tooling/export-smoke/`; locales =
  `apps/extension/public/_locales/{es,en}/messages.json`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: workspace de pruebas reales, fixtures compartidos y servidor de prueba.

- [X] T001 Crear `smoke/` como workspace privado (`@nahual/export-smoke`, `private`, `type: module`): `package.json` con devDependencies exactas `msw` 3.0.0, `vitest` 5.0.3, `zod` 4.6.6, `typescript` 5.9.3 y `@nahual/domain: workspace:*`; `tsconfig.json`; `vitest.config.ts`; `tests/.gitkeep`; añadir `tooling/*` a `pnpm-workspace.yaml`; `pnpm install`; `node scripts/check-licenses.mjs` y `pnpm audit --prod --audit-level high` en verde; comprobar con `tests/dist/bundles.test.ts` que nada de `msw` entra en `apps/extension/dist`
- [X] T002 [P] Fixtures de exportación en `dtests/fixtures-export.ts` (reutilizando `dtests/fixtures.ts`): `GET /api/items?page=1` con respuesta JSON 200 y `Authorization`; `POST /api/items` JSON con `password` en el body, `Cookie` y `?token=`; `multipart/form-data` con una parte de texto y un archivo; body binario; body de 1,5 MB; request sin respuesta (fallido); preflight; tres respuestas de `GET /api/items` con campos ausentes y `null` para la inferencia Zod; dos del mismo endpoint para la fusión MSW
- [X] T003 [P] Servidor de prueba `e2e/fixtures/servers.ts` (rutas bajo `/export/*`, porque `/api/items` ya lo usan las E2E de 002–006 con otra respuesta): `/api/items` (`GET` lista JSON con `id`, `name`, `deletedAt: null|string`, `next?`; `POST` eco JSON 201), `/api/items/:id`, `/api/form` (eco de `application/x-www-form-urlencoded`), `/api/upload` (multipart, responde nombres de partes) y `/api/binary` (PNG de 1 KB); todos con `set-cookie` y `x-request-id`; exponer `apiOrigin` para `smoke/`
- [X] T004 [P] Fixture de Requestly en `e2e/fixtures/requestly-export.json` (contracts/requestly-import.md): array con dos grupos, `Redirect` (`Url` `Wildcard_Matches` con `$1`, destino al tercer origen), `Headers` con `Request`, con `Response` y con ambas, `Response` estática JSON con `statusCode` 503 y otra con `serveWithoutRequest`, `Response` de tipo `code`, `QueryParam`, `Script`, una regla con `filters.requestMethod` y otra con `filters.requestPayload`, una regex inválida, una `Redirect` a `map_local`; copiar también a `dtests/fixtures-requestly.json`

**Checkpoint**: `pnpm install` limpio; `pnpm lint && pnpm typecheck && pnpm test` en verde.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: redacción compartida, schemas y límites, protocolo v6, utilidades del panel y
textos base, de los que dependen todas las historias.

- [X] T005 Prueba primero en `dtests/sensitive.test.ts` y `dtests/diff-redact.test.ts`: `redactValue` y `redactUrlQuery` exportadas desde `domain/sensitive.ts` con el mismo resultado que hoy da `diff/redact.ts` (headers exactos, nombres con `token`/`secret`/`session`/`api-key`/`apikey`/`password`, `_` como `-`, subárbol bajo clave sensible, query decodificada); `redactExportSource` devuelve `redacted: RedactedSite[]` con `where`, `name`, `envVar` (`NAHUAL_AUTHORIZATION`, `NAHUAL_QUERY_TOKEN`, `NAHUAL_BODY_USER_PASSWORD`) y `postmanVar` (`nahual_authorization`); luego mover el recorrido a `domain/sensitive.ts`, dejar `domain/diff/redact.ts` y `panel/hooks/hook-host.ts` usándolo y comprobar que las pruebas de 005 y 006 siguen en verde (research R3, FR-010)
- [X] T006 [P] Prueba primero en `dtests/schemas.test.ts`: `LIMITS` gana `exportBatchMax` 50, `exportInlineBodyBytes` 1,048,576, `zodDepthMax` 10, `profilesPerSiteMax` 50, `profileNameMax` 60, `profilesPerRuleMax` 20, `importFileBytesMax` 10,485,760, `importUndoMs` 10,000; `RuleDraftSchema` y `RuleSchema` aceptan `profileIds: uuid[]` ≤ 20 con `.default([])` e `importedFrom: "config" | "requestly"` opcional (distinto de `HookAction.imported`, booleano de 006); una regla guardada por 006 sin esos campos sigue siendo válida; luego implementar en `domain/schemas/limits.ts` y `domain/schemas/rule.ts`
- [X] T007 [P] Prueba primero en `dtests/profile.test.ts`: `ProfileSchema` (`id` uuid, `site` `SiteSchema`, `name` recortado 1–60, `createdAt`, `updatedAt`), `ProfilesStateSchema` (`version: 1`, `profiles`, `lastActive: Record<site, uuid>`), `uniqueProfileName(profiles, site, name)` sin distinguir mayúsculas; luego implementar en `domain/schemas/profile.ts` y exportar desde `domain/index.ts`
- [X] T008 [P] Prueba primero en `dtests/evaluate.test.ts` y `dtests/select-chain.test.ts`: con `context.activeProfileId = null` el resultado es el de 006; con un id, solo participan reglas cuyo `profileIds` lo contiene (también dentro de una cadena de hooks); luego implementar en `domain/evaluate.ts` (`SelectContext.activeProfileId: string | null`)
- [X] T009 [P] Prueba primero en `packages/protocol/tests/`: v6 (contracts/panel-protocol.md): comandos `saveProfile`, `duplicateProfile`, `deleteProfile`, `restoreProfile`, `setActiveProfile`, `setRuleProfiles`, `importConfig` (`ImportPayload`), `undoImport`; evento `profiles`; `state.activeProfileId`; `saveRule` con `profileIds`; cada uno válido e inválido; luego implementar en `proto/panel-to-sw.ts`, `proto/sw-to-panel.ts` y `PROTOCOL_VERSION = 6` en `proto/envelope.ts`, y ajustar las pruebas de 002–006 que fijan la versión
- [X] T010 [P] Prueba primero en `tests/unit/ui-prefs.test.ts`: `UiPrefs.exportFormat` con default `curl`, valores inválidos ⇒ `curl`, prefs de 006 sin el campo ⇒ default; luego implementar en `panel/ui-prefs.ts`
- [X] T011 [P] Extraer `panel/components/common/clipboard.ts` (`copyText` de `components/cors/CorsReport.tsx`, con el respaldo `execCommand`) y `panel/components/common/download.ts` (`downloadText(name, text, mime)` de `components/hooks/HookEditor.tsx`); dejar ambos componentes usándolos; prueba unitaria en `tests/unit/clipboard-download.test.ts` con `navigator.clipboard` ausente y presente
- [X] T012 [P] Añadir `exportRequest` (`Alt+Shift+E`, `global`) y `openProfileMenu` (`Alt+Shift+O`, `global`) a `panel/shortcuts.ts` con `shortcut_desc_export_request` y `shortcut_desc_open_profile_menu` en locales; `tests/unit/shortcuts.test.ts` sigue en verde (sin repetidos ni reservados); aparecen en Ajustes ⇒ Atajos y en Ayuda
- [X] T013 [P] Icono `profile` (línea, mismo grosor y tamaño que los de 004) y, si no existen, `copy`, `download` y `export` en `panel/components/common/icons.tsx`
- [X] T014 [P] Claves i18n base en locales (`es` y `en`): `action_export_as`, `export_dialog_title`, `export_format_curl|fetch|vitest|msw|zod|postman`, `export_copy`, `export_download`, `export_copied`, `export_downloaded`, `export_redacted_count`, `export_omitted`, `export_merged`, `export_include_sensitive`, `export_include_sensitive_confirm_title|body|ok`, `export_format_needs_response`, `export_format_needs_json`, `export_loading_bodies`, `batch_export_msw`, `batch_export_zod`, `batch_export_postman`, `batch_export_zod_same_endpoint`, `profile_status_all`, `profile_status_named`, `profile_menu_manage`, `profile_menu_empty_suffix`, `profile_settings_title`, `profile_create`, `profile_duplicate`, `profile_delete`, `profile_deleted_undo`, `profile_empty_state`, `profile_empty_add_selected`, `profile_rule_inactive`, `profile_error_required|too_long|duplicate|limit`, `profile_not_found`, `notice_profile_deleted_active`, `notice_profiles_version`, `config_export_title`, `config_export_summary`, `config_export_cors_note`, `config_download`, `config_import`, `config_import_preview_title`, `config_import_confirm`, `config_imported_undo`, `config_origin_new|existing`, `config_profile_renamed`, `config_rule_redacted`, `rule_error_redacted_value`, `config_error_too_large|not_json|not_nahual|newer_version|invalid|limit`, `notice_import_undone`, `undo_expired`, `requestly_import`, `requestly_unsupported_title`, `requestly_error_format`, `requestly_unsupported_rule_type|response_code|redirect_destination|regex_invalid|regex_too_long|filter|empty_pairs|source_key|source_operator`, `rule_imported_requestly`; prueba que ambas locales tienen las mismas claves

**Checkpoint**: `pnpm lint && pnpm typecheck && pnpm test` en verde con protocolo v6 y schemas
nuevos; el panel arranca igual que en 006.

---

## Phase 3: User Story 1 - Exportar un request al código (Priority: P1) 🎯 MVP

**Goal**: "Exportar como…" desde Tráfico, el repeater y el lote, a cURL, fetch, Vitest, MSW, Zod y
Postman, con vista previa, redacción por defecto y ejecución real de lo exportado.

**Independent Test**: quickstart pasos 1–9: exportar el `POST` con `Authorization` a cada
formato; ver y confirmar la redacción; copiar y descargar; ejecutar el test Vitest y los
handlers MSW en `smoke/` contra el servidor del fixture; importar la colección en Postman.

### Dominio (TDD)

- [X] T015 [P] [US1] (código adelantado en T005, que lo necesitaba; pruebas escritas después) Prueba primero en `dtests/export/source.test.ts`: `exportSourceFromExchange(exchange, requestBody, responseBody)` y `exportSourceFromRepeater(tab, send?)` producen `ExportSource` (data-model.md): headers sin los de `forbidden-headers` salvo `cookie` y `referer`; `ExportBody` `text` (con `contentType`), `form` (parsea `application/x-www-form-urlencoded`), `multipart` (partes de texto; archivos `omitted: true`), `omitted` con `reason` `binary|tooLarge|unavailable` y `size` (texto > `exportInlineBodyBytes` ⇒ `tooLarge`), `none`; `response: null` sin respuesta; luego implementar en `domain/export/source.ts`
- [X] T016 [P] [US1] Prueba primero en `dtests/export/curl.test.ts` (snapshots por fixture de T002 + propiedades: sin fragmentos de valores sensibles con `includeSensitive: false`; dos llamadas iguales ⇒ mismo `code`; comillas simples escapadas `'\''`; `-X` solo si no es `GET`; `--data-raw`, `--data-urlencode`, `-F`, comentarios de omitidos); luego implementar `domain/export/curl.ts` (contracts/exporters.md)
- [X] T017 [P] [US1] Prueba primero en `dtests/export/fetch.test.ts` (snapshots y propiedades como T016; `JSON.stringify` del objeto cuando el body es JSON válido; `URLSearchParams`; `FormData`; `.json()`/`.text()` según `content-type` de la respuesta); luego implementar `domain/export/fetch.ts`
- [X] T018 [P] [US1] Prueba primero en `dtests/export/zod.test.ts`: `merge` conmutativa y asociativa; una muestra ⇒ tipos exactos; campo ausente en alguna ⇒ `.optional()`; `null` en alguna ⇒ `.nullable()`; enteros ⇒ `.int()`; ISO 8601 ⇒ `z.iso.datetime()`; arrays heterogéneos ⇒ `z.union` ordenada por nombre; vacío ⇒ `z.array(z.unknown())`; profundidad > 10 ⇒ `z.unknown()` con comentario; nombre `apiItemsResponse` desde la ruta; el schema generado (evaluado con `zod` real en la prueba) acepta todas las muestras y rechaza `id` como string (SC-003); luego implementar `domain/export/zod.ts` (research R6)
- [X] T019 [P] [US1] Prueba primero en `dtests/export/msw.test.ts`: un handler por endpoint (método + ruta sin query), query en comentario, `HttpResponse.json`/`.text`/`new HttpResponse(null)`, headers de respuesta filtrados (`content-length`, `content-encoding`, `transfer-encoding`, `set-cookie` redactado), fusión con la última respuesta y `merged[]`, requests sin respuesta ⇒ `omitted[]`, orden de la lista; luego implementar `domain/export/msw.ts` (research R5)
- [X] T020 [P] [US1] Prueba primero en `dtests/export/vitest.test.ts`: comentario de variables de entorno solo si hay redactados; `env("NAHUAL_…")` en header, query y campo del body; `fetch` con `.catch` "Server unreachable at <origin>"; `expect(response.status).toBe(<status>)`; `schema.safeParse` solo con respuesta JSON, si no comprueba `content-type`; nombre `post-api-items.contract.test.ts`; luego implementar `domain/export/vitest.ts` (research R7)
- [X] T021 [P] [US1] Prueba primero en `dtests/export/postman.test.ts`: `PostmanCollectionSchema` (Zod, subconjunto v2.1.0: `info.name|schema`, `variable[]`, `item[].request{method,header,url{raw,host,port,path,query},body}`, `response[]` con `code`, `status`, `header`, `body`) valida la salida; sin `_postman_id`; variables `{{nahual_*}}` declaradas con `value: ""`; ejemplo de respuesta solo si la hay; lote de 5 en orden; determinista; luego implementar `domain/export/postman.ts` (research R8)
- [X] T022 [US1] Prueba primero en `dtests/export/index.test.ts`: `exportAs(format, sources, options)`, `FORMATS` (extensión, `needsResponse`, `batch` según data-model.md), `fileNameFor(format, sources)` (`post-api-items.sh`, `handlers.ts`, `api-items.schema.ts`, `nahual-<sitio>.postman_collection.json`), formato sin respuesta/JSON ⇒ error tipado; luego implementar `domain/export/index.ts` y publicarlo como subruta `@nahual/domain/export` (no desde `domain/index.ts`: reexportado ahí, Rollup lo metía en la carga inicial del panel; solo `formats.ts` sigue en el índice)
- [X] T023 [US1] Prueba real en `smoke/tests/exported.test.ts` (SC-001, SC-002, SC-003): levanta `e2e/fixtures/servers.ts`, captura con `fetch` las respuestas de `/api/items` y `/api/items/:id` para construir `ExportSource` reales, escribe en un directorio temporal el test Vitest exportado y lo ejecuta con `vitest` programático (con `NAHUAL_AUTHORIZATION`; sin ella falla con "Missing NAHUAL_AUTHORIZATION"; con el servidor apagado, "Server unreachable"); monta `setupServer(...handlers)` del archivo MSW exportado de 5 requests y compara status, headers no sensibles y body; evalúa el schema Zod exportado contra las muestras; se ejecuta dentro de `pnpm test` (Turborepo incluye el workspace), así que CI y el release lo corren sin un paso aparte; MSW se monta en un proceso Node aparte (`tests/replay.mjs`) porque dentro del worker de Vitest el módulo generado cargaba otra instancia de MSW

### Panel

- [X] T024 [US1] Prueba de integración en `tests/unit/build-export-source.test.ts` y luego `panel/export/build-source.ts`: `buildExportSources(exchangeIds | repeaterTab)` pide los bodies que faltan con `getBody` (uno a uno, con progreso `{ done, total }`), construye `ExportSource[]` con T015 y aplica `redactExportSource` salvo `includeSensitive`; `panel/export/run-export.ts` llama a `exportAs` y devuelve `ExportResult`; límite `exportBatchMax`
- [X] T025 [US1] `panel/components/export/ExportDialog.tsx` + `FormatTabs.tsx` + `ExportStatus.tsx` (contracts/panel-ui.md): `Dialog` con título "Exportar MÉTODO /ruta" (o "N requests"), `Tabs` con los seis formatos (deshabilitados con `title` del motivo cuando `needsResponse` no se cumple), CodeMirror de 006 en solo lectura cargado con `import()` (mismo `codemirror-setup.ts`, extensión `readOnly` y lenguaje por formato: `javascript`/`json`/texto), línea de estado con redactados, omitidos y fusionados, `Switch` "Incluir valores sensibles" ⇒ `ConfirmDialog` (al cerrar el diálogo vuelve a `false`, FR-011), pie con "Copiar" y "Descargar" (`IconButton` con texto) que usan T011 y muestran `Toast`; recuerda el formato en `UiPrefs.exportFormat`; estados: "Generando…" mientras cargan bodies, error de body en comentario
- [X] T026 [US1] Acción `export` en `panel/actions/request-actions.ts` tras `sendToRepeater` (`appliesTo: !isPreflight`, `labelKey: action_export_as`, `shortcut: exportRequest`) con efecto `openExport(exchangeIds)` en `ActionEffects` y el store (`panel/store/ui.ts`: `exportRequest: { kind: "traffic", ids } | { kind: "repeater", tabId } | null`); `tests/unit/request-actions.test.ts` ampliada; `use-shortcuts.ts` abre la exportación del request seleccionado con `Alt+Shift+E`
- [X] T027 [US1] Acciones por lote en `panel/actions/batch-actions.ts`: `exportMsw` (`minSelected: 2`), `exportZod` (`minSelected: 2`, `enabled(exchanges)` solo si todas comparten método + ruta sin query, con `disabledReasonKey: batch_export_zod_same_endpoint`), `exportPostman` (`minSelected: 2`; un solo request exporta Postman desde el diálogo de "Exportar como…"); ampliar `BatchAction` con `enabled?`/`disabledReasonKey?` y la barra de selección de 004 para mostrarlo; `tests/unit/batch-actions.test.ts`; comprobar que la selección múltiple de `TrafficGrid` aparece ahora que `batchEnabled()` es `true` (`e2e/ui-slots.spec.ts` sigue en verde)
- [X] T028 [US1] Botón "Exportar como…" en la barra de la pestaña del repeater (`panel/components/repeater/RepeaterTabs.tsx` o la barra de `RepeaterView.tsx`, mismo `Toolbar`): exporta el request en edición y la respuesta seleccionada en `RepeaterOutput` (`exportSourceFromRepeater`); deshabilitado con motivo si el request no valida
- [X] T029 [US1] E2E `e2e/export.spec.ts`: quickstart 1–5 y 9 (diálogo desde cabecera, menú contextual y `Alt+Shift+E`; cambio de formato y recuerdo; redactados y confirmación; copiar al portapapeles y descargar el archivo con el mismo contenido; repeater); comprobar que ningún fragmento de `Authorization`, cookie ni `token` aparece en las seis salidas sin confirmar (SC-004) y que de un request seleccionado a copiado bastan 3 acciones (SC-005)
- [X] T030 [US1] E2E `e2e/export-batch.spec.ts`: quickstart 6–8 (5 filas ⇒ MSW con fusionados y omitidos; 3 del mismo endpoint ⇒ Zod; endpoints distintos ⇒ Zod deshabilitada con motivo; Postman con 5 elementos validados con `PostmanCollectionSchema`); lote con preflights y sin respuesta ⇒ omitidos listados; sin nada exportable ⇒ `EmptyState` con motivo

**Checkpoint**: quickstart 1–9 demostrables; `smoke/` en verde en CI; `storage-privacy` sin
cambios de contenido.

---

## Phase 4: User Story 2 - Publicar la extensión (Priority: P1)

**Goal**: release reproducible desde CI con SBOM y atestación, subida a la Chrome Web Store con
aprobación manual, y listing, política y materiales coherentes.

**Independent Test**: quickstart 19–20: tag `v1.0.0-rc.1` en una rama de prueba ⇒ job `build`
verde con zip, SBOM y atestación verificable; job `publish` espera aprobación; `docs/store/`
completo y coherente.

- [ ] T031 [P] [US2] Logo e iconos (bloqueada hasta que el usuario apruebe el logo propuesto en la sesión del 2026-10-25 o pida cambios): guardar `docs/brand/nahual.svg` y `docs/brand/nahual-mono.svg` (el logo aprobado por el usuario; si pide cambios, regenerar antes), rasterizar una vez con ImageMagick a `apps/extension/public/icons/icon-16.png`, `icon-32.png`, `icon-48.png`, `icon-128.png` y `panel-16.png` (monocromo) y commitearlos; documentar el comando en `docs/brand/README.md`
- [ ] T032 [US2] Manifest (contracts/manifest.md): versión `1.0.0` en `apps/extension/package.json`; `icons` en `apps/extension/manifest.config.ts`; icono del panel en `chrome.devtools.panels.create` (`apps/extension/src/devtools/*`) si Chrome lo muestra; actualizar `tests/dist/manifest.test.ts`: versión `1.0.0`, los cuatro PNG presentes en `dist/`, `permissions` exactamente `["debugger", "storage"]`, sin `clipboardWrite`, `downloads`, `unlimitedStorage`, `alarms` ni `declarativeNetRequest*`; README "Requisitos" y "Cargar la extensión" mencionan el icono
- [X] T033 [P] [US2] Prueba primero en `tests/dist/sbom.test.ts`: el archivo generado es CycloneDX 1.6 JSON (`bomFormat`, `specVersion`, `serialNumber` `urn:uuid:` derivado del SHA-256 del zip, `metadata.component` `@nahual/extension` 1.0.0, `components[]` únicos ordenados por `purl` con `name`, `version`, `purl pkg:npm/…`, `licenses`, `hashes` del lockfile, sin `timestamp`); cada dependencia de producción del lockfile aparece una vez y ninguna de desarrollo (`msw`, `vitest`, `playwright`) aparece; dos ejecuciones ⇒ mismo archivo; luego implementar `scripts/build-sbom.mjs` (sin dependencias, desde `pnpm list --prod --json --depth Infinity --filter @nahual/extension` y `pnpm-lock.yaml`; licencias leídas del `package.json` de cada paquete: más simple que refactorizar `check-licenses.mjs`, que sigue validándolas en CI)
- [X] T034 [US2] Workflow `.github/workflows/release.yml` (contracts/release.md): disparo `push` tags `v*`; job `build` (`permissions: contents: write, id-token: write, attestations: write`) con checkout, Node por `.nvmrc`, corepack, `pnpm install --frozen-lockfile`, comprobación tag == `apps/extension/package.json` versión, lint, typecheck, test, `audit`, licencias, `verify:dist`, `export-smoke`, dos builds + `build-zip.mjs` con SHA-256 iguales (si difieren, el paso lista en el resumen del job cada archivo de `dist/` cuyo SHA-256 cambió entre los dos builds, antes de fallar), `build-sbom.mjs`, `actions/attest-build-provenance` (v4) sobre `apps/extension/nahual.zip`, `actions/attest` v4.2.2 con `sbom-path` (comprobado al implementar: `actions/attest-sbom` está obsoleta en favor de `actions/attest`) sobre el SBOM, `gh release create "$GITHUB_REF_NAME" nahual.zip nahual.sbom.cdx.json --notes` con el SHA-256, el comando `gh attestation verify` y el enlace a `docs/store/`; job `publish` (`needs: build`, `environment: chrome-web-store`, `permissions: contents: read`) que descarga el zip del release, verifica SHA-256 y `gh attestation verify --repo "$GITHUB_REPOSITORY"`, obtiene el token con `refresh_token`, sube con `POST …/upload/v2/publishers/$CWS_PUBLISHER_ID/items/$CWS_EXTENSION_ID:upload`, publica con `POST …/v2/publishers/…/items/…:publish`, con `curl --fail-with-body -sS` y sin imprimir tokens; **todas las acciones fijadas por SHA de commit** con el tag en comentario
- [X] T035 [P] [US2] CI: añadir a `.github/workflows/ci.yml` un paso `actionlint` (binario descargado por URL fija y verificado por SHA-256, sin paquete npm) sobre `.github/workflows/*.yml`; fijar por SHA las acciones ya usadas en `ci.yml`
- [X] T036 [P] [US2] `docs/store/listing.es.md` y `docs/store/listing.en.md`: nombre, resumen (≤ 132 caracteres), descripción con propósito único, qué hace (captura, pausa, reglas, CORS de desarrollo, repeater y diff, hooks, exportar, perfiles), cada permiso y por qué (`debugger`, `storage`, host opcionales, sandbox), la barra amarilla (por qué aparece, que garantiza que Nahual solo actúa con el panel abierto, cómo soltar con `Alt+Shift+A` o cerrando el panel), qué no hace (sin cuenta, sin red propia, sin telemetría), categoría "Herramientas para desarrolladores", enlace a la política de privacidad y al repositorio
- [X] T037 [P] [US2] `docs/store/permissions.md` (justificación escrita por permiso, coherente con el listing, FR-044), `docs/store/privacy-policy.md` (es/en: cero recolección, todo local, sin servidores ni telemetría, contacto, fecha; es la URL que se declara en la tienda), `docs/store/data-practices.md` (respuestas exactas del formulario de prácticas de datos: ninguna categoría recogida; certificación de uso limitado) y `docs/store/release-checklist.md` (la checklist de la entrada 07 corregida: sin `unlimitedStorage`, `alarms` ni `declarativeNetRequest`; con tag, aprobación, SHA, atestación, listing, capturas, video, política)
- [ ] T038 [US2] Capturas y video del listing: `e2e/store/screenshots.spec.ts` (proyecto `store` en `apps/extension/playwright.config.ts`, 1280×800, claro y oscuro) que genera en `docs/store/assets/`: Tráfico con detalle, la barra amarilla de depuración con el panel abierto, Reglas con una regla y un hook, Repeater con diff, Exportar como… (cURL con redactados) y el selector de perfil (tras US3; mientras, el estado de sesión); guion del video en `docs/store/assets/README.md` y grabación `webm` con `recordVideo` del recorrido (adjuntar, pausar, exportar, soltar); script `e2e:store` en `apps/extension/package.json`
- [X] T039 [US2] README: sección "Instalar un release sin empaquetar" (descargar `nahual.zip` del release, verificar SHA-256 y `gh attestation verify`, descomprimir, cargar; FR-046), "Verificar la reproducibilidad" (mismo Node/pnpm, `pnpm build --force && node scripts/build-zip.mjs`, comparar SHA-256), "Publicación" (el flujo de `release.yml`, el environment `chrome-web-store` y el primer envío manual), y actualizar "Qué hace" con 006 y 007
- [ ] T040 [US2] Ensayo del release: en una rama de prueba, tag `v1.0.0-rc.1` (con la versión temporalmente `1.0.0-rc.1` solo en esa rama) ⇒ job `build` verde; descargar el zip y el SBOM, `gh attestation verify nahual.zip --repo <owner>/nahual` pasa, SHA-256 igual al de las notas; el job `publish` queda esperando aprobación y se rechaza; registrar resultado y prerrequisitos pendientes (repo en GitHub, 2FA, API habilitada, publisher y extension id) en `specs/007-export-publicacion/research.md` sección "Resultados"

**Checkpoint**: quickstart 19–20 demostrables; `pnpm verify:dist` incluye SBOM y manifest 1.0.0.

---

## Phase 5: User Story 3 - Perfiles de reglas (Priority: P2)

**Goal**: perfiles por sitio, perfil activo por pestaña recordado por sitio, selector en la barra
con atajo, gestión en Ajustes y asignación desde el editor y la lista de reglas.

**Independent Test**: quickstart 10–13 con dos pestañas del mismo sitio y perfiles distintos;
cambio por ratón y por `Alt+Shift+O`; reapertura de DevTools; eliminar el perfil activo y
deshacer.

### Service worker (TDD)

- [X] T041 [P] [US3] Prueba primero en `tests/integration/profile-store.test.ts`: `createProfileStore` sobre `nahual.profiles.v1` (contracts/storage.md): `save` (crea o renombra; `profile_error_required|too_long|duplicate|limit`), `duplicate(id, name)` (crea el perfil nuevo y copia su pertenencia en todas sus reglas en una sola escritura de `nahual.rules.v1` + `nahual.profiles.v1`; mismo `profile_error_duplicate` para el nombre), `remove` (quita el id de `profileIds` de las reglas del sitio vía `RuleStore`, guarda instantánea `RESTORE_MS`), `restore`, `lastActive` leído y escrito, versión desconocida ⇒ `notice_profiles_version`, ids huérfanos en `lastActive` descartados al leer; luego implementar `bg/profile-store.ts`
- [X] T042 [P] [US3] Prueba primero en `tests/integration/active-profiles.test.ts`: `createActiveProfiles` en memoria: `onHello(tabId, site)` ⇒ `lastActive[site] ?? null`; `onNavigate(tabId, site)`; `set(tabId, profileId)` valida sitio y actualiza `lastActive`; `onProfileDeleted(id)` ⇒ `null` en las pestañas que lo tenían y lista de `tabId` afectados; `get(tabId)`; luego implementar `bg/active-profiles.ts`
- [X] T043 [US3] Prueba primero en `tests/integration/rule-engine.test.ts` y `tests/integration/rule-store.test.ts`: el contexto de `selectChain` lleva `activeProfileId` de T042; `saveRule`/`setRuleProfiles` rechazan perfiles de otro sitio o > 20 (`rule_invalid`); luego implementar en `bg/rule-engine.ts` y `bg/rule-store.ts`
- [X] T044 [US3] Prueba primero en `tests/integration/background.test.ts` (ampliada): cableado v6 en `bg/app.ts`: comandos `saveProfile`, `duplicateProfile`, `deleteProfile`, `restoreProfile`, `setActiveProfile`, `setRuleProfiles`; evento `profiles` al conectar y en cada cambio; `state.activeProfileId` al conectar, navegar, cambiar y borrar; `notice_profile_deleted_active` a las pestañas afectadas; dos pestañas del mismo sitio con perfiles distintos; reinicio del SW recalcula desde `lastActive`; con un perfil activo sin reglas, una relajación CORS de la pestaña sigue aplicándose (FR-025); luego implementar

### Panel

- [X] T045 [US3] Slice `panel/store/profiles.ts` (`profiles`, `lastActive`, `activeProfileId`, acciones que envían los comandos v6) y `panel/sw-client.ts`/`store/dispatch.ts` para `profiles` y `state.activeProfileId`; selector `rulesThatApply(site, activeProfileId)` para el contador de la barra (FR-024); `tests/unit/profiles-store.test.ts`
- [X] T046 [US3] `panel/components/profiles/ProfileStatus.tsx` y `ProfileMenu.tsx` en `STATUS_ITEMS` antes de `session` (contracts/panel-ui.md): botón con icono `profile` y texto "Perfil: <nombre>" / "Todas las reglas" (a 320 px solo icono con `aria-label` y `title`), `Menu` con "Todas las reglas", perfiles del sitio con `aria-checked` y sufijo "(sin reglas)" si está vacío, separador y "Gestionar perfiles…" (abre Ajustes ⇒ Perfiles); `Alt+Shift+O` lo abre (`use-shortcuts.ts`); mismo aspecto que `SessionStatus`
- [X] T047 [P] [US3] `panel/components/profiles/ProfilesSettings.tsx` como sección `profiles` de `SETTINGS_SECTIONS` (tras `shortcuts`): lista del sitio actual (otros sitios en `<details>` como `RuleList`), nombre con `AutoSaveField` (errores con `issueAt`), "Crear perfil", Duplicar (comando `duplicateProfile`, pide el nombre con el mismo campo de crear) y Eliminar (`IconButton`), `Toast` con "Deshacer" 10 s al eliminar (`restoreProfile`), `EmptyState` "Sin perfiles"; misma estética que `CorsSettings`
- [X] T048 [P] [US3] Editor de reglas `panel/components/rules/RuleEditor.tsx` y `rule-form.ts`: grupo "Perfiles" con una casilla por perfil del sitio (patrón del grupo "Tipos de recurso") y enlace "Gestionar perfiles…"; el borrador lleva `profileIds`; `panel/components/profiles/ProfilePicker.tsx` reutilizable
- [X] T049 [US3] Lista de reglas `panel/components/rules/RuleList.tsx`: etiquetas de perfil junto al nombre (mismo estilo que "importado"), asignación rápida desde la fila (`ProfilePicker` en un `Menu`, `setRuleProfiles`), y con un perfil activo las reglas que no actúan en texto secundario con "No actúa con <perfil>" e icono (sin depender del color); contador de la barra con `rulesThatApply`; al activar una regla importada con valores redactados, el interruptor vuelve a apagado y muestra `rule_error_redacted_value` traducido con un enlace "Editar" que abre el editor en el primer campo redactado (FR-028); con un perfil activo sin reglas, la lista muestra un `EmptyState` "Este perfil no tiene reglas" que indica usar "Asignar perfiles" en cada regla (la lista no tiene selección múltiple de reglas)
- [X] T050 [US3] Aviso en la franja (`panel/shell/strip.ts` e `IndicatorStrip.tsx`) para `notice_profile_deleted_active` con causa, solución y cerrar; `tests/unit/strip.test.ts`
- [X] T051 [US3] E2E `e2e/profiles.spec.ts`: quickstart 10–13 (crear perfiles, asignar desde editor y lista, activar por menú y por `Alt+Shift+O`, solo actúan sus reglas y el contador lo refleja, dos pestañas del mismo sitio independientes, cerrar y reabrir DevTools restaura el último perfil del sitio, navegar a otro sitio y volver, eliminar el perfil activo ⇒ aviso y "Todas las reglas", deshacer recupera el perfil y no la selección, perfil vacío activable, "Pausar Nahual" manda, una relajación CORS activa no cambia al cambiar de perfil (FR-025)); SC-006 (1 clic tras abrir el selector)

**Checkpoint**: quickstart 10–13 demostrables; las E2E de 002–006 siguen en verde (con "Todas
las reglas" nada cambia).

---

## Phase 6: User Story 4 - Configuración portable (Priority: P2)

**Goal**: exportar e importar reglas, hooks, perfiles y orígenes de producción como JSON
versionado, con validación total, vista previa, todo o nada, desactivado por defecto y deshacer.

**Independent Test**: quickstart 14–16: exportar con una relajación CORS activa, borrar todo,
importar y revisar la vista previa; 20 archivos inválidos sin ningún cambio; deshacer.

### Dominio (TDD)

- [X] T052 [P] [US4] Prueba primero en `dtests/portable/schema.test.ts`: `PortableConfigV1Schema` `strictObject` (contracts/portable-config.md): `nahual: "config"`, `version: 1`, `app`, `exportedAt`, `redacted { count, rules[] }`, `productionOrigins` (cada entrada con `ProductionOriginEntrySchema` de 003; una inválida rechaza el archivo, FR-026a), `sites[] { site, profiles[] { id, name }, rules[] }` con `PortableRule` = `RuleDraft` + `id` + `order` + `profileIds` y acción `hook` solo `kind` + `source`; claves extra ⇒ error con ruta; `__proto__` como clave ⇒ rechazado; `ImportPayloadSchema`; luego implementar `domain/portable/schema.ts`
- [X] T053 [P] [US4] Prueba primero en `dtests/portable/migrate.test.ts`: `migrate(raw)` encadena `MIGRATIONS` desde `raw.version` hasta la actual; versión mayor ⇒ `config_error_newer_version`; versión 0 o no entera ⇒ `config_error_invalid`; con `MIGRATIONS` vacío la v1 pasa intacta; una migración simulada 1⇒2 en la prueba se aplica y reporta `migratedFrom`; luego implementar `domain/portable/migrate.ts`
- [X] T054 [P] [US4] Prueba primero en `dtests/portable/export.test.ts`: `exportConfig(rules, profiles, settings, { appVersion, includeSensitive, now })` agrupa por sitio, excluye `permissions`, `check` e `imported` de los hooks, excluye todo lo que no viaja, redacta valores de condiciones `header`/`query` sensibles, headers sensibles y campos JSON sensibles del body de un mock con `"<nahual:redacted>"` y los lista en `redacted.rules`; con `includeSensitive` no redacta; claves en el orden del contrato; `exportSummary(config)` para la UI; luego implementar `domain/portable/export.ts`
- [X] T055 [US4] Prueba primero en `dtests/portable/parse.test.ts`: `parseConfig(text, { existing: { rules, profiles, productionOrigins } })` en el orden del contrato (tamaño > 10 MB ⇒ `config_error_too_large`; no JSON; `nahual` distinto; migración; schema; coherencia de `profileIds`, nombres únicos, `order` únicos, JSONPath; límites sumados `rulesMax`, `hookTotalBytesMax`, `profilesPerSiteMax`, `productionOriginsMax` ⇒ `config_error_limit` con `[clave, actual, resultante, límite]`); 20 fixtures inválidos/truncados en `dtests/fixtures-config-invalid/` (entre ellos uno con un origen de producción inválido ⇒ `config_error_invalid` con ruta `productionOrigins[i]`) ⇒ 20 claves correctas (SC-007); `buildPreview` con `renamedProfiles`, orígenes `new`/`existing`, `redactedRules`; luego implementar `domain/portable/parse.ts`
- [X] T056 [US4] Prueba primero en `dtests/portable/roundtrip.test.ts`: exportar ⇒ `parseConfig` en vacío ⇒ aplicar la lógica pura de `applyImport(existing, config)` (ids nuevos con correspondencia de `profileIds`, "(importado)" en perfiles repetidos, reglas al final del orden, `enabled: false`, `importedFrom`, hooks sin permisos, orígenes añadidos sin quitar) reproduce reglas, hooks, perfiles y orígenes (SC-008); luego implementar `domain/portable/apply.ts`

### Service worker y panel

- [X] T057 [US4] Prueba primero en `tests/integration/import-config.test.ts`: `createImportService` (`bg/import-service.ts`): `importConfig` revalida con `parseConfig` y límites, aplica `applyImport`, guarda `check` de `hookChecks` solo si `hash === hashSource(source)`, escribe `nahual.rules.v1`, `nahual.profiles.v1` y `nahual.settings.v1` en **una** llamada `storage.set`, reemplaza el estado en memoria solo al resolver, error de cuota ⇒ nada cambia (`storage_quota`), guarda instantánea 10 s, `undoImport` restaura en una llamada (orígenes añadidos quitados, existentes conservados) y `undo_expired` después; `setRuleEnabled` responde `rule_error_redacted_value` para reglas con `"<nahual:redacted>"`; `notice_import_undone` a otras pestañas; luego implementar y cablear en `bg/app.ts`, `bg/rule-store.ts` (`replaceAll` atómico), `bg/profile-store.ts`, `bg/settings-store.ts` (`addProductionOrigins`)
- [X] T058 [US4] `panel/components/data/DataSettings.tsx` como sección `data` ("Importar y exportar") de `SETTINGS_SECTIONS`: resumen de `exportSummary`, nota "Las relajaciones CORS nunca se exportan" cuando hay una activa, `Switch` "Incluir valores sensibles" ⇒ `ConfirmDialog`, "Descargar" (`downloadText` con `nahual-config-<fecha>.json`); "Importar configuración" e "Importar de Requestly" con `<input type="file">` oculto, `FileReader`, errores en línea con `issueAt` (causa + solución por `errorKey`)
- [X] T059 [US4] `panel/components/data/ImportPreviewDialog.tsx` (patrón de `ImportHookDialog`): resumen por sitio, orígenes "nuevo"/"ya presente", reglas con tipo y perfil, perfiles renombrados, reglas con valores redactados avisadas, cada hook en CodeMirror solo lectura con los diagnósticos del Worker de tipos de 006 (`panel/hooks/types-client.ts` calcula `check` por hook antes de habilitar "Importar"), pie "Importar (desactivado)" / "Cancelar"; tras `ok`, `Toast` "Importadas N reglas y M perfiles" con "Deshacer" 10 s (`undoImport`); con `notice_import_undone` o `notice_profile_deleted_active` la franja avisa
- [X] T060 [US4] E2E `e2e/import-config.spec.ts`: quickstart 14–16 (exportar con relajación activa: el JSON no contiene `Authorization` ni la relajación; borrar todo; importar: vista previa, todo desactivado e "importado", hooks sin permisos, orígenes añadidos; deshacer entero; 20 inválidos ⇒ configuración intacta; interrupción simulada con el gancho de pruebas del SW ⇒ intacta); regla importada con valor redactado no se puede activar hasta completarlo
- [X] T061 [US4] Ampliar `e2e/storage-privacy.spec.ts`: tras exportar un request con `Authorization` y `?token=` (con y sin incluir valores sensibles), exportar e importar una configuración, ningún valor sensible en `storage.local`, `storage.session`, `localStorage`, `sessionStorage` ni IndexedDB; `nahual.profiles.v1` solo ids, sitios, nombres y fechas; `nahual.ui.v1` solo `UiPrefs`

**Checkpoint**: quickstart 14–16 demostrables; SC-007 y SC-008 en verde.

---

## Phase 7: User Story 5 - Traer reglas de Requestly (Priority: P3)

**Goal**: importar un export de Requestly con vista previa, conversión de redirect, headers y
response estática, grupos a perfiles y lista de no soportadas con motivo.

**Independent Test**: quickstart 17 con el fixture de T004: conversión, no soportadas con motivo,
y cada regla soportada activada se comporta como en Requestly contra el fixture.

- [X] T062 [P] [US5] Prueba primero en `dtests/requestly/schema.test.ts` y `dtests/requestly/source.test.ts`: schemas laxos (`looseObject`) de `RequestlyRule`, `RequestlyGroup`, `Pair`, `Source` (contracts/requestly-import.md); archivo que no es array, vacío o sin reglas ⇒ `requestly_error_format`; `sourceToPrefilter(source)` con la tabla completa `Url|host|path` × `Equals|Contains|Matches|Wildcard_Matches` (regex escapada, anclajes, compilable, ≤ 512 ⇒ si no `requestly_unsupported_regex_invalid|regex_too_long`), `filters.requestMethod` ⇒ `methods`, `filters.resourceType` ⇒ `resourceTypes` con la tabla, otro filtro ⇒ `requestly_unsupported_filter`; luego implementar `domain/requestly/schema.ts` y `domain/requestly/source.ts`
- [X] T063 [P] [US5] Prueba primero en `dtests/requestly/templates.test.ts`: `redirectHook(name, source, destination)` (Equals/Contains ⇒ asignación directa; Wildcard ⇒ regex con grupos `(.*?)`/`(.)` y `replace` con `$n`; Matches ⇒ regex tal cual) y `headersHook(name, source, stage, mods)` (`Add`/`Modify` fijan en minúsculas, `Remove` borra, `if (!ctx.response) return` en Response) generan código que `parseHookFile` acepta y que `typescript.transpileModule` compila sin diagnósticos sintácticos (en la prueba de dominio; la validación de tipos completa con `HookContext` queda en T066, E2E con el Worker de 006), con comentario inicial que cita la regla y ≤ 20 líneas de plantilla más una por modificación de header (FR-038); inyección: `destination` o `header` con `*/`, `"`, `${}`, `\n` y `</script>` quedan como literales de cadena (`JSON.stringify`); luego implementar `domain/requestly/templates.ts`
- [X] T064 [US5] Prueba primero en `dtests/requestly/convert.test.ts` con `dtests/fixtures-requestly.json`: `convertRequestly(records, site)` ⇒ `PortableConfigV1` + `unsupported[]`: `Response` estática ⇒ Mock Response (status, body, `content-type` JSON/texto), `serveWithoutRequest` ⇒ Mock Request, `Response` `code` ⇒ `requestly_unsupported_response_code`, `Redirect` `url` ⇒ hook Request, `map_local` ⇒ `requestly_unsupported_redirect_destination`, `Headers` Request/Response/ambas (dos reglas "(request)"/"(response)"), formato plano ⇒ Request, varias parejas ⇒ "(1)", "(2)" (si cualquier pareja no es convertible, la regla entera va a `unsupported` con el motivo de esa pareja: FR-036), grupos ⇒ perfiles (vacíos no se crean), `Cancel|Replace|UserAgent|QueryParam|Script|Request|Delay` ⇒ `requestly_unsupported_rule_type`, parejas vacías ⇒ `requestly_unsupported_empty_pairs`; todo con `enabled: false`; luego implementar `domain/requestly/convert.ts` y exportar desde `domain/index.ts`
- [X] T065 [US5] Panel: "Importar de Requestly" en `DataSettings.tsx` ⇒ `convertRequestly` con el sitio actual ⇒ `parseConfig` con límites ⇒ `ImportPreviewDialog` con la sección "No soportadas (n)" (nombre y motivo traducido) ⇒ `importConfig` con `source: "requestly"`; `importedFrom: "requestly"` se muestra en `RuleList` como "importado de Requestly"
- [X] T066 [US5] E2E `e2e/import-requestly.spec.ts`: quickstart 17 (vista previa con conversiones y no soportadas; importar; activar la `Response` estática ⇒ la página recibe el 503; activar el `Headers` ⇒ el header llega al eco de la API; activar el `Redirect` ⇒ pide el permiso de destino, con él el request va al tercer origen con `$1` resuelto; grupos ⇒ perfiles activables); export vacío y de formato desconocido rechazados (SC-009)

**Checkpoint**: quickstart 17 demostrable.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: accesibilidad, regresión visual, rendimiento, documentación de ayuda y revisión de
cierre.

- [X] T067 [P] E2E de accesibilidad `e2e/export-a11y.spec.ts` y `e2e/profiles-a11y.spec.ts`: `expectNoSeriousViolations` y `expectNoHorizontalScroll` en el diálogo de exportación (cada formato, con confirmación abierta), el menú de perfil, Ajustes ⇒ Perfiles e Importar y exportar, la vista previa de importación (con no soportadas) y la lista de reglas con perfil activo, en claro y oscuro, a 320, 800 y 1280 px (SC-012); recorridos solo con teclado (abrir con atajo, cambiar formato con flechas, copiar con Enter, salir del editor con Esc + Tab, elegir perfil con flechas)
- [X] T068 [P] Capturas de regresión visual en `e2e/visual/panel.visual.spec.ts`: diálogo de exportación (cURL y MSW), barra con perfil activo, menú de perfil, Perfiles, Importar y exportar, vista previa de importación, en ambos temas y los tres anchos; comparación lado a lado con el diálogo de importar hook y el estado de sesión documentada en `specs/007-export-publicacion/research.md` sección "Resultados" (desvíos, si los hay, con motivo)
- [X] T069 [P] Rendimiento: `tests/dist/bundles.test.ts` comprueba que la carga inicial no incluye `domain/export/*` ni `portable/*` ni `requestly/*` y crece ≤ 10 % sobre 006; `e2e/export-perf.spec.ts` (`@perf`): generar cada formato de un body de 1 MB < 300 ms, lote de 50 < 3 s; `e2e/hooks-perf.spec.ts` o `panel-performance.spec.ts` ampliada: p95 del tráfico con un perfil activo no supera el de 006
- [ ] T070 [P] Ayuda y Ajustes ⇒ Atajos (`panel/components/Onboarding.tsx`, `settings/ShortcutsList.tsx`): párrafos de exportar, perfiles e importar/exportar en `es`/`en`; comprobar que ambas locales tienen las mismas claves y que no queda texto hardcodeado (`grep` en `panel/`)
- [ ] T071 Revisión de seguridad del diff contra el modelo de amenazas de plan.md (fuga en las 6 salidas y en la configuración, importación maliciosa, inyección en plantillas, relajación del navegador de destino, perfil invisible, paquete distinto del código, dependencias): registrar en `specs/007-export-publicacion/plan.md` sección "Revisión de implementación" con el resultado de cada punto, tamaños reales de los chunks y cobertura de `packages/domain`
- [ ] T072 Demo de cierre (SC-013, clarificación): con al menos 1 dev que usa DevTools a diario (puede ser el usuario) y Chrome estable, lado a lado con las vistas de 004–006 en claro y oscuro; sin explicación previa, cronometrar encontrar "Exportar como…" y el selector de perfil (< 10 s cada uno); registrar tiempos, diferencias visuales y desvíos en `research.md` "Resultados"; actualizar `docs/store/assets/` con el selector de perfil
- [ ] T073 Estabilidad: ejecutar `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm verify:dist && pnpm --filter @nahual/export-smoke test && pnpm e2e && pnpm --filter @nahual/extension e2e:visual` tres veces seguidas en verde; registrar en `research.md` "Resultados"; PR de implementación con la checklist de `docs/store/release-checklist.md` marcada hasta donde no depende de la cuenta de la tienda

---

## Dependencies & Execution Order

- **Phase 1 → Phase 2 → historias.** T005–T014 son prerrequisito de todas las historias (T005
  de US1 y US4; T006–T009 de US3–US5; T010–T014 de la UI).
- **US1 (T015–T030)**: dominio T015–T022 en paralelo salvo T022 (depende de T016–T021); T023
  depende de T022 y T003; panel T024 → T025 → T026/T027/T028 (paralelo) → T029/T030.
- **US2 (T031–T040)**: independiente de US1, US3–US5; T031 → T032; T033 → T034; T034 depende de
  T023 (`export-smoke` en el release) y de T032; T035–T037 en paralelo; T038 depende de T032 (y
  se repite tras US3 para el selector); T039 tras T034; T040 al final de la fase.
- **US3 (T041–T051)**: T041/T042 en paralelo → T043 → T044 → T045 → T046 → T047/T048 (paralelo) →
  T049 → T050 → T051.
- **US4 (T052–T061)**: depende de US3 (perfiles) y de T005; dominio T052–T054 en paralelo → T055
  → T056 → T057 → T058 → T059 → T060 → T061.
- **US5 (T062–T066)**: depende de US4 (misma vista previa y comando); T062/T063 en paralelo →
  T064 → T065 → T066.
- **Phase 8**: tras todas las historias; T067–T070 en paralelo; T071 → T072 → T073.

## Parallel Example: US1 dominio

```text
T015 source.ts        T016 curl.ts      T017 fetch.ts     T018 zod.ts
T019 msw.ts           T020 vitest.ts    T021 postman.ts
          └──────────────── T022 index.ts ──────────────── T023 export-smoke
```

## Parallel Example: US2 con US1 en curso

```text
T031 iconos ─ T032 manifest ─┐
T033 build-sbom.mjs ─────────┼─ T034 release.yml ─ T039 README ─ T040 ensayo v1.0.0-rc.1
T035 actionlint  T036 listing  T037 política/permisos  T038 capturas
```

## Implementation Strategy

1. **MVP = Phase 1 + Phase 2 + US1**: exportar a los seis formatos con redacción, vista previa,
   lote y ejecución real en `smoke/`. Es el diferenciador y se demuestra solo.
2. **US2 en paralelo** desde que US1 tenga T023: el release se ensaya con `v1.0.0-rc.1` sin
   esperar al resto; el envío real a la tienda (`v1.0.0`) espera a que todas las historias
   estén en `main`.
3. **US3 → US4 → US5** en ese orden (dependencias de datos y de vista previa).
4. **Phase 8** cierra con a11y, visual, rendimiento, seguridad, demo y estabilidad; el PR de
   implementación lleva la checklist de publicación.
5. La errata `006-export-publicacion` de `.specify/memory/constitution.md` se corrige en un PR
   aparte que modifica solo ese archivo (PATCH 1.0.1), fuera de esta feature, como exige su
   gobernanza.
