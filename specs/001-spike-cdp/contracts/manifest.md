# Contrato: manifest MV3 de 001

Generado desde `apps/extension/manifest.config.ts`. Cualquier campo nuevo requiere actualizar
`plan.md` (permisos) y este contrato.

```jsonc
{
  "manifest_version": 3,
  "name": "__MSG_extName__",
  "description": "__MSG_extDescription__",
  "default_locale": "es",
  "version": "0.1.0",
  "minimum_chrome_version": "120",
  "permissions": ["debugger", "storage"],
  "background": { "service_worker": "<bundle del SW>", "type": "module" },
  "devtools_page": "src/devtools/devtools.html",
  "content_security_policy": {
    "extension_pages": "script-src 'self'; object-src 'self'"
  }
}
```

Ausentes a propósito en 001: `host_permissions`, `optional_host_permissions`, `content_scripts`,
`externally_connectable`, `web_accessible_resources`, `sandbox`.

Prueba: un test de build lee el `manifest.json` generado y falla si aparece un permiso o campo
fuera de esta lista, o si `_locales/es` y `_locales/en` no tienen las mismas claves.
