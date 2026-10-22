import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  testIgnore: ["experiments/**"],
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: [["list"]],
  use: { trace: "retain-on-failure" },
  projects: [{ name: "chromium" }],
});
