import {
  DebuggerError,
  type DebuggerErrorCode,
  type DebuggerPort,
  type DebuggerTarget,
  type DetachReason,
} from "./debugger-port.ts";

export const PROTOCOL_VERSION = "1.3";

/** Traduce los mensajes de error de `chrome.debugger` a códigos de Nahual. */
export function classifyDebuggerError(message: string): DebuggerErrorCode {
  if (/already attached/i.test(message)) return "already_attached";
  if (/cannot (access|attach)|chrome:\/\/|chrome-extension:\/\/|devtools:\/\//i.test(message)) {
    return "restricted_page";
  }
  if (/not attached/i.test(message)) return "not_attached";
  if (/invalid interceptionid/i.test(message)) return "invalid_interception";
  return "cdp_error";
}

function toDebuggerError(error: unknown): DebuggerError {
  const message = error instanceof Error ? error.message : String(error);
  return new DebuggerError(classifyDebuggerError(message), message);
}

async function call<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    throw toDebuggerError(error);
  }
}

export function createChromeDebugger(): DebuggerPort {
  return {
    attach: (tabId) => call(() => chrome.debugger.attach({ tabId }, PROTOCOL_VERSION)),
    detach: (tabId) => call(() => chrome.debugger.detach({ tabId })),
    send: <R>(tabId: number, method: string, params?: Record<string, unknown>) =>
      call(async () => (await chrome.debugger.sendCommand({ tabId }, method, params)) as R),
    getTargets: () =>
      call(async () =>
        (await chrome.debugger.getTargets()).map((target): DebuggerTarget => ({
          attached: target.attached,
          ...(target.tabId === undefined ? {} : { tabId: target.tabId }),
          ...(target.extensionId === undefined ? {} : { extensionId: target.extensionId }),
        })),
      ),
    onEvent(listener) {
      const handler = (source: chrome.debugger.Debuggee, method: string, params?: object) => {
        if (source.tabId !== undefined) listener(source.tabId, method, params);
      };
      chrome.debugger.onEvent.addListener(handler);
      return () => chrome.debugger.onEvent.removeListener(handler);
    },
    onDetach(listener) {
      const handler = (source: chrome.debugger.Debuggee, reason: string) => {
        if (source.tabId !== undefined) listener(source.tabId, reason as DetachReason);
      };
      chrome.debugger.onDetach.addListener(handler);
      return () => chrome.debugger.onDetach.removeListener(handler);
    },
  };
}
