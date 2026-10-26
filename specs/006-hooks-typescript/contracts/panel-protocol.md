# Contrato: protocolo panel ↔ SW v5 (006)

`PROTOCOL_VERSION` pasa de 4 a 5. Todo lo de v4 sigue igual; los mensajes nuevos se validan con
Zod en el receptor y un mensaje inválido se descarta y se registra (principio I).

## Evento SW → panel `hookRun`

Se envía cuando `selectChain` devuelve una cadena de hooks para un intercambio pausado.

```ts
{
  runId: string;               // único por intercambio y etapa
  exchangeId: string;
  stage: "request" | "response";
  chain: { ruleId: string; ruleName: string; source: string;
           permissions: { changeDestination: boolean; readSensitive: boolean } }[]; // 1..500
  context: HookContextData;    // sin enmascarar: el panel enmascara por hook (R5)
}
```

- Bodies con los límites de 002 (≤ 5 MB de texto; si no, `bodyInfo` sin contenido).
- El SW espera `hookResult` hasta `2 s × chain.length + 3 s` (incluye un arranque en frío del
  sandbox); si vence o el puerto se cierra,
  continúa sin cambios y registra `hook_failed` con `timeout` en cada regla (principio II).

## Comando panel → SW `hookResult`

```ts
{
  runId: string;
  final:
    | { kind: "unchanged" }
    | { kind: "edit"; request?: { method; url; headers: Record<string, string>; body? };
        response?: { status; headers: Record<string, string>; body? } }
    | { kind: "respond"; status: number; headers: Record<string, string>; body: string };
  executions: { ruleId: string; result: "hooked" | "hook_unchanged" | "hook_failed"
                | "hook_responded" | "hook_skipped_suspended"; durationMs: number;
                errorType?: string }[];
}
```

Los headers viajan como objeto (los del contexto del hook); el SW los vuelve a convertir en lista
con `toHeaderList(record, originales)` de `hook-runtime`, que conserva orden, mayúsculas y
entradas separadas de los que no cambiaron.

El SW, antes de aplicar:

1. Comprueba que `runId` está pendiente para ese puerto y pestaña; si no, descarta.
2. Valida `final` con las reglas de 002 (`validatePausedEdit` / `validateQueueMock`).
3. Si cambió el origen de la URL, comprueba que alguna regla de la cadena que dio `hooked` tiene
   `changeDestination` (repite FR-010 del lado de la autoridad).
4. Aplica: `edit` ⇒ `continueEdited`; `respond` ⇒ `respond` con los headers CORS de un mock
   local (`mockHeadersFor`); `unchanged` ⇒ `continueUnchanged`. La relajación CORS de 003 envuelve
   al ejecutor y actúa después (FR-013).
5. Registra un `RuleEffect` por cada ejecución.

## Cambios en tipos existentes

- `ActionSchema` (domain) suma `hook` (data-model.md); viaja en `setRule`, `rules` e
  `importHook` como el resto.
- `RuleResult` suma `hooked`, `hook_unchanged`, `hook_failed`, `hook_responded`,
  `hook_skipped_suspended`.
- `RuleEffect` suma `durationMs?` y `destination?: { from, to }` (redirección, FR-010).

## Comando panel → SW `importHook`

```ts
{ config: HookFileConfig | null; source: string }
```

Crea siempre una regla **nueva** en el sitio actual: con `config` si es válida o, si no, con una
configuración vacía para que el dev la complete (nunca reemplaza el código de una regla
existente, FR-036). Siempre deja la regla con `enabled: false`, `imported: true` y permisos en `false` (FR-037). El
SW aplica los límites de tamaño (FR-034) y responde como `setRule`.
