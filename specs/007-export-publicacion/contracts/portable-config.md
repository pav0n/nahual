# Contrato: configuración portable (007)

Archivo JSON que exporta e importa Ajustes ⇒ Importar y exportar (FR-026 a FR-033, research R9 y
R10). Nombre al descargar: `nahual-config-<AAAA-MM-DD>.json`.

## Versión 1

```json
{
  "nahual": "config",
  "version": 1,
  "app": "1.0.0",
  "exportedAt": "2026-10-25T20:00:00.000Z",
  "redacted": { "count": 2, "rules": ["<ruleId>"] },
  "productionOrigins": ["https://app.example.com"],
  "sites": [
    {
      "site": "http://localhost:3000",
      "profiles": [{ "id": "<uuid>", "name": "QA staging" }],
      "rules": [
        {
          "id": "<uuid>", "order": 0, "profileIds": ["<uuid>"],
          "name": "Pausar errores", "enabled": true, "prefilter": { "kind": "glob", "pattern": "*" },
          "methods": [], "resourceTypes": ["xhr", "fetch"], "stage": "response",
          "conditions": [{ "kind": "status", "op": "gte", "value": 400 }],
          "action": { "kind": "pause" }
        },
        {
          "id": "<uuid>", "order": 1, "profileIds": [],
          "name": "Header", "enabled": false, "prefilter": { "kind": "glob", "pattern": "*/api/*" },
          "methods": [], "resourceTypes": [], "stage": "request", "conditions": [],
          "action": { "kind": "hook", "source": "export default (ctx) => { … }" }
        }
      ]
    }
  ]
}
```

Reglas:

- `nahual` y `version` son obligatorios y van primero; `version` entero ≥ 1.
- `sites[].rules[]` usa `RuleDraftSchema` más `id`, `order` y `profileIds`; la acción `hook` lleva
  solo `kind` y `source` (sin `permissions`, `check` ni `imported`). `enabled` se exporta tal cual
  pero **se ignora al importar** (todo entra desactivado).
- Qué **no** viaja: relajaciones CORS, historial, pestañas del repeater, consola de hooks,
  `state`, ignorados del diff, ajustes distintos de `productionOrigins`, preferencias de interfaz.
- Redacción (FR-028): valores de condiciones `header`/`query` con nombre sensible, headers
  sensibles de un mock y campos sensibles del body JSON de un mock se sustituyen por
  `"<nahual:redacted>"`; `redacted.rules` lista las reglas afectadas. Con "Incluir valores
  sensibles" (confirmado) no se sustituye nada y `redacted.count` es 0.
- Codificación UTF-8, JSON con sangría de 2, claves en el orden del ejemplo (determinista salvo
  `exportedAt`).

## Importación (`parseConfig`)

Orden de comprobación; el primer fallo rechaza el archivo entero con `errorKey` y `path`:

1. Tamaño ≤ `importFileBytesMax` (`config_error_too_large`).
2. JSON válido (`config_error_not_json`).
3. `nahual === "config"` (`config_error_not_nahual`); `version` entero; `version >` actual ⇒
   `config_error_newer_version`; `version <` actual ⇒ migración encadenada (`MIGRATIONS`), que
   en v1 no existe pero cuya prueba exige que una versión desconocida falle.
4. `PortableConfigV1Schema` (`strictObject`; claves desconocidas ⇒ `config_error_invalid` con la
   ruta).
5. Coherencia: `profileIds` existentes dentro del mismo sitio; nombres de perfil únicos por sitio
   en el archivo; `order` únicos por sitio; JSONPath compilables.
6. Límites **sumando lo existente** (los pasa el panel y los vuelve a comprobar el SW):
   `rulesMax`, `hookTotalBytesMax`, `profilesPerSiteMax`, `productionOriginsMax`
   (`config_error_limit` con `[clave, actual, resultante, límite]`).

Después, la vista previa (`ImportPreview`) y, al confirmar, el comando `importConfig`
([panel-protocol.md](./panel-protocol.md)). En el SW (research R10): ids nuevos para reglas y
perfiles conservando la correspondencia, perfiles con nombre repetido ⇒ `"<nombre> (importado)"`,
reglas al final del orden del sitio, `enabled: false`, `imported`, hooks sin permisos y con el
`check` que calculó el panel, orígenes de producción añadidos sin quitar. Una regla con
`"<nahual:redacted>"` en algún valor queda desactivada y el SW rechaza `setRuleEnabled` para
ella con `rule_error_redacted_value` hasta que el dev lo reemplace.

## Pruebas

- Ida y vuelta: exportar ⇒ importar en un almacén vacío reproduce reglas, hooks, perfiles y
  orígenes (salvo lo excluido por diseño), todo desactivado (SC-008).
- 20 archivos inválidos/truncados de fixture ⇒ 20 rechazos con su clave y 0 cambios (SC-007).
- Versión 2 inventada ⇒ `config_error_newer_version`; versión 0 ⇒ `config_error_invalid`.
- Interrupción simulada entre la validación y la escritura ⇒ almacén intacto.
