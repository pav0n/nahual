# Data Model: Spike CDP y base del proyecto

Todas las entidades viven en memoria del service worker salvo indicación. No hay almacenamiento
persistente en esta feature. Los tipos se definen como schemas Zod en `packages/protocol` cuando
cruzan contextos; los internos del SW son tipos TypeScript.

## DebuggerSession

Vínculo entre Nahual y una pestaña. Una por `tabId`.

| Campo | Tipo | Regla |
|---|---|---|
| `tabId` | entero ≥ 0 | Identidad; única |
| `status` | `"detached" \| "attaching" \| "attached" \| "conflict"` | Ver transiciones |
| `cause` | `"user" \| "panel_closed" \| "canceled_by_user" \| "target_closed" \| "already_attached" \| "restricted_page" \| "unknown"` \| null | Obligatoria si `status` es `detached` tras haber estado adjunto, o `conflict` |
| `attachedAt` | epoch ms \| null | Solo con `attached` |
| `interception` | `InterceptionConfig` | Ver abajo |

El panel ve `detached` como "desconectado", `attached` como "adjunto" y `conflict` como
"en conflicto"; `attaching` se muestra como estado de carga.

**Transiciones**

```text
detached ──attach──▶ attaching ──ok──▶ attached
                        │
                        ├─error already_attached──▶ conflict
                        └─error otro─────────────▶ detached (cause)
attached ──detach (user | panel_closed)──▶ detached
attached ──onDetach (canceled_by_user | target_closed)──▶ detached (cause)
conflict | detached ──reconnect (solo comando explícito)──▶ attaching
```

- Al pasar a `detached` o `conflict`, todos los `PausedRequest` de la pestaña se resuelven como
  `abandoned` y `interception` se vacía.
- El registro en `chrome.storage.session` (`nahual.sessions: number[]`) se actualiza al entrar
  y salir de `attached`.

## InterceptionConfig (configuración de sesión)

| Campo | Tipo | Regla |
|---|---|---|
| `patterns` | `InterceptionPattern[]` | 0–10 elementos. Vacío ⇒ `Fetch.disable` (FR-007) |
| `pauseTimeoutMs` | entero | 30 000 por defecto; rango 5 000–120 000; fuera de rango se rechaza y se conserva el valor anterior |

No persiste: se pierde al cerrar el panel o al reiniciar el SW. El nuevo timeout aplica a las
pausas creadas después del cambio.

## InterceptionPattern

| Campo | Tipo | Regla |
|---|---|---|
| `urlPattern` | string | 1–2 048 caracteres; comodines `*` y `?` (sintaxis de `Fetch.RequestPattern`); sin espacios |
| `stage` | `"request" \| "response"` | Se traduce a `requestStage` de CDP |

Duplicados exactos (`urlPattern` + `stage`) se ignoran.

## PausedRequest

| Campo | Tipo | Regla |
|---|---|---|
| `pausedId` | string | `requestId` de `Fetch.requestPaused`; único por sesión |
| `tabId` | entero | Pestaña dueña |
| `stage` | `"request" \| "response"` | |
| `method` | string | |
| `url` | string | Se muestra como texto |
| `headers` | `Header[]` | Request: del request; Response: `responseHeaders` |
| `statusCode` | entero \| null | Solo en Response |
| `bodyAvailable` | boolean | `false` en redirecciones (3xx) y en etapa Request sin body |
| `bodySize` | entero \| null | Solo informativo |
| `pausedAt` | epoch ms | |
| `expiresAt` | epoch ms | `pausedAt + pauseTimeoutMs` |
| `state` | ver transiciones | |

**Transiciones** (la primera que ocurre gana; las demás se ignoran):

```text
paused ──continue sin cambios──▶ continued
paused ──continue con headers──▶ modified
paused ──vence timeout─────────▶ timed_out   (continúa sin cambios)
paused ──error CDP / validación▶ failed      (continúa sin cambios)
paused ──detach / pestaña cerrada / reinicio SW▶ abandoned (Chrome libera el request)
```

Al llegar a un estado final se emite `resolved` al panel y se elimina de memoria.

## Header

| Campo | Tipo | Regla |
|---|---|---|
| `name` | string | 1–256 caracteres, token HTTP válido (RFC 9110) |
| `value` | string | 0–8 192 caracteres, sin `\r` ni `\n` |

## HeaderEdit (en `continue`)

| Campo | Tipo | Regla |
|---|---|---|
| `name` | string | Como `Header.name`; comparación sin mayúsculas |
| `value` | string \| null | `null` elimina el header; otro valor lo añade o reemplaza |

## MessageEnvelope

Ver [contracts/panel-protocol.md](./contracts/panel-protocol.md).

| Campo | Tipo | Regla |
|---|---|---|
| `v` | literal `1` | Versión del protocolo; otra versión ⇒ descartar |
| `id` | UUID v4 | Único por mensaje |
| `correlationId` | UUID v4 \| omitido | En respuestas: `id` del comando que responden |
| `type` | string | Discriminante del mensaje |
| `payload` | objeto | Validado por el schema de `type` |

## Registro de investigación

No es una entidad de código: cada experimento de `research.md` registra entorno, método,
resultado, conclusión y alternativas.
