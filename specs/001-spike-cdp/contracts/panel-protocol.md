# Contrato: protocolo panel ↔ service worker (v1)

Implementado como schemas Zod en `packages/protocol`. Ambos extremos validan todo mensaje
entrante; un mensaje inválido se descarta, se registra con `console.warn` (sin URLs ni headers)
y no se responde.

## Transporte

- El panel abre `chrome.runtime.connect({ name: "nahual-panel" })`.
- El SW acepta solo en `chrome.runtime.onConnect` (nunca `onConnectExternal`) y solo si
  `port.name === "nahual-panel"`, `port.sender?.id === chrome.runtime.id` y `port.sender.url`
  empieza por `chrome-extension://<id>/` + ruta del panel. Si no, `port.disconnect()`.
- El primer mensaje del panel MUST ser `hello`; cualquier otro antes de `hello` cierra el puerto.
- `port.onDisconnect` en el SW ⇒ detach de la pestaña asociada (causa `panel_closed`).

## Sobre (envelope)

```ts
{ v: 1, id: string /* uuid */, correlationId?: string /* uuid */, type: string, payload: object }
```

## Panel → SW (comandos)

Cada comando recibe exactamente una respuesta `ack` o `error` con `correlationId = id`.

| `type` | `payload` | Efecto |
|---|---|---|
| `hello` | `{ tabId: int ≥ 0 }` | Asocia el puerto a la pestaña; responde `ack` + `state` actual |
| `attach` | `{}` | Adjunta el debugger a la pestaña del puerto |
| `detach` | `{}` | Suelta el debugger (causa `user`) |
| `reconnect` | `{}` | Igual que `attach` desde `detached`/`conflict` |
| `setPatterns` | `{ patterns: InterceptionPattern[] }` (0–10) | Reemplaza los patrones; vacío ⇒ Fetch deshabilitado |
| `setPauseTimeout` | `{ seconds: int 5–120 }` | Cambia el timeout de pausas nuevas |
| `continue` | `{ pausedId: string, headers?: HeaderEdit[] (≤ 50) }` | Continúa sin cambios o con headers editados |

## SW → Panel (eventos y respuestas)

| `type` | `payload` | Cuándo |
|---|---|---|
| `ack` | `{}` | Comando aceptado |
| `error` | `{ code: ErrorCode, messageKey: string }` | Comando rechazado; `messageKey` es la clave de `_locales` con causa y solución |
| `state` | `{ status, cause, attachedAt, patterns, pauseTimeoutSeconds }` | Tras `hello` y en cada cambio de sesión (< 1 s tras un `onDetach`) |
| `paused` | `PausedRequest` sin `state` | Nuevo request pausado |
| `resolved` | `{ pausedId, outcome: "continued" \| "modified" \| "timed_out" \| "failed" \| "abandoned", errorKey?: string }` | Request resuelto |

`ErrorCode`: `"invalid_message" | "not_attached" | "already_attached" | "restricted_page" |
"pattern_invalid" | "timeout_out_of_range" | "unknown_paused_id" | "cdp_error"`.

## Garantías verificadas por pruebas

- Un puerto con `sender.id` distinto o URL fuera del panel se cierra sin procesar mensajes.
- Un mensaje con `v ≠ 1`, `type` desconocido o `payload` inválido se descarta.
- `continue` con un `pausedId` ya resuelto responde `error unknown_paused_id` y no llama a CDP.
- Ningún evento incluye bodies; los headers viajan solo al panel de la misma pestaña.
