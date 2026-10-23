import { createBackground } from "./app.ts";
import { createChromeDebugger } from "./chrome-debugger.ts";
import type { RuntimeLike } from "./panel-port.ts";
import { createChromeLocalStorage } from "./storage-port.ts";

// Todo se registra de forma síncrona al cargar el SW (requisito de MV3 para que los eventos de
// chrome.debugger y runtime.onConnect lo despierten); el procesamiento espera a la limpieza.
createBackground({
  debugger: createChromeDebugger(),
  runtime: chrome.runtime as unknown as RuntimeLike,
  sessionStorage: chrome.storage.session,
  localStorage: createChromeLocalStorage(),
});
