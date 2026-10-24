import { defineConfig } from "@playwright/test";

const experiments = process.env.EXPERIMENTS === "1";

export default defineConfig({
  // `EXPERIMENTS=1 pnpm e2e` corre solo los experimentos de research.md (E1, E2, E4, D1).
  testDir: experiments ? "e2e/experiments" : "e2e",
  // Cada prueba abre su propio Chromium y sus servidores en puertos libres: corren en paralelo.
  // Por defecto, la mitad de los núcleos; `E2E_WORKERS=n` lo cambia (p. ej. 1 para depurar).
  // Con más workers que recursos, las pruebas de axe superan el timeout.
  // Los experimentos usan un puerto fijo de depuración (9339): en serie.
  workers: experiments ? 1 : process.env.E2E_WORKERS ? Number(process.env.E2E_WORKERS) : "50%",
  fullyParallel: !experiments,
  retries: 0,
  timeout: experiments ? 300_000 : 60_000,
  reporter: [["list"]],
  use: { trace: "retain-on-failure" },
  // Capturas por plataforma: las fuentes del sistema cambian entre Linux, macOS y Windows (004 R14).
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.01 } },
  projects: [
    {
      name: "chromium",
      testIgnore: experiments ? [] : ["experiments/**", "visual/**"],
      ...(experiments ? {} : { grepInvert: /@perf/ }),
    },
    // Las pruebas que miden tiempos (`@perf`) corren solas, después de las demás: con otros
    // Chromium en paralelo, la carga de CPU falsea la medición.
    {
      name: "perf",
      testIgnore: ["experiments/**", "visual/**"],
      grep: /@perf/,
      workers: 1,
      dependencies: ["chromium"],
    },
    // `pnpm --filter @nahual/extension e2e:visual`: regresión visual, fuera de la suite normal.
    // Puertos fijos (las URLs salen en las capturas): sus pruebas van en serie.
    { name: "visual", testDir: "e2e/visual", fullyParallel: false },
  ],
});
