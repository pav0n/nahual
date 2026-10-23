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
