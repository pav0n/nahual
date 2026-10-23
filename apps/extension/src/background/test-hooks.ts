/**
 * Fallos inyectables solo en el build de pruebas (`--mode test`), para que la E2E compruebe que
 * un error de Nahual nunca deja la página colgada (SC-003). En producción `import.meta.env.MODE`
 * se reemplaza al compilar y todo esto desaparece; `verify:dist` lo comprueba.
 */
export type Fault = "capture" | "engine" | "apply";

const faults = new Set<Fault>();

if (import.meta.env.MODE === "test") {
  (globalThis as { __nahualFaults?: Set<Fault> }).__nahualFaults = faults;
}

export function injectedFault(fault: Fault): boolean {
  return import.meta.env.MODE === "test" && faults.has(fault);
}

/**
 * Factor que divide la duración de las relajaciones CORS, para probar la expiración en segundos
 * (003, research R16). Solo existe en el build de pruebas.
 */
const corsTime = { scale: 1 };

if (import.meta.env.MODE === "test") {
  (globalThis as { __nahualCorsTimeScale?: { scale: number } }).__nahualCorsTimeScale = corsTime;
}

export function corsTimeScale(): number {
  return import.meta.env.MODE === "test" && corsTime.scale > 0 ? corsTime.scale : 1;
}

/**
 * Pestañas donde un experimento (`e2e/experiments/cdp-lab.ts`) maneja Fetch por su cuenta: el
 * FetchInterceptor no las toca. Solo existe en el build de pruebas.
 */
const labTabs = new Set<number>();

if (import.meta.env.MODE === "test") {
  (globalThis as { __nahualLabTabs?: Set<number> }).__nahualLabTabs = labTabs;
}

export function isLabTab(tabId: number): boolean {
  return import.meta.env.MODE === "test" && labTabs.has(tabId);
}
