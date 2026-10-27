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
      output: {
        // 006: lo que comparten el panel y el sandbox de hooks (Zod y los paquetes puros) va en
        // un chunk propio; si no, el sandbox importaría el chunk de entrada del panel.
        // 007: exportadores, formato portable y Requestly viajan con el diálogo que los usa, que
        // se carga aparte; en `shared` entrarían en la carga inicial (T069).
        manualChunks: (id: string) =>
          /packages\/domain\/src\/(export|portable|requestly)\/(?!formats\.ts)/.test(id)
            ? undefined
            : /node_modules\/zod\/|packages\/(domain|hook-runtime)\/|json-p3/.test(id)
              ? "shared"
              : undefined,
      },
    },
  },
}));
