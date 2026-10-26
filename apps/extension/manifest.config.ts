import { defineManifest } from "@crxjs/vite-plugin";
import pkg from "./package.json" with { type: "json" };

// Contrato: specs/001-spike-cdp/contracts/manifest.md. Cualquier permiso o campo nuevo requiere
// justificarlo en plan.md y actualizar tests/dist/manifest.test.ts.
/** CSP de la página sandbox (specs/006-hooks-typescript/contracts/manifest.md). */
export const SANDBOX_CSP =
  "sandbox allow-scripts; default-src 'none'; script-src 'self' 'unsafe-eval' blob:; " +
  "worker-src blob:; connect-src 'none'; img-src 'none'; style-src 'none'; " +
  "frame-src 'none'; form-action 'none'; base-uri 'none'";

export default defineManifest((env) => ({
  manifest_version: 3,
  name: "__MSG_extName__",
  description: "__MSG_extDescription__",
  default_locale: "es",
  version: pkg.version,
  minimum_chrome_version: "120",
  permissions: ["debugger", "storage"],
  // 005: contexto limpio del repeater. Ningún host se concede al instalar; el panel pide un
  // origen exacto al enviar (specs/005-repeater-diff/contracts/manifest.md).
  optional_host_permissions: ["http://*/*", "https://*/*"],
  // Solo el build de pruebas: Playwright no puede contestar el diálogo del permiso (research
  // X2), así que los servidores locales (127.0.0.1, cualquier puerto) ya tienen acceso.
  ...(env.mode === "test" ? { host_permissions: ["http://127.0.0.1/*"] } : {}),
  background: { service_worker: "src/background/index.ts", type: "module" },
  devtools_page: "src/devtools/devtools.html",
  // 006: el código de los hooks corre solo aquí, sin red ni chrome.* (constitución, research R2).
  sandbox: { pages: ["src/sandbox/hook-sandbox.html"] },
  content_security_policy: {
    extension_pages: "script-src 'self'; object-src 'self'",
    sandbox: SANDBOX_CSP,
  },
}));
