# Contrato: manifest (005)

Cambio respecto a [004](../../004-rediseno-panel/contracts/manifest.md): un permiso de host
**opcional** para el contexto limpio del repeater (clarificación 3, FR-011a, research R5). Versión
`0.5.0`.

| Campo | Antes | Ahora |
|---|---|---|
| `permissions` | `debugger`, `storage` | Sin cambios |
| `optional_host_permissions` | — | `["http://*/*", "https://*/*"]` |
| `host_permissions` | — | Sin cambios (ninguno) |

- Al instalar no se concede ningún host: Chrome no muestra advertencias nuevas.
- El panel pide **un origen exacto** (`<esquema>://<host>[:puerto]/*`) con
  `chrome.permissions.request` solo en el clic de "Enviar" en contexto limpio, cuando el SW
  responde `permission_required`. Nunca `<all_urls>` ni comodines de host.
- Ajustes ⇒ General lista los orígenes concedidos (`chrome.permissions.getAll`) con "Quitar"
  (`chrome.permissions.remove`).
- El SW solo usa el permiso en `clean-send.ts` (`fetch` con `credentials: "omit"`); la captura,
  las reglas y CORS siguen usando solo `debugger`.

| API nueva | Permiso | Nota |
|---|---|---|
| `Page.createIsolatedWorld`, `Runtime.callFunctionOn` | `debugger` (existente) | Contexto de página (R1) |
| `chrome.permissions.request/remove/getAll/contains` | Ninguno (API base) | Contexto limpio (R5, X2) |
| `fetch` en el SW | El host opcional concedido | Único uso de red propia; `verify:dist` lo acota (R14) |

`verify:dist` comprueba: `permissions` exactamente `["debugger", "storage"]`,
`optional_host_permissions` exactamente los dos patrones, sin `host_permissions`, y que el único
`fetch(` del build es el marcado en el chunk del SW.
