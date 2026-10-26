# Implementation Plan: Exportar al código, perfiles y publicación

**Branch**: `007-export-publicacion` | **Date**: 2026-10-25 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/007-export-publicacion/spec.md`, con el requisito
transversal del usuario: toda la interfaz nueva debe integrarse a la perfección con el panel
actual (004–006).

## Summary

Seis **exportadores puros** (cURL, fetch, test Vitest de contrato, handler MSW, schema Zod
inferido de una o varias respuestas, colección de Postman) en `packages/domain/src/export/`,
alimentados por un `ExportSource` que el panel construye con los bodies que ya pide `getBody`
(R2) y redactados por la **misma implementación** que usan el diff de 005 y la consola de 006
(R3). **Perfiles** por sitio con pertenencia en la regla (`profileIds`), perfil activo por
pestaña en memoria del SW y último perfil recordado por sitio (R13). **Configuración portable**
JSON versionada con migraciones, importación todo o nada en **una** escritura de storage y
deshacer de 10 s (R9, R10); el **conversor de Requestly** produce la misma estructura (R11).
**Publicación**: workflow de release con build reproducible, SBOM CycloneDX propio, atestación
de procedencia y subida a la Chrome Web Store con `curl` desde un environment con aprobación
manual (R16); listing, política de privacidad y materiales en `docs/store/` (R17). Toda la
interfaz entra por los puntos de extensión que 004 reservó y reutiliza componentes existentes
(R14, [contracts/panel-ui.md](./contracts/panel-ui.md)). Protocolo v6. Sin permisos nuevos;
versión 1.0.0 e iconos (R15).

## Technical Context

**Language/Version**: TypeScript 5.9 strict; Node.js 24; pnpm 10 (como 006).

**Primary Dependencies**: **ninguna nueva en la extensión ni en los paquetes**. El proyecto de
prueba `tooling/export-smoke` (workspace privado, fuera del bundle y del SBOM) añade como
devDependencies exactas **msw 3.0.0** y reutiliza vitest 5.0.3 y zod 4.6.6 (R1, R12).
Justificación en [Dependencias](#dependencias-justificación).

**Storage**: `nahual.rules.v1` amplía cada regla con `profileIds` e `imported` (misma versión);
clave nueva `nahual.profiles.v1`; `nahual.settings.v1` recibe orígenes de producción
importados; `nahual.ui.v1` gana `exportFormat` ([contracts/storage.md](./contracts/storage.md)).

**Testing**:
- Vitest con TDD en `packages/domain`: cada exportador (snapshots y propiedades de redacción y
  determinismo), inferencia Zod (fusión de muestras, profundidad), redacción compartida,
  `parseConfig`/migraciones/límites, conversor de Requestly (mapeo, no soportadas, inyección),
  `selectChain` con perfil activo.
- `packages/protocol`: schemas v6.
- Integración del SW con el almacén simulado: perfiles (dos pestañas, navegación, reinicio),
  importación atómica (cuota ⇒ nada), deshacer dentro/fuera de 10 s, orígenes añadidos.
- `tooling/export-smoke`: ejecución real de Vitest, MSW y Zod exportados contra el servidor del
  fixture (SC-001..003), en CI.
- Playwright: E2E por historia (`export.spec.ts`, `export-batch.spec.ts`, `profiles.spec.ts`,
  `import-config.spec.ts`, `import-requestly.spec.ts`), `storage-privacy` ampliada, axe de cada
  pieza nueva en claro/oscuro a 320 px, recorridos solo con teclado, capturas visuales,
  `e2e/store/screenshots.spec.ts` para el listing.
- `tests/dist`: manifest 1.0.0 con iconos y permisos intactos, SBOM, sin red propia.
- CI: `actionlint` sobre los workflows.

**Target Platform**: Chrome estable ≥ 120, Linux/macOS/Windows; Chrome Web Store.

**Project Type**: Extensión MV3 en monorepo; **sin paquete nuevo** (un workspace de pruebas
`tooling/export-smoke`); un workflow nuevo de GitHub Actions.

**Performance Goals**:
- Generar cualquier formato de un request con body ≤ 1 MB en < 300 ms en el hilo del panel; un
  lote de 50 en < 3 s incluida la carga de bodies (R2).
- El camino del tráfico no cambia sin perfil activo; con perfil activo, el filtro añade una
  comprobación `includes` por regla (sin efecto medible en el p95 de 002, se verifica con la
  prueba `@perf` existente).
- Carga inicial del panel sin el editor ni los exportadores (chunks cargados al abrir el diálogo);
  ≤ 10 % sobre 006 (`tests/dist/bundles.test.ts`).

**Constraints**:
- Los de 001–006. Sin permisos nuevos. `eval` solo en el sandbox.
- Redacción por defecto en toda salida; inclusión solo con confirmación y sin recordar.
- Importación todo o nada; todo importado desactivado.
- 320 px, WCAG 2.2 AA, `es`/`en`; interfaz indistinguible de 004–006 (requisito del usuario).
- Release solo desde CI; credenciales solo en el environment con aprobación.

**Scale/Scope**:
- Dominio: ~12 módulos nuevos (6 exportadores, `source`, `zod`, `portable/{schema,migrate,
  export,parse}`, `requestly/{schema,convert,templates}`, `schemas/profile`) y cambios en
  `sensitive.ts`, `diff/redact.ts`, `schemas/rule.ts`, `limits.ts`, `evaluate.ts`.
- SW: `profile-store.ts`, `active-profiles.ts`, `import-service.ts`, cambios en `rule-store`,
  `rule-engine`, `settings-store`, `app.ts`.
- Panel: ~12 componentes, 2 secciones de Ajustes, 2 atajos, ~140 claves i18n, 6 specs E2E.
- Release: `release.yml`, `build-sbom.mjs`, `docs/store/` (6 archivos), README, iconos.

Sin `NEEDS CLARIFICATION`: todo está resuelto en [research.md](./research.md) (R1–R18). Los
prerrequisitos externos de la publicación (repo en GitHub, cuenta de desarrollador con 2FA, API
de la tienda habilitada) no dependen del código y se listan en R16.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio | Verificación | Estado |
|---|---|---|
| I. Seguridad por defecto | **Redacción:** una sola implementación (`sensitive.ts`) para diff, consola, exportadores y configuración portable; marcadores sin fragmentos del valor; incluir valores sensibles exige confirmación por exportación y no se recuerda (FR-010, FR-011, SC-004). **Importación:** archivo validado entero antes de aplicar (tamaño, JSON, versión, `strictObject`, coherencia, límites sumados); todo entra desactivado, marcado, hooks sin permisos y con vista previa del código completo como texto; hooks de Requestly generados desde plantillas con `JSON.stringify` (sin inyección); límite de 10 MB. **Mensajería:** comandos y eventos v6 validados con Zod en el receptor; el SW repite la validación del panel antes de escribir. **Local-first:** exportar, importar y perfiles funcionan sin red; sin telemetría. **Mínimo privilegio:** ningún permiso nuevo (copiar con `navigator.clipboard` desde un gesto, descargar con `Blob`, importar con `<input type="file">`). **Cadena de release:** acciones fijadas por SHA, secretos solo en el environment con aprobación, atestación verificada antes de publicar | ✅ |
| II. Fallar de forma segura | Un perfil activo que deja de existir ⇒ "Todas las reglas" con aviso; importación interrumpida o sin cuota ⇒ almacén intacto (una sola escritura); un body que no se puede cargar ⇒ el código se genera igual con un comentario; el test exportado falla con mensaje claro si el servidor no responde; el release falla antes de subir si cualquier comprobación falla | ✅ |
| III. Usabilidad | Mismos componentes y patrones del panel (R14): `Dialog`, `Tabs`, `Menu`, `Switch`, `Toast` con "Deshacer" 10 s (eliminar perfil, importar), `ConfirmDialog`, franja de indicadores; estados vacío/carga/error de cada pieza; atajos `Alt+Shift+E` y `Alt+Shift+O` en el registro único; teclado completo; temas de DevTools; 320 px; `es`/`en`; revisión visual lado a lado y demo con un dev (SC-013) | ✅ |
| IV. Test-first | TDD en todo el dominio nuevo; integración del SW antes de la UI; pruebas que intentan violar garantías: valores sensibles en las 6 salidas, archivo malicioso (claves extra, `__proto__`, hooks con código, 600 reglas, 11 MB), inyección en plantillas de Requestly, importación interrumpida, privacidad del almacenamiento; ejecución real de lo exportado (SC-001..003) | ✅ |
| V. Capas y dominio puro | Exportadores, inferencia, redacción, formato portable, migraciones, conversor y selección por perfil en `packages/domain` sin `chrome.*`; el panel habla con el SW por v6 y construye `ExportSource` desde el store; el SW escribe storage | ✅ |
| VI. Rendimiento | Sin perfil activo el camino del tráfico no cambia; exportación acotada (1 MB inline, 50 por lote) y fuera de la carga inicial; medida en `bundles.test.ts` y `@perf` | ✅ |
| VII. Cadena de suministro | Sin dependencias nuevas en el producto; MSW 3.0.0 solo en el workspace de pruebas (MIT); release solo desde CI con build reproducible, SBOM CycloneDX de producción, atestación de procedencia, acciones por SHA, environment con revisores | ✅ |
| VIII. Modelo de producto | Todo local y gratuito; bibliotecas de equipo y sincronización quedan para features de pago | ✅ |

**Modelo de amenazas** (cambios que introduce 007):

| Amenaza | Aplica | Mitigación en 007 |
|---|---|---|
| Fuga de credenciales | **Sí (principal)** | Redacción por defecto en los 6 formatos y en la configuración portable con la implementación compartida; marcadores sin fragmentos; inclusión por confirmación, por exportación, sin persistir; `storage-privacy` ampliada; test Vitest lee credenciales de variables de entorno |
| Hook o configuración importados con código malicioso | **Sí** | Validación completa antes de aplicar; desactivado, marcado, sin permisos; vista previa del código como texto; el hook sigue en el sandbox de 006; límites de tamaño y de cantidad sumados a lo existente; deshacer |
| **Nueva:** archivo de Requestly que inyecta código en un hook generado | **Sí** | Plantillas fijas con valores vía `JSON.stringify`; prueba con `*/`, comillas, `${}` y saltos de línea |
| **Nueva:** importación que relaja protecciones del navegador de destino | **Sí** | Solo se importan reglas, hooks, perfiles y orígenes de producción (que solo se añaden); tiempos, duraciones y adjuntar no viajan; relajaciones nunca |
| **Nueva:** perfil usado para activar reglas sin que el dev lo note | **Sí** | Perfil activo siempre visible en la barra con texto; cambio solo por acción del dev; "Pausar Nahual" manda |
| **Nueva:** paquete publicado distinto del código | **Sí** | Build reproducible verificado en el release; SBOM y atestación; el job de publicación verifica SHA y atestación antes de subir; primer envío manual con el zip del release verificado |
| Dependencia comprometida | **Sí** | Cero dependencias nuevas en el producto; acciones de GitHub por SHA; `audit` y licencias en el release |
| Abuso del permiso `debugger` (revisión de la tienda) | Sí | Justificación escrita, listing con la barra amarilla y cómo soltar, política de privacidad y prácticas de datos coherentes |
| XSS en el panel | Sí | Código exportado e importado solo como texto en CodeMirror; sin HTML |
| Página maliciosa manipula la extensión | No cambia | |

Resultado: **PASA**. Sin permisos nuevos ni paquete nuevo. Tabla de complejidad: un workspace
de pruebas (ver abajo).

### Permisos (justificación)

**Ningún permiso nuevo.** El manifest suma `icons` y sube la versión a 1.0.0
([contracts/manifest.md](./contracts/manifest.md)). Copiar, descargar e importar se hacen con
API web disponibles en una página de la extensión desde un gesto del usuario. La justificación
pública de los permisos existentes vive en `docs/store/permissions.md` (R17).

### Dependencias (justificación)

| Paquete | Versión | Licencia | Dónde | Por qué | Alternativas rechazadas |
|---|---|---|---|---|---|
| `msw` | 3.0.0 | MIT | Solo `tooling/export-smoke` (devDependency; no entra en la extensión ni en el SBOM del paquete) | Ejecutar de verdad los handlers exportados (SC-002) con la versión objetivo (R1) | Probar MSW dentro de `packages/domain` (mezcla terceros con el dominio); no ejecutar (incumple SC-002) |

Vitest 5.0.3 y Zod 4.6.6 ya están en el monorepo. El SBOM se genera con un script propio sin
dependencias (R16). `actionlint` se descarga como binario verificado por SHA en CI, no como
paquete npm.

## Project Structure

### Documentation (this feature)

```text
specs/007-export-publicacion/
├── plan.md              # Este archivo
├── research.md          # R1–R18
├── data-model.md        # ExportSource, formatos, Profile, configuración portable, Requestly, SBOM
├── quickstart.md        # Validación de punta a punta
├── contracts/
│   ├── exporters.md         # salida de cada formato
│   ├── portable-config.md   # JSON v1, validación, importación
│   ├── requestly-import.md  # mapeo y plantillas de hooks
│   ├── panel-protocol.md    # v6: perfiles, importConfig, undoImport
│   ├── panel-ui.md          # integración con 004–006
│   ├── storage.md           # claves y memoria
│   ├── manifest.md          # 1.0.0, iconos, sin permisos nuevos
│   └── release.md           # workflow, SBOM, tienda, docs/store
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
packages/domain/src/
├── sensitive.ts                      # + redactValue, redactUrlQuery, redactExportSource (R3)
├── diff/redact.ts                    # usa sensitive.ts (sin lógica propia de recorrido)
├── export/                           # NUEVO (TDD)
│   ├── source.ts                     # ExportSource, ExportBody, fromExchange, fromRepeater
│   ├── index.ts                      # exportAs, FORMATS, fileNameFor
│   ├── curl.ts · fetch.ts · vitest.ts · msw.ts · postman.ts
│   └── zod.ts                        # InferredType, merge, inferZodSchema (R6)
├── portable/                         # NUEVO (TDD)
│   ├── schema.ts                     # PortableConfigV1, PortableRule, ImportPayload
│   ├── migrate.ts                    # MIGRATIONS, migrate(raw)
│   ├── export.ts                     # exportConfig(rules, profiles, settings, options)
│   └── parse.ts                      # parseConfig, checkLimits, buildPreview
├── requestly/                        # NUEVO (TDD)
│   ├── schema.ts                     # schemas laxos del export de Requestly
│   ├── source.ts                     # source → prefiltro + condiciones
│   ├── templates.ts                  # hooks de redirect y headers (JSON.stringify)
│   └── convert.ts                    # convertRequestly
├── schemas/profile.ts                # NUEVO: Profile, ProfilesState
├── schemas/rule.ts                   # + profileIds (draft), imported
├── schemas/limits.ts                 # + límites de data-model.md
└── evaluate.ts                       # SelectContext.activeProfileId

packages/protocol/src/                # v6: saveProfile, deleteProfile, restoreProfile,
                                      # setActiveProfile, setRuleProfiles, importConfig, undoImport;
                                      # evento profiles; state.activeProfileId

apps/extension/
├── manifest.config.ts                # 1.0.0, icons
├── public/icons/                     # icon-16/32/48/128.png, panel-16.png
├── src/background/
│   ├── profile-store.ts              # NUEVO: nahual.profiles.v1, lastActive, deshacer
│   ├── active-profiles.ts            # NUEVO: perfil activo por pestaña (memoria)
│   ├── import-service.ts             # NUEVO: importConfig/undoImport, escritura única
│   ├── rule-store.ts                 # profileIds, imported, rule_error_redacted_value
│   ├── rule-engine.ts                # context.activeProfileId
│   ├── settings-store.ts             # addProductionOrigins
│   └── app.ts                        # cableado v6
├── src/panel/
│   ├── actions/request-actions.ts    # + export
│   ├── actions/batch-actions.ts      # exportMsw, exportZod, exportPostman
│   ├── shell/status-items.ts         # + profile
│   ├── settings/sections.ts          # + profiles, data
│   ├── shortcuts.ts                  # + exportRequest, openProfileMenu
│   ├── ui-prefs.ts                   # + exportFormat
│   ├── store/profiles.ts             # NUEVO slice
│   ├── export/                       # NUEVO: build-source.ts (getBody), run-export.ts
│   ├── components/common/clipboard.ts, download.ts   # extraídos de CorsReport y HookEditor
│   ├── components/export/ExportDialog.tsx, FormatTabs.tsx, ExportStatus.tsx
│   ├── components/profiles/ProfileStatus.tsx, ProfileMenu.tsx, ProfilesSettings.tsx, ProfilePicker.tsx
│   ├── components/data/DataSettings.tsx, ImportPreviewDialog.tsx
│   ├── components/rules/RuleEditor.tsx, RuleList.tsx   # perfiles, "No actúa con…"
│   ├── components/repeater/RepeaterTabs.tsx            # botón Exportar
│   └── _locales/{es,en}              # export_*, profile_*, config_*, requestly_*
├── tests/integration/profiles.test.ts, import-config.test.ts
├── tests/dist/manifest.test.ts, sbom.test.ts
└── e2e/export.spec.ts, export-batch.spec.ts, profiles.spec.ts, import-config.spec.ts,
    import-requestly.spec.ts, store/screenshots.spec.ts, fixtures/requestly-export.json

tooling/export-smoke/                 # NUEVO workspace privado: vitest 5, msw 3, zod 4
├── package.json
└── tests/exported.test.ts            # escribe y ejecuta lo exportado (SC-001..003)

scripts/build-sbom.mjs                # NUEVO: CycloneDX 1.6 desde pnpm list --prod
.github/workflows/release.yml         # NUEVO (contracts/release.md)
.github/workflows/ci.yml              # + export-smoke, actionlint
docs/brand/nahual.svg, nahual-mono.svg
docs/store/listing.es.md, listing.en.md, permissions.md, privacy-policy.md,
            data-practices.md, assets/README.md, release-checklist.md
README.md                             # instalar un release sin empaquetar; verificar
```

**Structure Decision**: sin paquete nuevo. Los exportadores y el formato portable son lógica de
dominio (constitución V los nombra) y no exponen un contrato público como el `.d.ts` de 006, así
que viven en `packages/domain` en tres carpetas (`export/`, `portable/`, `requestly/`). El
único workspace nuevo, `tooling/export-smoke`, existe para ejecutar lo exportado con MSW sin
meter MSW en el dominio ni en la extensión. El panel sigue el patrón de 004–006: listas de
extensión, slices del store, componentes por área.

## Diseño clave

- **Orden de trabajo**:
  1. Dominio con TDD: redacción compartida ⇒ `ExportSource` ⇒ exportadores (cURL, fetch, Zod,
     MSW, Vitest, Postman) ⇒ `export-smoke` en CI.
  2. Perfiles: schemas, `selectChain`, protocolo v6, SW (`profile-store`, `active-profiles`),
     integración.
  3. Panel US1: `ExportDialog`, acción, lote, repeater, atajo.
  4. Panel US3: `ProfileStatus`, menú, Ajustes ⇒ Perfiles, editor y lista de reglas.
  5. Formato portable y `import-service` (atómico, deshacer); Ajustes ⇒ Importar y exportar;
     vista previa.
  6. Conversor de Requestly y su fixture; misma vista previa.
  7. Publicación: iconos, 1.0.0, `build-sbom.mjs`, `release.yml`, `docs/store/`, README,
     capturas y video, tag `v1.0.0-rc.1` de prueba.
  8. a11y, capturas visuales, `storage-privacy`, `@perf`, revisión visual lado a lado y demo
     (SC-013).
- **Exportar, de punta a punta**: acción ⇒ `buildExportSource` pide bodies con `getBody` ⇒
  `redactExportSource` (salvo inclusión confirmada) ⇒ `exportAs(formato)` ⇒ CodeMirror solo
  lectura ⇒ "Copiar"/"Descargar" con el mismo `code`. Nada se guarda salvo `exportFormat`.
- **Importar, de punta a punta**: archivo ⇒ `parseConfig` (o `convertRequestly` ⇒ misma
  estructura) ⇒ `checkLimits` con lo existente ⇒ Worker de tipos de 006 calcula `check` por
  hook ⇒ `ImportPreviewDialog` ⇒ `importConfig` ⇒ el SW revalida, asigna ids, marca, escribe las
  tres claves en una llamada, guarda la instantánea 10 s ⇒ `Toast` con "Deshacer".
- **Perfil activo, de punta a punta**: `hello`/navegación ⇒ `lastActive[site]` ⇒ evento `state`
  ⇒ `ProfileStatus`; `setActiveProfile` ⇒ `rule-engine` filtra por `activeProfileId` en el
  siguiente `Fetch.requestPaused`.
- **Interfaz**: cada pieza nueva se compara con su vecina de 004–006 en claro y oscuro antes de
  darla por terminada; la demo de cierre con un dev registra tiempos y diferencias (SC-013).

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| Workspace `tooling/export-smoke` con `msw` como devDependency | SC-001..003 exigen ejecutar de verdad el test Vitest, los handlers MSW y el schema Zod exportados con las versiones objetivo | Probar MSW dentro de `packages/domain` mezcla una dependencia de terceros con el dominio y la haría entrar en su cobertura y auditoría; no ejecutarlo deja los criterios sin verificar |
