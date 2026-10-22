// Extensión auxiliar de la E2E: actúa como segundo cliente de chrome.debugger.
// La prueba la controla con worker.evaluate(); no escucha mensajes de nadie.
globalThis.conflict = {
  attach: (tabId) => chrome.debugger.attach({ tabId }, "1.3"),
  detach: (tabId) => chrome.debugger.detach({ tabId }),
};
