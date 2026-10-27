# Contrato: manifest (007)

| Campo | Antes (006) | Después (007) |
|---|---|---|
| `version` | `0.6.0` | `1.0.0` (desde `apps/extension/package.json`; el tag `v1.0.0` debe coincidir) |
| `permissions` | `["debugger", "storage"]` | **sin cambios** |
| `optional_host_permissions` | `http://*/*`, `https://*/*` | sin cambios |
| `host_permissions` | solo en `--mode test` | sin cambios |
| `sandbox.pages`, CSP | de 006 | sin cambios |
| `icons` | — | `{ "16": "icons/icon-16.png", "32": "icons/icon-32.png", "48": "icons/icon-48.png", "128": "icons/icon-128.png" }` |

- Los PNG salen de `docs/brand/nahual.svg` (fuente del logo, pendiente de aprobación del
  usuario) rasterizados una vez con ImageMagick y commiteados junto con el SVG y la versión
  monocroma `nahual-mono.svg`; no se añade un rasterizador a la cadena de build, así el paquete
  sigue siendo reproducible sin herramientas nuevas.
- Sin `clipboardWrite`, `downloads`, `unlimitedStorage`, `alarms` ni `declarativeNetRequest*`
  (research R15).
- `tests/dist/manifest.test.ts` comprueba versión, iconos presentes en `dist/` y que
  `permissions` no cambió.
- El icono del panel de DevTools (`chrome.devtools.panels.create`) usa `icons/panel-16.png`
  (versión monocroma) si Chrome lo muestra; se verifica en la implementación.
