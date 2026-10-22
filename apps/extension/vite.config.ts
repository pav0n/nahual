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
    rollupOptions: {
      input: { panel: "src/panel/panel.html" },
    },
  },
}));
