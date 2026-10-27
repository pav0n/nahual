# Contrato: importar desde Requestly (007)

`convertRequestly(records, site)` en `packages/domain/src/requestly/` (research R11). Entrada: el
archivo exportado por Requestly, un array JSON de registros con `objectType: "rule" | "group"`.
Salida: la misma `PortableConfigV1` de [portable-config.md](./portable-config.md) para el sitio
de la pestaña inspeccionada, más `unsupported[]` con nombre y motivo. Después sigue el mismo
camino: vista previa, `importConfig`, desactivado, "importado de Requestly", deshacer 10 s.

## Formato de entrada (subconjunto que se lee)

```ts
{ objectType: "group", id, name, status }
{ objectType: "rule", id, name, ruleType, status, groupId?, pairs: Pair[] }
Pair.source: { key: "Url" | "host" | "path", operator: "Equals" | "Contains" | "Matches" | "Wildcard_Matches", value, filters?: { requestMethod?: string[], resourceType?: string[], requestPayload?: … } | [] }
Redirect: Pair & { destinationType: "url" | "map_local" | "mock_or_file_picker", destination }
Headers:  Pair & { modifications: { Request?: Mod[], Response?: Mod[] } | Mod[] }   // Mod = { header, type: "Add" | "Modify" | "Remove", value? }
Response: Pair & { response: { type: "static" | "code", value, statusCode?, resourceType?, serveWithoutRequest? } }
```

Schemas Zod laxos (`looseObject`): los campos que no se usan (`creationDate`, `currentOwner`…) se
ignoran. Un archivo que no es un array, está vacío o no tiene ningún registro con
`objectType: "rule"` se rechaza con `requestly_error_format`.

## Mapeo de `source` a prefiltro y condiciones

| `key` | `operator` | Prefiltro de Nahual |
|---|---|---|
| `Url` | `Equals` | `regex` `^<escapado>$` |
| `Url` | `Contains` | `glob` `*<valor>*` (si el valor tiene `*` o `?`, `regex` `<escapado>`) |
| `Url` | `Matches` | `regex` `<valor>` tal cual (compilable y ≤ 512; si no, no soportada) |
| `Url` | `Wildcard_Matches` | `glob` `<valor>` |
| `host` | `Equals` | `regex` `^[a-z][a-z0-9+.-]*://<escapado>(:[0-9]+)?(/|$)` |
| `host` | `Contains` | `regex` `^[a-z][a-z0-9+.-]*://[^/]*<escapado>` |
| `host` | `Matches` / `Wildcard_Matches` | `regex` `^[a-z][a-z0-9+.-]*://[^/]*(<regex o wildcard convertido>)` |
| `path` | `Equals` | `regex` `^[a-z][a-z0-9+.-]*://[^/]+<escapado>(\?|$)` |
| `path` | `Contains` | `regex` `^[a-z][a-z0-9+.-]*://[^/]+[^?]*<escapado>` |
| `path` | `Matches` / `Wildcard_Matches` | `regex` `^[a-z][a-z0-9+.-]*://[^/]+(<regex o wildcard convertido>)` |

`filters.requestMethod` ⇒ `methods`; `filters.resourceType` ⇒ `resourceTypes` con la tabla
`xmlhttprequest → xhr`, `script`, `stylesheet`, `image`, `font`, `main_frame → document`,
`sub_frame → document`, `media`, `websocket` ⇒ no soportado; cualquier otro filtro
(`requestPayload`, `pageUrl`…) ⇒ `requestly_unsupported_filter`. Una regla con varias parejas
produce una regla de Nahual por pareja, numeradas "(1)", "(2)"… Si cualquier pareja no es
convertible, la regla entera va a `unsupported` con el motivo de esa pareja (FR-036).

## Mapeo por tipo

| `ruleType` | Resultado | Notas |
|---|---|---|
| `Response` `type: "static"` | Mock, etapa Response; `status` = `statusCode` o 200; `body` = `value`; `content-type` `application/json` si `value` es JSON válido, si no `text/plain` | `serveWithoutRequest: true` ⇒ etapa Request (responde sin red) |
| `Response` `type: "code"` | no soportada `requestly_unsupported_response_code` | |
| `Redirect` `destinationType: "url"` | Hook, etapa Request (plantilla abajo) | `map_local` / `mock_or_file_picker` ⇒ `requestly_unsupported_redirect_destination` |
| `Headers` | Hook por etapa: `Request` ⇒ etapa Request, `Response` ⇒ etapa Response; el formato plano (API) se trata como `Request` | Una pareja con ambas ⇒ dos reglas, "(request)" y "(response)" |
| `Cancel`, `Replace`, `UserAgent`, `QueryParam`, `Script`, `Request`, `Delay`, otro | no soportada `requestly_unsupported_rule_type` | |

Grupos: cada `group` ⇒ perfil del sitio con su `name`; las reglas con `groupId` llevan ese
`profileIds`. Un grupo sin reglas soportadas no se crea.

## Plantillas de hooks (valores siempre con `JSON.stringify`)

```ts
// Imported from Requestly · Redirect "Staging API" · Url Wildcard_Matches "*://api.example.com/*"
export default (ctx: HookContext) => {
  const pattern = /^(.*?):\/\/api\.example\.com\/(.*)$/;
  ctx.request.url = ctx.request.url.replace(pattern, "https://staging.example.com/$2");
};
```

- `Equals`/`Contains` ⇒ `ctx.request.url = "<destination>";` (sin `replace`).
- `Wildcard_Matches` ⇒ el comodín se convierte a regex con grupos (`*` ⇒ `(.*?)`, `?` ⇒ `(.)`)
  para que `$1…$n` del destino funcionen como en Requestly; `Matches` usa la regex tal cual.

```ts
// Imported from Requestly · Headers "CORS dev" (response) · Url Contains "/api/"
export default (ctx: HookContext) => {
  if (!ctx.response) return;
  ctx.response.headers["access-control-allow-origin"] = "*";
  delete ctx.response.headers["x-frame-options"];
};
```

Los hooks generados se validan con el Worker de tipos de 006 en la vista previa; el `check`
viaja en `importConfig`. Activar un hook de redirección a otro origen exige marcar el permiso de
cambiar el destino (006), como cualquier hook importado.

## Pruebas

- Fixtures: un export real con `Redirect`, `Headers` (Request, Response y ambas), `Response`
  estática y de código, `QueryParam`, `Script`, grupos, filtros y una regex inválida.
- Cada regla soportada, activada, reproduce el comportamiento de Requestly contra el fixture
  (E2E, SC-009); cada no soportada aparece con su motivo.
- Un valor con comillas, `*/`, `${}` o saltos de línea en `destination` o en un header no
  altera el hook generado (prueba de inyección).
