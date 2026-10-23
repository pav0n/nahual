# Contrato: manifest MV3 de 002

**Sin cambios** respecto a [001](../../001-spike-cdp/contracts/manifest.md) (FR-034, SC-006):
`permissions: ["debugger", "storage"]`, sin `host_permissions` ni `optional_host_permissions`, CSP
`script-src 'self'; object-src 'self'`. Solo cambia `version` (0.2.0).

`chrome.storage.local` queda cubierto por el permiso `storage` de 001; no se pide
`unlimitedStorage` (research R10). `Network` y `Page` son dominios de CDP y no requieren permisos
nuevos.

Prueba: `apps/extension/tests/dist/manifest.test.ts` sigue siendo la fuente de verdad y no se
modifica salvo la versión.
