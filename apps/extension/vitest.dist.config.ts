import { defineConfig } from "vitest/config";

// Pruebas sobre los builds generados (dist/ y dist-test/); las corre `pnpm verify:dist`.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/dist/**/*.test.ts"],
  },
});
