# Contrato: manifest MV3 de 003

**Sin cambios** respecto a [002](../../002-captura-intercept/contracts/manifest.md) (FR-040):
`permissions: ["debugger", "storage"]`, sin `host_permissions` ni `optional_host_permissions`, CSP
`script-src 'self'; object-src 'self'`. Solo cambia `version` (0.3.0).

Se descartan con justificación (research R2): `alarms` (la relajación no sobrevive al SW; basta
`setTimeout` + `expiresAt`), `declarativeNetRequestWithHostAccess` y `declarativeNetRequest` (el
preflight es interceptable por CDP, 001-E1), `tabs` (el cierre de pestaña llega como
`onDetach target_closed`) y `clipboardWrite` (copia dentro del gesto del usuario, R14).

Prueba: `apps/extension/tests/dist/manifest.test.ts` sin cambios salvo la versión.
