# Contrato: almacenamiento (007)

## `chrome.storage.local` (solo escribe el SW)

| Clave | Cambio | Contenido |
|---|---|---|
| `nahual.rules.v1` | ampliada, misma versión | cada regla puede llevar `profileIds: uuid[]` (default `[]`) e `imported: "config" \| "requestly"` |
| `nahual.profiles.v1` | **nueva** | `{ version: 1, profiles: Profile[], lastActive: Record<site, uuid> }` |
| `nahual.settings.v1` | sin cambios de forma | `productionOrigins` recibe orígenes importados (añadidos, nunca quitados) |

- Lectura de `nahual.profiles.v1` con schema; versión desconocida ⇒ se ignora con
  `notice_profiles_version`; `lastActive` descarta ids sin perfil.
- Importar y deshacer escriben las tres claves en una sola llamada `set` (research R10).
- Límites: `profilesPerSiteMax` 50, `profilesPerRuleMax` 20; el resto, los de 002/003/006.

## Memoria del SW

| Dato | Vida |
|---|---|
| Perfil activo por pestaña | hasta cerrar la pestaña; tras reiniciar el SW se recalcula desde `lastActive` |
| Instantánea de deshacer (importación o perfil eliminado) | 10 s |

## `localStorage` del panel

`nahual.ui.v1` gana `exportFormat` (uno de los seis formatos; inválido ⇒ `curl`). Sigue sin
datos de tráfico.

## Lo que no se guarda

| Dato | Por qué |
|---|---|
| Código exportado, bodies cargados para exportar | FR-018: solo se recuerda el formato |
| "Incluir valores sensibles" | FR-011: solo para esa exportación |
| Archivos importados y su vista previa | se descartan al cerrar el diálogo |

`e2e/storage-privacy.spec.ts` se amplía: tras exportar un request con `Authorization` y
`?token=` (con y sin incluir valores sensibles) e importar una configuración, ningún valor
sensible aparece en `storage.local`, `storage.session`, `localStorage`, `sessionStorage` ni
IndexedDB; `nahual.profiles.v1` solo contiene ids, sitios, nombres y fechas.
