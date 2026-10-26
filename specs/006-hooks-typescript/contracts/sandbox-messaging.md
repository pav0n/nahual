# Contrato: mensajería panel ↔ sandbox ↔ Worker (006)

El código del dev es **no confiable**. La página sandbox y sus Workers no tienen `chrome.*`, red
ni acceso al panel (R2). Este contrato es la única puerta.

## Arranque del canal (sin `targetOrigin "*"`)

1. El panel crea `<iframe src="/src/sandbox/hook-sandbox.html" hidden>`.
2. El sandbox crea `const { port1, port2 } = new MessageChannel()` y envía
   `parent.postMessage({ type: "hello", v: 1 }, PANEL_ORIGIN, [port2])`, donde `PANEL_ORIGIN` es
   `chrome-extension://<id>` tomado de su propia `location.href`.
3. El panel acepta el **primer** `hello` cuyo `event.source === iframe.contentWindow` y
   `event.origin === "null"`, guarda `event.ports[0]` y deja de escuchar `message` en `window`.
   Cualquier otro `hello` se descarta y se registra.
4. Desde ahí, todo va por el `MessagePort`. Si el iframe dispara `load` de nuevo (navegó), el
   panel lo destruye, falla las ejecuciones en curso con `access_denied` y crea otro.

## Panel → sandbox

| `type` | Campos | Notas |
|---|---|---|
| `run` | `execId`, `ruleId`, `codeHash`, `source`, `context` (enmascarado), `state`, `stateVersion`, `timeoutMs` | `source` solo si el sandbox no tiene ese `codeHash` en caché |
| `dispose` | `ruleId` | el hook se borró o cambió: cierra su Worker |

## Sandbox → panel

| `type` | Campos |
|---|---|
| `result` | `execId`, `outcome: HookOutcome` (data-model.md) |
| `ready` | `sucraseMs` (medición de X2); el panel no envía `run` antes de recibirlo |

## Sandbox ↔ Worker (interno del sandbox)

- El runtime del Worker es una función fija del bundle del sandbox, convertida a `Blob`; el
  código del dev llega en un mensaje `load { codeHash, js }` y se evalúa una vez con
  `new Function` (R3).
- `exec { execId, context, state }` ⇒ `done { execId, outcome }`.
- El runtime del Worker valida la forma de `load` y `exec` con comprobaciones propias (tipos de
  cada campo, sin Zod) y descarta cualquier otro mensaje. El canal es privado: solo el sandbox
  tiene la referencia al Worker.
- El sandbox mide los 2 s desde que envía `exec` (sin contar su propio arranque ni el de Sucrase);
  al vencer, `terminate()` del Worker y `timeout` para cada ejecución
  en curso de ese hook.

## Validación

- Panel y sandbox validan con Zod cada mensaje entrante; el Worker, con las comprobaciones de
  forma de arriba (desvío justificado en plan.md); uno inválido o con `execId` desconocido se
  descarta y se registra (`logger`), y la ejecución correspondiente termina por tiempo.
- El panel valida además el `outcome` con `validateHookResult` (R6) antes de usarlo.
- Tamaños: `context` y `state` ≤ 5 MB + 1 MB; `logs` ≤ 1,000 entradas de 10 KB.

## Pruebas que intentan romperlo

- Un `hello` desde otra ventana o con otro origen ⇒ ignorado.
- Un `exec` o `load` mal formado dentro del Worker ⇒ descartado.
- Un `result` con `execId` inventado o forma inválida ⇒ descartado.
- El código del dev intenta `parent.postMessage`, `top`, `opener` ⇒ no existen en el Worker.
- El iframe navega ⇒ el panel lo destruye y lo recrea.
