/** Crea el worker del diff (research R12); Vite lo empaqueta como archivo propio. */
export const createDiffWorker = () =>
  new Worker(new URL("./diff.worker.ts", import.meta.url), { type: "module" });
