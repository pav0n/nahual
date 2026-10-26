# Contrato: protocolo panel ↔ SW v6 (007)

`PROTOCOL_VERSION` pasa de 5 a 6. Todo lo de v5 sigue igual; los mensajes nuevos se validan con
Zod en el receptor y un mensaje inválido se descarta y se registra (principio I). La exportación
al código no necesita mensajes: el panel ya tiene reglas, ajustes y `getBody`.

## Comandos panel → SW

| Comando | Payload | Resultado |
|---|---|---|
| `saveProfile` | `{ id?: uuid, name: string }` (sitio = el de la pestaña) | `ok` con `profile`, o `profile_invalid` con `issues` (`profile_error_required`, `profile_error_too_long`, `profile_error_duplicate`, `profile_error_limit`) |
| `deleteProfile` | `{ id }` | `ok`; quita el id de `profileIds` de sus reglas; pestañas con ese perfil activo pasan a `null`; conserva la instantánea 10 s |
| `restoreProfile` | `{ id }` | `ok` si sigue en la ventana de deshacer: recupera el perfil y sus pertenencias (no la selección de las pestañas) |
| `setActiveProfile` | `{ profileId: uuid \| null }` | `ok`; actualiza la pestaña y `lastActive[site]`; `profile_not_found` si no existe en el sitio |
| `setRuleProfiles` | `{ ruleId, profileIds: uuid[] }` | `ok` o `rule_invalid` (perfil de otro sitio, límite) |
| `importConfig` | `ImportPayload` ([data-model](../data-model.md)) | `ok` con `{ importId, rules: n, profiles: n, productionOrigins: n }`, o `config_invalid` / `config_limit` con `issues`, o `storage_quota` |
| `undoImport` | `{ importId }` | `ok` o `undo_expired` |

`saveRule` (002) acepta `profileIds` dentro del borrador. `setRuleEnabled` responde
`rule_error_redacted_value` para una regla importada con valores redactados sin completar.

## Eventos SW → panel

| Evento | Payload | Cuándo |
|---|---|---|
| `profiles` | `{ profiles: Profile[], lastActive: Record<site, uuid> }` | Al conectar y en cada cambio |
| `state` (existente) | + `activeProfileId: uuid \| null` | Al conectar, al navegar, tras `setActiveProfile`, `deleteProfile` e importar |
| `notice` (existente) | `notice_profile_deleted_active`, `notice_import_undone` | Perfil activo eliminado desde otra pestaña; deshacer una importación desde otra pestaña |
| `rules` (existente) | reglas con `profileIds` e `imported` | sin cambios de forma |

## Reglas de validación en el SW

- Todo `uuid` de perfil debe existir y pertenecer al sitio de la pestaña (o al sitio de la regla).
- `importConfig` repite la validación completa del panel (`parseConfig` + límites sumados) antes
  de escribir; el `hookChecks[ruleId].hash` debe coincidir con `hashSource(source)` o el hook se
  guarda con `check.ok: false`.
- Una sola escritura `storage.set({ rules, profiles, settings })` por importación y por deshacer.

## Pruebas

- `packages/protocol`: schemas de cada mensaje, válidos e inválidos.
- `tests/integration/profiles.test.ts`: ciclo completo con el almacén simulado, dos pestañas del
  mismo sitio con perfiles distintos, navegación, reinicio del SW.
- `tests/integration/import-config.test.ts`: atomicidad (fallo de cuota ⇒ nada cambia),
  deshacer dentro y fuera de los 10 s, orígenes añadidos y restaurados.
