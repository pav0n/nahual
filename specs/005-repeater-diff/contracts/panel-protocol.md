# Contrato: protocolo panel ↔ service worker (v4)

Evolución de [003 v3](../../003-cors-desarrollo/contracts/panel-protocol.md). Se mantienen el
transporte, la verificación de remitente, `hello` primero, el sobre, los límites y las garantías
de v3. `PROTOCOL_VERSION` pasa a `4` sin compatibilidad con v3: un mensaje `v: 3` se descarta como
inválido. Tipos en [data-model.md](../data-model.md).

## Panel → SW: comandos nuevos

| `type` | `payload` | Efecto |
|---|---|---|
| `repeaterSend` | `{ sendId: uuid, mode: "page" \| "clean", request: RepeaterRequest }` | El SW valida `request` con su schema y el modo: `page` solo si la pestaña del puerto está adjunta y en el sitio de la sesión (si no, `repeaterResult` con `not_attached`/`context_lost`); `clean` sin permiso para el origen ⇒ `repeaterResult` con `permission_required` y `params: [origen]`. Responde `ack` al aceptar; el resultado llega como `repeaterResult` |
| `repeaterCancel` | `{ sendId: uuid }` | Aborta el envío (R4). Idempotente: un `sendId` desconocido o terminado responde `ack` |
| `getIgnores` | `{ method, url }` | El SW calcula `endpointKey` y responde `ignores` (vacío si no hay) |
| `setIgnores` | `{ method, url, paths: PathPattern[], headers: string[] }` | Reemplaza la lista del endpoint (validada: límites, sin valores) y responde `ignores` |

`getBody` (v2) sirve también para el body del request de origen (FR-002a) y la respuesta original
(FR-022).

## SW → Panel: eventos nuevos o ampliados

| `type` | `payload` | Cuándo |
|---|---|---|
| `repeaterResult` | `{ sendId, state: "done" \| "failed" \| "cancelled", response?, error?, durationMs?, size?, preflight?, ruleEffects, relaxed, cors?, notSentHeaders, exchangeId? }` | Un envío termina. Solo al puerto que lo pidió |
| `ignores` | `{ method, url, paths, headers }` | Respuesta a `getIgnores`/`setIgnores` |
| `exchanges` | como v3; `ExchangeFields` suma `repeater?: { sendId }` | Intercambio enviado por el repeater en contexto de página (FR-010a) |

## Códigos de error nuevos

En `repeaterResult.error.code`: `invalid_request` (con `issues`), `not_attached`,
`context_lost`, `network`, `cors_blocked`, `permission_required`, `permission_denied`,
`timeout`, `cancelled`, `body_too_large`. En `error` (v2) para `setIgnores` inválido:
`ignores_invalid`.

## Garantías verificadas por pruebas

- Las de v3.
- **Inyección** (SC-004): `repeaterSend` con URL, nombres y valores de headers y body que
  contienen `"); globalThis.__pwned=1; ("`, `</script>`, `${…}`, `` ` ``, saltos de línea y
  `//# sourceURL` no ejecuta nada en la página ni en la extensión: la integración comprueba que
  `functionDeclaration` es siempre la constante `PAGE_SEND` (hash fijo) y los datos solo van en
  `arguments`; la E2E comprueba que `__pwned` no existe en la página tras los envíos y que el
  servidor recibió los valores literales.
- Los envíos en contexto de página de una pestaña salen de uno en uno y en orden (research R2);
  cada `repeaterResult` lleva la respuesta de su propio intercambio.
- `repeaterSend` desde el puerto de la pestaña A nunca envía en la pestaña B (el `tabId` lo pone
  el SW a partir del remitente).
- Modo `clean`: el `fetch` del SW usa siempre `credentials: "omit"`; el servidor de prueba no
  recibe `Cookie` ni `Authorization` que el dev no haya escrito (SC-005); sin permiso para el
  origen no hay ninguna petición de red.
- Modo `page`: el intercambio aparece en `exchanges` con `repeater.sendId` y pasa por las reglas
  y la relajación CORS de la pestaña.
- Ningún `repeaterResult` lleva datos de otro envío; un `sendId` repetido mientras está pendiente
  ⇒ `invalid_request`.
- `setIgnores` nunca guarda valores: el schema solo acepta rutas y nombres de header.
