# Contrato: almacenamiento (005)

## `chrome.storage.local`

Se mantienen `nahual.rules.v1` y `nahual.settings.v1` de 003. Nueva clave, escrita solo por el SW:

| Clave | Contenido | Escribe | Lee |
|---|---|---|---|
| `nahual.repeater.ignores.v1` | `IgnoreList` ([data-model](../data-model.md#ignorelist-persistida-r10)) | El SW, en `setIgnores` | El SW, en `getIgnores` |

- Indexada por `sha256("<MÉTODO> <origen><ruta>")`: sin URLs en claro.
- Solo rutas de JSON y nombres de header; nunca valores (FR-029).
- Lectura con schema; inválida ⇒ lista vacía y aviso `repeater_ignores_invalid`.

## Lo que **no** se guarda (FR-020a)

Pestañas del repeater, requests, respuestas, historial, respuestas pegadas y valores revelados
viven solo en memoria del panel. Nada del repeater va a `chrome.storage.*`, `localStorage`,
`sessionStorage` ni IndexedDB.

`localStorage` del panel (`nahual.ui.v1`, 004) suma solo `repeaterSplit` (reparto del divisor de
la sección Repeater, 0.2–0.8).

## Pruebas

- Unitarias del SW: `setIgnores` rechaza valores, recorta a los límites y descarta el endpoint
  menos usado.
- `storage-privacy.spec.ts` amplía su comprobación (SC-005a): tras envíos en ambos modos con
  cookies, `Authorization`, tokens en body y query, y un diff con ignorados, ningún valor de esos
  requests ni respuestas aparece en `chrome.storage.local`, `localStorage` ni IndexedDB, y las
  claves de `nahual.repeater.ignores.v1` son hashes.
