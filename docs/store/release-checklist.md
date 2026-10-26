# Checklist de publicación en la Chrome Web Store

Versión corregida de la checklist de `docs/speckit-inputs/07-export-publicacion.md`: sin
`unlimitedStorage`, `alarms` ni `declarativeNetRequestWithHostAccess`, que Nahual no usa
(research R15 de 007). Se marca en el PR de cada release.

## Una vez (primer envío)

- [ ] Repositorio público en GitHub con atestaciones disponibles.
- [ ] Cuenta de desarrollador de la Chrome Web Store con verificación en dos pasos y la cuota de
      registro pagada.
- [ ] Proyecto de Google Cloud con la Chrome Web Store API habilitada, pantalla de consentimiento
      OAuth y cliente OAuth; `refresh_token` obtenido con la cuenta dueña del elemento.
- [ ] Environment `chrome-web-store` en GitHub con revisores obligatorios, despliegue limitado a
      tags `v*` y los secretos
      `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, `CWS_REFRESH_TOKEN`, `CWS_PUBLISHER_ID`,
      `CWS_EXTENSION_ID` (solo en ese environment).
- [ ] Cuenta de la tienda: correo de contacto verificado y declaración de comerciante (no
      comerciante para un proyecto personal gratuito).
- [ ] Elemento creado a mano con el `nahual.zip` de `v1.0.0` descargado del release, con su
      SHA-256 y su atestación verificados. En `v1.0.0` el job `publish` se **rechaza**: el elemento
      aún no existe en la API; los releases siguientes sí se aprueban.
- [ ] Secretos `CWS_EXTENSION_ID` (el id que asigna la tienda al crear el elemento) y
      `CWS_PUBLISHER_ID` (Developer Dashboard ⇒ Publisher ⇒ Settings) dados de alta después.
- [ ] Listing (es/en) de [`listing.es.md`](listing.es.md) y [`listing.en.md`](listing.en.md).
- [ ] Pestaña de privacidad: propósito único y justificación de cada permiso de
      [`permissions.md`](permissions.md); "Remote code: No"; prácticas de datos de
      [`data-practices.md`](data-practices.md); URL de [`privacy-policy.md`](privacy-policy.md).
- [ ] Capturas (hasta 5, 1280×800) de [`assets/`](assets/README.md), incluida la barra amarilla;
      icono de 128 px (`apps/extension/public/icons/icon-128.png`); imagen promocional pequeña
      de 440×280 (obligatoria; pendiente de generar).
- [ ] `demo.webm` subido a YouTube (público o no listado) y su enlace en el campo de video.
- [ ] Visibilidad: **Pública** (clarificación de 007).

## Cada release

- [ ] `apps/extension/package.json` con la versión nueva, mayor que la publicada (la tienda
      rechaza la misma versión); tag `vX.Y.Z` en `main`. Un tag `vX.Y.Z-rc.N` es un ensayo:
      prerelease en GitHub y sin job `publish`.
- [ ] Job `build` en verde: lint, typecheck, pruebas, auditoría, licencias, `verify:dist`, build
      reproducible, SBOM y atestaciones.
- [ ] Release de GitHub con `nahual.zip`, `nahual.sbom.cdx.json` y el SHA-256 en las notas.
- [ ] `gh attestation verify nahual.zip --repo <owner>/nahual` pasa con el archivo descargado.
- [ ] Sin código remoto ni `eval` fuera del sandbox (`tests/dist/no-network.test.ts`).
- [ ] Justificación de permisos al día si cambió el manifest.
- [ ] Aprobación del job `publish` por un mantenedor; estado de la tienda registrado en el
      resumen del job.
