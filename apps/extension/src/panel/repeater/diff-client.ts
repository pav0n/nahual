import type { ComparableResponse, DiffResult, RevealedValues } from "@nahual/domain";
import type { Ignores } from "@nahual/domain";
import { DiffReplySchema } from "./diff-protocol.ts";

/** Lo mínimo de `Worker` que usa el cliente (las pruebas lo simulan). */
export interface WorkerLike {
  postMessage(message: unknown): void;
  terminate(): void;
  addEventListener(type: "message", listener: (event: MessageEvent<unknown>) => void): void;
}

/** Crea el worker del diff (research R12); Vite lo empaqueta como archivo propio. */
export const createDiffWorker = (): WorkerLike =>
  new Worker(new URL("./diff.worker.ts", import.meta.url), { type: "module" });

export type DiffOutcome =
  | { ok: true; result: DiffResult; revealed: RevealedValues }
  | { ok: false; reason: "timeout" | "invalid" | "cancelled" | "error" };

/**
 * Cliente del worker del diff (005, research R12): una comparación a la vez (una nueva cancela la
 * anterior), timeout de 10 s y validación de cada respuesta. Solo acepta mensajes de la instancia
 * que creó y con el `requestId` en curso; uno inválido se descarta, se registra y la comparación
 * termina con error (principio I).
 */
export function createDiffClient(factory: () => WorkerLike = createDiffWorker, timeoutMs = 10_000) {
  let worker: WorkerLike | null = null;
  let seq = 0;
  let current: { requestId: number; finish(outcome: DiffOutcome): void } | null = null;

  const reset = () => {
    worker?.terminate();
    worker = null;
  };

  const ensure = () => {
    if (worker) return worker;
    const created = factory();
    created.addEventListener("message", (event) => {
      // Mensajes de un worker anterior (ya terminado) no cuentan.
      if (created !== worker || !current) return;
      const parsed = DiffReplySchema.safeParse(event.data);
      if (!parsed.success) {
        console.warn("[nahual] Respuesta inválida del worker del diff.");
        current.finish({ ok: false, reason: "invalid" });
        return;
      }
      if (parsed.data.requestId !== current.requestId) return;
      current.finish(
        parsed.data.type === "result"
          ? { ok: true, result: parsed.data.result, revealed: parsed.data.revealed }
          : { ok: false, reason: "error" },
      );
    });
    worker = created;
    return created;
  };

  return {
    compare(before: ComparableResponse, after: ComparableResponse, ignores: Ignores) {
      this.cancel();
      const requestId = ++seq;
      return new Promise<DiffOutcome>((resolve) => {
        const timer = setTimeout(() => {
          // Un diff que no termina se corta: el worker se descarta (research R12).
          reset();
          current?.finish({ ok: false, reason: "timeout" });
        }, timeoutMs);
        current = {
          requestId,
          finish: (outcome) => {
            clearTimeout(timer);
            current = null;
            resolve(outcome);
          },
        };
        ensure().postMessage({ type: "diff", requestId, before, after, ignores });
      });
    },
    cancel() {
      if (!current) return;
      reset();
      current.finish({ ok: false, reason: "cancelled" });
    },
  };
}
