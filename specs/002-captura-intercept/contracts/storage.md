# Contrato: almacenamiento persistente (`chrome.storage.local`)

Única persistencia de 002. Solo el service worker escribe; todo valor se valida con los schemas de
`packages/domain` al escribir y al leer. `chrome.storage.session` mantiene el registro de sesiones
de 001 sin cambios.

| Clave | Valor | Regla |
|---|---|---|
| `nahual.rules.v1` | `{ version: 1, rules: Rule[] }` | ≤ 500 reglas; `mock.body` ≤ 1 MB por regla |
| `nahual.settings.v1` | `{ version: 1, settings: Settings }` | Ver data-model |

## Lectura

1. Al arrancar el SW y en `chrome.storage.onChanged` (área `local`).
2. Objeto raíz inválido o `version` desconocida ⇒ se ignora entero, se usan valores vacíos o por
   defecto y se emite `notice` con la causa. No se sobrescribe el disco hasta la siguiente
   escritura del dev.
3. Reglas: se valida cada una; las inválidas se descartan de memoria y se cuentan por causa
   (`rules.discarded`). Las válidas se ordenan por `site` y `order`.

## Escritura

- Lectura + modificación + escritura en el SW, serializadas (una a la vez) para que dos comandos
  seguidos no se pisen.
- Si `set` falla por cuota ⇒ `error storage_quota` con causa y solución ("elimina reglas o reduce
  el body del mock"); el estado en memoria no cambia.
- Migraciones: una `version` nueva exige una función de migración probada en `packages/domain`.

## Lo que no se guarda nunca

Historial, bodies capturados, la cola de pausados y los headers de intercambios (FR-007, FR-033).
`storage.sync` no se usa.

## Pruebas

- Reglas corruptas mezcladas con válidas ⇒ se cargan las válidas y el aviso indica cuántas se
  descartaron.
- Ninguna clave de `storage.local` contiene datos de tráfico tras una sesión E2E completa.
