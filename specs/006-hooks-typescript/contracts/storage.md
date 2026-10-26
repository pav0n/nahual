# Contrato: almacenamiento (006)

## `chrome.storage.local`

- `nahual.rules.v1` (de 002): las reglas con acción `hook` guardan `source`, `imported`,
  `permissions` y `check` (data-model.md). Misma clave y versión: la acción `hook` es un miembro
  nuevo de la unión. Límites: 100 KB por hook y 5 MB entre todos (FR-034).
- Nada más. No hay claves nuevas.

## Lo que no se guarda (solo memoria del panel)

| Dato | Por qué |
|---|---|
| `state` de los hooks | FR-008: dura hasta cerrar el panel |
| Registros y errores de la consola | FR-029; pueden contener valores que el dev registró |
| Ejecuciones por intercambio (pestaña Hooks) | Igual que el historial de 002 |
| Suspensiones | FR-022: hasta cerrar el panel |
| Código transpilado | Caché del sandbox, por hash |

`e2e/storage-privacy.spec.ts` se amplía: tras una sesión con un hook que registra un token y lo
guarda en `state`, ningún valor aparece en `storage.local`, `storage.session`, `localStorage`,
`sessionStorage` ni IndexedDB del panel.
