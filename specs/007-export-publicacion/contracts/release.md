# Contrato: release y publicación (007)

Research R16 y R17. FR-039 a FR-046; constitución VII.

## `.github/workflows/release.yml`

Disparo: `push` de tags `v*`. Todas las acciones fijadas por SHA de commit (con el tag en
comentario). `permissions` mínimos por job.

### Job `build` (`permissions: contents: write, id-token: write, attestations: write`)

1. `actions/checkout`, `actions/setup-node` con `.nvmrc`, `corepack enable`,
   `pnpm install --frozen-lockfile`.
2. Comprobar que `apps/extension/package.json` `version` == tag sin `v` ni sufijo de ensayo
   (`v1.0.0-rc.1` ⇒ `1.0.0`: el manifest solo admite números); si no, fallar.
3. `pnpm lint && pnpm typecheck && pnpm test && pnpm audit --prod --audit-level high &&
   node scripts/check-licenses.mjs && pnpm verify:dist && pnpm --filter @nahual/export-smoke test`.
4. Build reproducible: dos `pnpm build --force` + `scripts/build-zip.mjs`, mismo SHA-256 o fallo
   (igual que CI; `SOURCE_DATE_EPOCH` fijo). Al fallar, el paso lista en el resumen del job los
   archivos de `dist/` cuyo SHA-256 difiere entre los dos builds.
5. `node scripts/build-sbom.mjs` ⇒ `apps/extension/nahual.sbom.cdx.json` (CycloneDX 1.6, solo
   producción, determinista; [data-model](../data-model.md)).
6. `actions/attest-build-provenance@v4` con `subject-path: apps/extension/nahual.zip`;
   `actions/attest-sbom` con el SBOM, fijada por SHA de su última mayor estable comprobada al
   implementar; respaldo: `actions/attest` con `predicate-type` `https://cyclonedx.org/bom`.
7. `gh release create "$TAG" nahual.zip nahual.sbom.cdx.json --notes` con el SHA-256 del zip,
   el comando de verificación y el enlace a `docs/store/`; `--prerelease` si el tag lleva `-`.

### Job `publish` (`needs: build`, `environment: chrome-web-store`, `permissions: contents: read`; se omite con tags de ensayo `v*-*`)

El environment tiene **revisores obligatorios** (el mantenedor) y es el único con los secretos
`CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, `CWS_REFRESH_TOKEN`, `CWS_PUBLISHER_ID`, `CWS_EXTENSION_ID`.

1. Descargar `nahual.zip` del release; comprobar el SHA-256 contra el del job `build`;
   `gh attestation verify nahual.zip --repo pav0n/nahual`.
2. Token: `POST https://oauth2.googleapis.com/token` con `grant_type=refresh_token`.
3. Subir: `POST https://chromewebstore.googleapis.com/upload/v2/publishers/$PUBLISHER/items/$ITEM:upload`
   con `Authorization: Bearer` y el zip; si `uploadState` es `IN_PROGRESS`, consultar
   `GET …/v2/publishers/$PUBLISHER/items/$ITEM:fetchStatus` (`lastAsyncUploadState`) hasta
   5 minutos; publicar solo con `SUCCEEDED`.
4. Publicar: `POST https://chromewebstore.googleapis.com/v2/publishers/$PUBLISHER/items/$ITEM:publish`
   (visibilidad pública, la del elemento; clarificación).
5. Registrar en el resumen del job la versión enviada y el estado (`PENDING_REVIEW`).

Nunca se imprime un token; `curl` con `--fail-with-body -sS` y salida filtrada.

### Primer envío (manual, una vez)

Crear el elemento en el Developer Dashboard con el zip de `v1.0.0` descargado del release (SHA
verificado), rellenar listing (`docs/store/listing.*.md`), privacidad (`data-practices.md`,
URL de `privacy-policy.md`), justificación de permisos (`permissions.md`), capturas y video.
Desde entonces el job `publish` actualiza versiones (la API no crea elementos ni rellena el
listing).

## `scripts/build-sbom.mjs`

- Entrada: `pnpm list --prod --json --depth Infinity --filter @nahual/extension` y
  `pnpm-lock.yaml` (integridad `sha512` por paquete).
- Salida: CycloneDX 1.6 JSON, componentes únicos por `purl`, ordenados; licencias de
  `check-licenses.mjs`; sin `timestamp`.
- Prueba: `tests/dist/sbom.test.ts` valida la forma (schema Zod del subconjunto) y que cada
  dependencia de producción del lockfile aparece una vez.

## `docs/store/`

| Archivo | Contenido |
|---|---|
| `listing.es.md`, `listing.en.md` | Nombre, resumen (≤ 132), descripción: propósito único, qué hace, cada permiso y por qué, la barra amarilla (por qué aparece, que es la garantía de que Nahual solo actúa con el panel abierto, cómo soltarlo), qué no hace (sin cuenta, sin red propia, sin telemetría) |
| `permissions.md` | Justificación por permiso: `debugger` (CDP: capturar, pausar, modificar; solo con el panel abierto), `storage` (reglas, perfiles, ajustes locales), `optional_host_permissions` (repeater en contexto limpio, pedido por origen al usar), `sandbox` (hooks del usuario aislados); propósito único |
| `privacy-policy.md` | es/en: no se recoge ningún dato; todo vive en el navegador; sin servidores propios; sin telemetría; contacto; fecha |
| `data-practices.md` | Respuestas del formulario de prácticas de datos: ninguna categoría recogida; certificaciones de uso limitado |
| `assets/README.md` | Lista de capturas 1280×800 (claro/oscuro) y guion del video; cómo regenerarlas (`pnpm --filter @nahual/extension e2e:store`) |
| `release-checklist.md` | La checklist de la entrada 07 corregida (sin permisos que no existen) |

`README.md` gana "Instalar un release sin empaquetar" (descargar `nahual.zip` del release,
verificar SHA-256 y atestación, descomprimir, cargar) y "Verificar la reproducibilidad".

## Pruebas

- `tests/dist/sbom.test.ts`; `tests/dist/manifest.test.ts` (1.0.0, iconos).
- El workflow se valida con `actionlint` en CI (binario descargado por SHA en el job, sin
  dependencia npm) y con un tag de prueba `v1.0.0-rc.1` en un fork o rama antes del release real
  (prerelease; el job `publish` no corre).
