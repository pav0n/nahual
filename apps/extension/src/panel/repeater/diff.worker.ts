/// <reference lib="webworker" />
// Worker del diff (005, research R12): corre fuera del hilo del panel. Por ahora solo responde
// al ping del experimento X3; el diff se añade en US2.

self.addEventListener("message", (event: MessageEvent<unknown>) => {
  const data = event.data as { type?: unknown } | null;
  if (data?.type === "ping") self.postMessage({ type: "pong" });
});
