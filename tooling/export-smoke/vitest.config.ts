import { defineConfig } from "vitest/config";

// Ejecuta de verdad lo que exportan los exportadores de 007 (research R12): fuera de la
// extensión, para que MSW no entre en el bundle ni en el SBOM.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 30_000,
  },
});
