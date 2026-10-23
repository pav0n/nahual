# Contrato: almacenamiento persistente (003)

Igual que [002](../../002-captura-intercept/contracts/storage.md), con dos campos nuevos en los
ajustes. **Ninguna relajación se guarda** en `storage.local` ni en `storage.session` (FR-017).

| Clave | Cambio |
|---|---|
| `nahual.rules.v1` | Sin cambios |
| `nahual.settings.v1` | `settings` suma `corsDefaultDurationMinutes` (15/60/240/480, default 480) y `productionOrigins` (≤ 100 entradas normalizadas). Sin cambio de `version`: `parseSettings` ya lee campo a campo y rellena los que faltan |

## Lectura de `productionOrigins`

- Cada entrada se valida por separado. Si alguna es inválida: se conservan las válidas, se emite
  `notice cors_production_list_invalid` y el SW **rechaza toda relajación** (`issue
  production_list_invalid`) hasta que el dev guarde la lista (falla cerrada, research R12).
- El valor en disco no se reescribe hasta la siguiente escritura del dev (como 002).

## Pruebas

- Ajustes de 002 sin los campos nuevos ⇒ se leen con los defaults y sin aviso.
- Lista con una entrada corrupta ⇒ aviso y `relaxCors` rechazado; tras guardarla, se permite.
- Tras una sesión E2E con relajaciones, `storage.local` y `storage.session` no contienen ninguna
  relajación ni datos de tráfico (amplía `storage-privacy.spec.ts`).
