import {
  DebuggerError,
  type DebuggerErrorCode,
  type DebuggerPort,
  type DebuggerTarget,
  type DetachReason,
} from "../../src/background/debugger-port.ts";

type Responder = (params: unknown) => unknown;

/** CDP simulado en memoria. Registra cada comando y permite inyectar eventos y errores. */
export class FakeDebugger implements DebuggerPort {
  readonly attached = new Set<number>();
  readonly sent: { tabId: number; method: string; params: unknown }[] = [];
  /** Targets extra (p. ej. sesiones de otras extensiones o huérfanas) para `getTargets`. */
  extraTargets: DebuggerTarget[] = [];

  private attachError: DebuggerErrorCode | null = null;
  private detachError: DebuggerErrorCode | null = null;
  private sendErrors = new Map<string, DebuggerErrorCode[]>();
  private responders = new Map<string, Responder>();
  private eventListeners = new Set<(tabId: number, method: string, params: unknown) => void>();
  private detachListeners = new Set<(tabId: number, reason: DetachReason) => void>();

  failNextAttach(code: DebuggerErrorCode) {
    this.attachError = code;
  }

  failNextDetach(code: DebuggerErrorCode) {
    this.detachError = code;
  }

  /** Hace fallar las próximas llamadas a `method` con los códigos dados, en orden. */
  failSend(method: string, ...codes: DebuggerErrorCode[]) {
    this.sendErrors.set(method, [...(this.sendErrors.get(method) ?? []), ...codes]);
  }

  respond(method: string, responder: Responder) {
    this.responders.set(method, responder);
  }

  /** Parámetros de cada llamada a `method`, en orden. */
  calls<P = Record<string, unknown>>(method: string, tabId?: number): P[] {
    return this.sent
      .filter((s) => s.method === method && (tabId === undefined || s.tabId === tabId))
      .map((s) => s.params as P);
  }

  sentMethods(tabId?: number) {
    return this.sent.filter((s) => tabId === undefined || s.tabId === tabId).map((s) => s.method);
  }

  async attach(tabId: number) {
    if (this.attachError) {
      const code = this.attachError;
      this.attachError = null;
      throw new DebuggerError(code, `fake attach error: ${code}`);
    }
    if (this.attached.has(tabId)) throw new DebuggerError("already_attached", "already attached");
    this.attached.add(tabId);
  }

  async detach(tabId: number) {
    if (this.detachError) {
      const code = this.detachError;
      this.detachError = null;
      throw new DebuggerError(code, `fake detach error: ${code}`);
    }
    if (!this.attached.delete(tabId)) throw new DebuggerError("not_attached", "not attached");
  }

  async send<R>(tabId: number, method: string, params?: Record<string, unknown>): Promise<R> {
    this.sent.push({ tabId, method, params });
    const queued = this.sendErrors.get(method);
    const code = queued?.shift();
    if (code) throw new DebuggerError(code, `fake send error: ${code}`);
    if (!this.attached.has(tabId)) throw new DebuggerError("not_attached", "not attached");
    return (this.responders.get(method)?.(params) ?? {}) as R;
  }

  /** Como Chrome: `attached` no dice qué cliente está adjunto (research D6). */
  async getTargets(): Promise<DebuggerTarget[]> {
    const own = [...this.attached].map((tabId) => ({ tabId, attached: true }));
    return [...own, ...this.extraTargets];
  }

  onEvent(listener: (tabId: number, method: string, params: unknown) => void) {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  onDetach(listener: (tabId: number, reason: DetachReason) => void) {
    this.detachListeners.add(listener);
    return () => this.detachListeners.delete(listener);
  }

  /** Emite un evento CDP como si viniera de la pestaña. */
  emit(tabId: number, method: string, params: unknown) {
    for (const listener of this.eventListeners) listener(tabId, method, params);
  }

  /** Simula un detach externo (barra de aviso, pestaña cerrada…). */
  externalDetach(tabId: number, reason: DetachReason) {
    this.attached.delete(tabId);
    for (const listener of this.detachListeners) listener(tabId, reason);
  }
}
