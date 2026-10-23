# Contrato: protocolo panel ↔ service worker (v2)

Evolución de [001 v1](../../001-spike-cdp/contracts/panel-protocol.md). Se mantienen el
transporte, la verificación de remitente, `hello` primero, el sobre y las garantías de v1. Panel
y SW se empaquetan juntos, así que `PROTOCOL_VERSION` pasa a `2` sin compatibilidad con v1: un
mensaje `v: 1` se descarta como inválido.

Schemas en `packages/protocol`; los tipos de dominio (`Rule`, `Condition`, `Action`, `Settings`,
`PausedEdit`) se importan de `packages/domain` ([data-model.md](../data-model.md)).

## Panel → SW (comandos)

Cada comando recibe exactamente un `ack` o `error` con `correlationId = id`.

| `type` | `payload` | Efecto |
|---|---|---|
| `hello` | `{ tabId }` | Igual que v1; responde `ack` + `state` + `settings` + `rules` |
| `attach` | `{ consent?: true }` | Adjunta; con `consent` guarda `attachConsent: true` |
| `detach` | `{}` | Suelta (causa `user`) |
| `reconnect` | `{}` | Igual que v1 |
| `updateSettings` | `Partial<Settings>` | Valida y persiste; responde `settings` |
| `saveRule` | `{ rule: RuleDraft & { id?: uuid } }` | Crea (sin `id`, en el sitio actual y al final) o reemplaza; valida con FR-013; `error rule_invalid` con `issues[]` |
| `deleteRule` | `{ ruleId }` | Elimina; restaurable 10 s |
| `restoreRule` | `{ ruleId }` | Deshace la eliminación (`error unknown_rule` si venció) |
| `reorderRules` | `{ site, ruleIds: uuid[] }` | Nuevo orden completo del sitio; debe ser una permutación exacta |
| `setRuleEnabled` | `{ ruleId, enabled }` | |
| `resolvePaused` | `{ pausedId, action: "continue" \| "continueUnchanged" \| "mock" \| "abort", edit?: PausedEdit, mock?: MockAction }` | `edit` solo con `continue`; `mock` solo con `mock` |
| `continueAll` | `{}` | Continúa sin cambios toda la cola de la pestaña (FR-024) |
| `getBody` | `{ exchangeId, side: "request" \| "response" }` | Responde `body` o `error body_unavailable` |

## SW → Panel (eventos y respuestas)

| `type` | `payload` | Cuándo |
|---|---|---|
| `ack` / `error` | como v1; `error` añade `issues?: { path, messageKey }[]` | |
| `state` | `{ status, cause, attachedAt, site: string \| null, activeRuleCount, queueSize, globalPaused }` | Tras `hello` y en cada cambio (< 1 s tras `onDetach`) |
| `settings` | `Settings` | Tras `hello` y al cambiar |
| `rules` | `{ rules: Rule[], discarded: { count, reasonKey }[] }` | Tras `hello`, al cambiar y al leer storage con reglas inválidas |
| `exchanges` | `{ updates: ExchangeUpdate[] }` (≤ 200) | Lotes cada 50 ms (research R11) |
| `navigated` | `{ site: string \| null, url }` | Commit del frame principal |
| `paused` | `PausedItemView` | Nuevo item en la cola |
| `resolved` | `{ pausedId, outcome: RuleEffect.result, errorKey? }` | Item resuelto por cualquier vía |
| `body` | `{ exchangeId, side, encoding: "text" \| "base64", content, size }` | Respuesta a `getBody` (≤ 5 MB) |
| `notice` | `{ messageKey, params? }` | Avisos sin comando: cola llena, cuota de storage, reglas descartadas |

`ExchangeUpdate`: `{ id, kind: "start" | "response" | "finish" | "fail" | "effect", fields }`, con
`fields` un subconjunto de `CapturedExchange`. Nunca incluye bodies.

`ErrorCode` (v2) = v1 sin `pattern_invalid` ni `timeout_out_of_range`, más: `rule_invalid`,
`unknown_rule`, `settings_invalid`, `storage_quota`, `edit_invalid`, `body_unavailable`,
`no_site`.

## Límites de tamaño

- Mensaje del panel ≤ 6 MB (mock o body editado de 5 MB más metadatos); el SW descarta los
  mayores sin parsear.
- `rules` ≤ 500 reglas; `PausedItemView` con `body` solo si ≤ 5 MB y textual.

## Garantías verificadas por pruebas

- Las de v1 (remitente, `hello` primero, mensajes inválidos descartados, ids ya resueltos).
- `saveRule` con regex o JSONPath inválido no escribe en storage y devuelve `issues` con el campo.
- `resolvePaused` sobre un item ya resuelto (p. ej. por timeout) responde
  `error unknown_paused_id` y no llama a CDP.
- Ningún evento contiene bodies salvo `body` y `paused`, y solo hacia el puerto dueño de esa
  pestaña.
- Los `console.warn`/`console.error` del SW no contienen valores de headers sensibles ni bodies
  (FR-036).
