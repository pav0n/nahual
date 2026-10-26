import { SandboxToPanelSchema, type HookContextData, type HookOutcome } from "@nahual/hook-runtime";

/** Un `message` de `window` (las pruebas lo simulan). */
export interface WindowMessage {
  source: unknown;
  origin: string;
  data: unknown;
  ports: readonly MessagePort[];
}

/** Iframe de la página sandbox y escucha de `window` (las pruebas lo simulan). */
export interface SandboxFrame {
  create(onLoad: () => void): { window: unknown; destroy(): void };
  listen(listener: (message: WindowMessage) => void): () => void;
}

const SANDBOX_URL = "/src/sandbox/hook-sandbox.html";

/** El iframe oculto real del panel. */
export const domFrame: SandboxFrame = {
  create(onLoad) {
    const iframe = document.createElement("iframe");
    iframe.src = SANDBOX_URL;
    iframe.hidden = true;
    iframe.title = "Nahual hooks sandbox";
    iframe.tabIndex = -1;
    iframe.setAttribute("aria-hidden", "true");
    iframe.addEventListener("load", onLoad);
    document.body.append(iframe);
    return { window: iframe.contentWindow, destroy: () => iframe.remove() };
  },
  listen(listener) {
    const onMessage = (event: MessageEvent) =>
      listener({
        source: event.source,
        origin: event.origin,
        data: event.data,
        ports: event.ports,
      });
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  },
};

export interface RunRequest {
  execId: string;
  ruleId: string;
  codeHash: string;
  source: string;
  context: HookContextData;
  state: unknown;
  timeoutMs: number;
}

/** Margen del panel sobre el corte del sandbox, por si el sandbox no contesta nunca. */
const SLACK_MS = 1_000;

const failed = (type: "timeout" | "access_denied", message: string): HookOutcome => ({
  kind: "error",
  type,
  message,
  line: null,
  logs: [],
  durationMs: 0,
});

/**
 * Canal del panel con la página sandbox de hooks (006, research R2, contracts/
 * sandbox-messaging.md): crea el iframe, acepta un único `hello` de su ventana con origen
 * `"null"` y desde ahí habla solo por el `MessagePort` que recibió, sin `targetOrigin "*"`. Cada
 * respuesta se valida y solo cuenta si corresponde a una ejecución pedida.
 */
export function createSandboxClient(frames: SandboxFrame = domFrame) {
  let frame: { window: unknown; destroy(): void } | null = null;
  let port: MessagePort | null = null;
  let ready: Promise<void> | null = null;
  let isReady = false;
  let loads = 0;
  /** Hashes cuyo código ya tiene el sandbox actual. */
  let sent = new Set<string>();
  const pending = new Map<
    string,
    { resolve(outcome: HookOutcome): void; timer: ReturnType<typeof setTimeout> }
  >();

  const settle = (execId: string, outcome: HookOutcome) => {
    const entry = pending.get(execId);
    if (!entry) return;
    clearTimeout(entry.timer);
    pending.delete(execId);
    entry.resolve(outcome);
  };

  const reset = (reason: "access_denied" | null) => {
    frame?.destroy();
    port?.close();
    frame = null;
    port = null;
    ready = null;
    isReady = false;
    loads = 0;
    sent = new Set();
    if (reason)
      for (const execId of [...pending.keys()])
        settle(execId, failed(reason, "hook_error_sandbox_navigated"));
  };

  const start = (): Promise<void> => {
    if (ready) return ready;
    ready = new Promise<void>((resolve) => {
      let created: { window: unknown; destroy(): void } | null = null;
      const stop = frames.listen((message) => {
        const hello = SandboxToPanelSchema.safeParse(message.data);
        if (
          !created ||
          message.source !== created.window ||
          message.origin !== "null" ||
          !hello.success ||
          hello.data.type !== "hello" ||
          !message.ports[0]
        ) {
          console.warn("[nahual] Mensaje ajeno al sandbox de hooks descartado.");
          return;
        }
        stop();
        const opened = message.ports[0];
        port = opened;
        opened.onmessage = (event: MessageEvent) => {
          const parsed = SandboxToPanelSchema.safeParse(event.data);
          if (!parsed.success) {
            console.warn("[nahual] Respuesta inválida del sandbox de hooks descartada.");
            return;
          }
          if (parsed.data.type === "ready") {
            isReady = true;
            resolve();
          } else if (parsed.data.type === "result") {
            if (!pending.has(parsed.data.execId))
              console.warn("[nahual] Resultado de una ejecución desconocida descartado.");
            settle(parsed.data.execId, parsed.data.outcome);
          }
        };
      });
      created = frames.create(() => {
        // El primer `load` es el normal; otro significa que el iframe navegó: fuera.
        loads += 1;
        if (loads > 1) reset("access_denied");
      });
      frame = created;
    });
    return ready;
  };

  return {
    /** Precalienta el sandbox (R2): al abrir el panel con hooks activos. */
    warm: start,
    isReady: () => isReady,
    async run(request: RunRequest): Promise<HookOutcome> {
      const outcome = new Promise<HookOutcome>((resolve) => {
        const timer = setTimeout(
          () => settle(request.execId, failed("timeout", "hook_error_timeout")),
          request.timeoutMs + SLACK_MS,
        );
        pending.set(request.execId, { resolve, timer });
      });
      await start();
      // El reloj del panel corre desde que el sandbox está listo (el arranque no cuenta).
      const entry = pending.get(request.execId);
      if (entry) {
        clearTimeout(entry.timer);
        entry.timer = setTimeout(
          () => settle(request.execId, failed("timeout", "hook_error_timeout")),
          request.timeoutMs + SLACK_MS,
        );
      }
      const source = sent.has(request.codeHash) ? null : request.source;
      sent.add(request.codeHash);
      port?.postMessage({ type: "run", ...request, source });
      return outcome;
    },
    dispose(ruleId: string) {
      port?.postMessage({ type: "dispose", ruleId });
    },
    destroy() {
      reset(null);
    },
  };
}

export type SandboxClient = ReturnType<typeof createSandboxClient>;
