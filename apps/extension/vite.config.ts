import { crx } from "@crxjs/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import manifest from "./manifest.config.ts";

// `vite build` genera el paquete de producción en dist/; `vite build --mode test` genera
// dist-test/, el único build que acepta el parámetro de pruebas del panel (ver research D7).
export default defineConfig(({ mode }) => ({
  plugins: [react(), crx({ manifest })],
  build: {
    outDir: mode === "test" ? "dist-test" : "dist",
    emptyOutDir: true,
    target: "chrome120",
    sourcemap: false,
    // Chrome soporta modulepreload: sin el polyfill de Vite, que usa fetch().
    modulePreload: { polyfill: false },
    rollupOptions: {
      // 006: la página sandbox de hooks; crxjs la copia pero no procesa su script.
      input: { panel: "src/panel/panel.html", sandbox: "src/sandbox/hook-sandbox.html" },
    },
  },
}));
