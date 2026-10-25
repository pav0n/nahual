# Contrato: manifest (006)

Cambios respecto de 005 (`apps/extension/manifest.config.ts`, verificado en
`tests/dist/manifest.test.ts`):

```ts
version: "0.6.0",
sandbox: { pages: ["src/sandbox/hook-sandbox.html"] },
content_security_policy: {
  extension_pages: "script-src 'self'; object-src 'self'",            // sin cambios
  sandbox:
    "sandbox allow-scripts; default-src 'none'; script-src 'self' 'unsafe-eval' blob:; " +
    "worker-src blob:; connect-src 'none'; img-src 'none'; style-src 'none'; " +
    "frame-src 'none'; form-action 'none'; base-uri 'none'",
},
```

- **Sin permisos nuevos**: `permissions` sigue `["debugger", "storage"]`;
  `optional_host_permissions` sin cambios; el build de pruebas conserva su `host_permissions`.
- `'unsafe-eval'` existe **solo** en la CSP de `sandbox` (constitución: `eval` solo en el
  sandbox). `tests/dist` comprueba que `extension_pages` no la tiene y que `new Function` aparece
  solo en el bundle del sandbox.
- La página sandbox no está en `web_accessible_resources`: solo la carga el panel.
