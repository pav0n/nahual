import { defineConfig } from "@playwright/test";

export default defineConfig({
  // `EXPERIMENTS=1 pnpm e2e` corre solo los experimentos de research.md (E1, E2, E4).
  testDir: process.env.EXPERIMENTS === "1" ? "e2e/experiments" : "e2e",
  testIgnore: process.env.EXPERIMENTS === "1" ? [] : ["experiments/**"],
  workers: 1,
  retries: 0,
  timeout: process.env.EXPERIMENTS === "1" ? 300_000 : 60_000,
  reporter: [["list"]],
  use: { trace: "retain-on-failure" },
  projects: [{ name: "chromium" }],
});
