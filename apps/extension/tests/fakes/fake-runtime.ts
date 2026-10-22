import type { PortLike, RuntimeLike } from "../../src/background/panel-port.ts";

export const EXTENSION_ID = "nahualtestextensionid";
export const PANEL_URL = `chrome-extension://${EXTENSION_ID}/src/panel/panel.html`;

/** Extremo del panel de un puerto simulado. */
export class FakePort implements PortLike {
  readonly received: unknown[] = [];
  disconnected = false;
  private messageListeners: ((msg: unknown) => void)[] = [];
  private disconnectListeners: (() => void)[] = [];

  constructor(
    readonly name: string,
    readonly sender: { id?: string; url?: string },
  ) {}

  onMessage = { addListener: (fn: (msg: unknown) => void) => void this.messageListeners.push(fn) };
  onDisconnect = { addListener: (fn: () => void) => void this.disconnectListeners.push(fn) };

  /** El SW envía al panel. */
  postMessage(msg: unknown) {
    if (this.disconnected) throw new Error("Attempting to use a disconnected port object");
    this.received.push(msg);
  }

  /** El SW cierra el puerto: como en Chrome, no dispara su propio onDisconnect. */
  disconnect() {
    this.disconnected = true;
  }

  /** El panel envía al SW. */
  fromPanel(msg: unknown) {
    for (const fn of this.messageListeners) fn(msg);
  }

  /** El panel se cierra: dispara onDisconnect en el SW. */
  closeFromPanel() {
    this.disconnected = true;
    for (const fn of this.disconnectListeners) fn();
  }
}

export class FakeRuntime implements RuntimeLike {
  readonly id = EXTENSION_ID;
  private connectListeners: ((port: PortLike) => void)[] = [];

  onConnect = {
    addListener: (fn: (port: PortLike) => void) => void this.connectListeners.push(fn),
  };

  getURL(path: string) {
    return `chrome-extension://${EXTENSION_ID}/${path}`;
  }

  connect(
    name = "nahual-panel",
    sender: { id?: string; url?: string } = { id: EXTENSION_ID, url: PANEL_URL },
  ) {
    const port = new FakePort(name, sender);
    for (const fn of this.connectListeners) fn(port);
    return port;
  }
}
