// Página sandbox de los hooks (006, research R2/R3, contracts/sandbox-messaging.md). Origen opaco,
// sin chrome.* y sin red (CSP de sandbox del manifest). Transpila con Sucrase y ejecuta cada hook
// en su propio Worker, cortado con terminate() al agotar su tiempo.
import { PanelToSandboxSchema, type HookOutcome, type PanelToSandbox } from "@nahual/hook-runtime";
import { transform } from "sucrase";
import { WORKER_SOURCE } from "./worker-runtime.ts";

type Run = Extract<PanelToSandbox, { type: "run" }>;

/** Origen del panel, sacado de la URL propia: el origen de esta página es "null". */
const PANEL_ORIGIN = new URL(location.href).origin;
const IDLE_MS = 60_000;

const channel = new MessageChannel();
const port = channel.port1;
const workerUrl = URL.createObjectURL(new Blob([WORKER_SOURCE], { type: "text/javascript" }));

/** JS transpilado por hash del código: se transpila una vez por versión de un hook. */
const compiled = new Map<string, { js: string } | { error: string; line: number | null }>();

interface Entry {
  worker: Worker;
  /** Ejecuciones en curso: al cortar el Worker, todas terminan por tiempo. */
  inflight: Map<string, ReturnType<typeof setTimeout>>;
  idle: ReturnType<typeof setTimeout> | undefined;
}
const workers = new Map<string, Entry>();

const reply = (execId: string, outcome: HookOutcome) =>
  port.postMessage({ type: "result", execId, outcome });

const errorOutcome = (
  type: Extract<HookOutcome, { kind: "error" }>["type"],
  message: string,
  line: number | null = null,
  durationMs = 0,
): HookOutcome => ({ kind: "error", type, message, line, logs: [], durationMs });

function compile(codeHash: string, source: string | null) {
  const cached = compiled.get(codeHash);
  if (cached) return cached;
  if (source === null) return { error: "Hook code not available", line: null };
  try {
    const result = { js: transform(source, { transforms: ["typescript", "imports"] }).code };
    compiled.set(codeHash, result);
    return result;
  } catch (error) {
    const message = String((error as Error).message ?? error);
    const line = /\((\d+):\d+\)/.exec(message);
    const result = { error: message, line: line ? Number(line[1]) : null };
    compiled.set(codeHash, result);
    return result;
  }
}

/** Cierra los Workers de un hook; lo que estaba en curso termina por tiempo. */
function dispose(ruleId: string, durationMs = 0) {
  for (const [key, entry] of workers) {
    if (!key.startsWith(`${ruleId}:`)) continue;
    entry.worker.terminate();
    for (const [execId, timer] of entry.inflight) {
      clearTimeout(timer);
      reply(execId, errorOutcome("timeout", "hook_error_timeout", null, durationMs));
    }
    clearTimeout(entry.idle);
    workers.delete(key);
  }
}

function scheduleIdle(key: string, entry: Entry) {
  clearTimeout(entry.idle);
  if (entry.inflight.size > 0) return;
  entry.idle = setTimeout(() => {
    entry.worker.terminate();
    workers.delete(key);
  }, IDLE_MS);
}

function workerFor(ruleId: string, codeHash: string, js: string): Entry {
  const key = `${ruleId}:${codeHash}`;
  const existing = workers.get(key);
  if (existing) return existing;
  // Otra versión del mismo hook: su Worker ya no sirve.
  dispose(ruleId);
  const worker = new Worker(workerUrl);
  const entry: Entry = { worker, inflight: new Map(), idle: undefined };
  worker.onmessage = (event: MessageEvent) => {
    const { type, execId, outcome } = (event.data ?? {}) as Record<string, unknown>;
    if (type !== "done" || typeof execId !== "string") return;
    const timer = entry.inflight.get(execId);
    if (timer === undefined) return;
    clearTimeout(timer);
    entry.inflight.delete(execId);
    // El panel valida la forma con HookOutcomeSchema antes de usarlo.
    reply(execId, outcome as HookOutcome);
    scheduleIdle(key, entry);
  };
  worker.postMessage({ type: "load", codeHash, js });
  workers.set(key, entry);
  return entry;
}

function run(message: Run) {
  const code = compile(message.codeHash, message.source);
  if ("error" in code) {
    reply(message.execId, errorOutcome("exception", code.error, code.line));
    return;
  }
  const entry = workerFor(message.ruleId, message.codeHash, code.js);
  clearTimeout(entry.idle);
  // Los 2 s cuentan desde aquí: el arranque del sandbox y de Sucrase no (FR-020, R2).
  const timer = setTimeout(() => dispose(message.ruleId, message.timeoutMs), message.timeoutMs);
  entry.inflight.set(message.execId, timer);
  entry.worker.postMessage({
    type: "exec",
    execId: message.execId,
    codeHash: message.codeHash,
    context: message.context,
    state: message.state,
  });
}

port.onmessage = (event: MessageEvent) => {
  if (import.meta.env.MODE === "test" && probe(event.data)) return;
  const parsed = PanelToSandboxSchema.safeParse(event.data);
  if (!parsed.success) {
    console.warn("[nahual-sandbox] mensaje descartado");
    return;
  }
  if (parsed.data.type === "run") run(parsed.data);
  else dispose(parsed.data.ruleId);
};

parent.postMessage({ type: "hello", v: 1 }, PANEL_ORIGIN, [channel.port2]);
const warmup = performance.now();
transform("export default (ctx: unknown) => ctx;", { transforms: ["typescript", "imports"] });
port.postMessage({ type: "ready", sucraseMs: performance.now() - warmup });

/**
 * Sonda solo del build de pruebas (experimentos X1 y X2): ejecuta un texto en un Worker propio o
 * en la página, para comprobar qué permite la CSP. No existe en producción (tests/dist).
 */
let probeWorker: Worker | undefined;
const PROBE_WORKER = `self.onmessage = async (event) => {
  try {
    const value = await new Function(event.data)();
    postMessage({ ok: true, value: String(value) });
  } catch (error) {
    postMessage({ ok: false, name: error?.name, message: String(error?.message ?? error),
      stack: String(error?.stack ?? "") });
  }
};`;
function probe(data: unknown): boolean {
  if (import.meta.env.MODE !== "test") return false;
  const p = data as { type?: string; id: number; where: string; code: string; ms: number };
  if (p?.type !== "probe") return false;
  const answer = (result: unknown) => port.postMessage({ type: "probe", id: p.id, result });
  const url = URL.createObjectURL(new Blob([PROBE_WORKER], { type: "text/javascript" }));
  if (p.where === "page") {
    void (async () => {
      try {
        answer({ ok: true, value: String(await new Function(p.code)()) });
      } catch (error) {
        const e = error as Error;
        answer({ ok: false, name: e?.name, message: String(e?.message ?? e) });
      }
    })();
    return true;
  }
  if (p.where === "warm") {
    probeWorker ??= new Worker(url);
    const started = performance.now();
    probeWorker.onmessage = () => answer({ ok: true, value: String(performance.now() - started) });
    probeWorker.postMessage(p.code);
    return true;
  }
  const worker = new Worker(url);
  const timer = setTimeout(() => {
    worker.terminate();
    answer({ ok: false, name: "TimedOut", message: "terminated" });
  }, p.ms);
  worker.onmessage = (message) => {
    clearTimeout(timer);
    worker.terminate();
    answer(message.data);
  };
  worker.postMessage(p.code);
  return true;
}
