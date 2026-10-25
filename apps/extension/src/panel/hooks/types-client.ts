import { hashSource } from "@nahual/hook-runtime";
import type { HookCompletion, HookDiagnostic } from "./hook-types-service.ts";
import { TypesReplySchema, type TypesReply, type TypesRequest } from "./types-protocol.ts";

/** Lo mínimo de `Worker` que usa el cliente (las pruebas lo simulan). */
export interface WorkerLike {
  postMessage(message: unknown): void;
  terminate(): void;
  addEventListener(type: "message", listener: (event: MessageEvent<unknown>) => void): void;
}

export const createTypesWorker = (): WorkerLike =>
  new Worker(new URL("./hook-types.worker.ts", import.meta.url), { type: "module" });

/** Resultado del análisis de un código: diagnósticos y el `check` que se guarda con la regla. */
export interface TypesCheck {
  diagnostics: HookDiagnostic[];
  check: { hash: string; ok: boolean };
}

/**
 * Cliente del Worker de tipos (006, research R4): solo acepta respuestas válidas de su instancia
 * y de la petición que espera; las demás se descartan y se registran (principio I).
 */
export function createTypesClient(factory: () => WorkerLike = createTypesWorker) {
  const worker = factory();
  let seq = 0;
  const pending = new Map<number, (reply: TypesReply) => void>();
  worker.addEventListener("message", (event) => {
    const parsed = TypesReplySchema.safeParse(event.data);
    if (!parsed.success) {
      console.warn("[nahual] Respuesta inválida del worker de tipos.");
      return;
    }
    pending.get(parsed.data.id)?.(parsed.data);
    pending.delete(parsed.data.id);
  });
  type Ask = TypesRequest extends infer R
    ? R extends TypesRequest
      ? Omit<R, "id">
      : never
    : never;
  const ask = <T extends TypesReply["type"]>(request: Ask) =>
    new Promise<Extract<TypesReply, { type: T }>>((resolve) => {
      const id = ++seq;
      pending.set(id, resolve as (reply: TypesReply) => void);
      worker.postMessage({ ...request, id });
    });

  return {
    async check(source: string): Promise<TypesCheck> {
      const reply = await ask<"diagnostics">({ type: "update", source });
      return {
        diagnostics: reply.diagnostics,
        check: {
          hash: hashSource(source),
          ok: !reply.diagnostics.some((d) => d.severity === "error"),
        },
      };
    },
    /** Completado en `position` del código actual (el Worker lo analiza antes). */
    async complete(source: string, position: number): Promise<HookCompletion[]> {
      void ask<"diagnostics">({ type: "update", source });
      return (await ask<"completions">({ type: "complete", position })).completions.map((c) => ({
        label: c.label,
        kind: c.kind,
        ...(c.detail === undefined ? {} : { detail: c.detail }),
      }));
    },
    async info(source: string, position: number): Promise<string | null> {
      void ask<"diagnostics">({ type: "update", source });
      return (await ask<"info">({ type: "info", position })).text;
    },
    dispose() {
      worker.terminate();
      pending.clear();
    },
  };
}

export type TypesClient = ReturnType<typeof createTypesClient>;
