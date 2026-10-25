// Página sandbox de los hooks (006, research R2): canal con el panel, Sucrase y Workers.
// Origen opaco, sin chrome.* y sin red (CSP de sandbox del manifest).

/** Origen del panel, sacado de la URL propia: el origen de esta página es "null". */
const PANEL_ORIGIN = new URL(location.href).origin;

const channel = new MessageChannel();
parent.postMessage({ type: "hello", v: 1 }, PANEL_ORIGIN, [channel.port2]);
const port = channel.port1;

/**
 * Sonda solo del build de pruebas (experimento X1): ejecuta un texto en un Worker creado desde un
 * `Blob` o en la propia página, para comprobar qué permite la CSP. No existe en producción
 * (tests/dist).
 */
if (import.meta.env.MODE === "test") {
  const WORKER = `self.onmessage = async (event) => {
    try {
      const value = await new Function(event.data)();
      postMessage({ ok: true, value: String(value) });
    } catch (error) {
      postMessage({ ok: false, name: error?.name, message: String(error?.message ?? error),
        stack: String(error?.stack ?? "") });
    }
  };`;
  const workerUrl = URL.createObjectURL(new Blob([WORKER], { type: "text/javascript" }));
  let warm: Worker | undefined;
  port.onmessage = async (event: MessageEvent) => {
    const probe = event.data as {
      type: string;
      id: number;
      where: string;
      code: string;
      ms: number;
    };
    if (probe?.type !== "probe") return;
    const reply = (result: unknown) => port.postMessage({ type: "probe", id: probe.id, result });
    if (probe.where === "page") {
      try {
        reply({ ok: true, value: String(await new Function(probe.code)()) });
      } catch (error) {
        const e = error as Error;
        reply({ ok: false, name: e?.name, message: String(e?.message ?? e) });
      }
      return;
    }
    if (probe.where === "warm") {
      warm ??= new Worker(workerUrl);
      const started = performance.now();
      warm.onmessage = () => reply({ ok: true, value: String(performance.now() - started) });
      warm.postMessage(probe.code);
      return;
    }
    let worker: Worker;
    try {
      worker = new Worker(workerUrl);
    } catch (error) {
      reply({ ok: false, name: "WorkerCreate", message: String((error as Error)?.message) });
      return;
    }
    const timer = setTimeout(() => {
      worker.terminate();
      reply({ ok: false, name: "TimedOut", message: "terminated" });
    }, probe.ms);
    worker.onmessage = (message) => {
      clearTimeout(timer);
      worker.terminate();
      reply(message.data);
    };
    worker.onerror = (error) => {
      clearTimeout(timer);
      reply({ ok: false, name: "WorkerError", message: error.message });
    };
    worker.postMessage(probe.code);
  };
}
