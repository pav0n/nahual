import { defineManifest } from "@crxjs/vite-plugin";
import pkg from "./package.json" with { type: "json" };

// Contrato: specs/001-spike-cdp/contracts/manifest.md. Cualquier permiso o campo nuevo requiere
// justificarlo en plan.md y actualizar tests/dist/manifest.test.ts.
export default defineManifest({
  manifest_version: 3,
  name: "__MSG_extName__",
  description: "__MSG_extDescription__",
  default_locale: "es",
  version: pkg.version,
  minimum_chrome_version: "120",
  permissions: ["debugger", "storage"],
  background: { service_worker: "src/background/index.ts", type: "module" },
  devtools_page: "src/devtools/devtools.html",
  content_security_policy: {
    extension_pages: "script-src 'self'; object-src 'self'",
  },
});
