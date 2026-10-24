import { defineConfig } from "@playwright/test";

const experiments = process.env.EXPERIMENTS === "1";

export default defineConfig({
  // `EXPERIMENTS=1 pnpm e2e` corre solo los experimentos de research.md (E1, E2, E4, D1).
  testDir: experiments ? "e2e/experiments" : "e2e",
  workers: 1,
  retries: 0,
  timeout: experiments ? 300_000 : 60_000,
  reporter: [["list"]],
  use: { trace: "retain-on-failure" },
  // Capturas por plataforma: las fuentes del sistema cambian entre Linux, macOS y Windows (004 R14).
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.01 } },
  projects: [
    { name: "chromium", testIgnore: experiments ? [] : ["experiments/**", "visual/**"] },
    // `pnpm --filter @nahual/extension e2e:visual`: regresión visual, fuera de la suite normal.
    { name: "visual", testDir: "e2e/visual" },
  ],
});
