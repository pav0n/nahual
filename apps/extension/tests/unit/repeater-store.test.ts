import type { RepeaterRequest, RepeaterSend } from "@nahual/domain";
import { beforeEach, describe, expect, it } from "vitest";
import { usePanelStore } from "../../src/panel/store/index.ts";
import type { SwPayload } from "@nahual/protocol";

// 005 (research R13; FR-002, FR-004, FR-018 a FR-021): pestañas del repeater en memoria.

const store = () => usePanelStore.getState();
const request = (url = "https://api.test/items"): RepeaterRequest => ({
  method: "GET",
  url,
  headers: [],
  body: { kind: "none" },
});
const send = (sendId: string): RepeaterSend => ({
  sendId,
  request: request(),
  mode: "page",
  startedAt: 1,
  state: "pending",
  response: null,
  error: null,
  durationMs: null,
  size: null,
  preflight: null,
  ruleEffects: [],
  relaxed: false,
  cors: null,
  notSentHeaders: [],
  exchangeId: null,
});
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

beforeEach(() => {
  usePanelStore.setState({ repeaterTabs: [], activeRepeaterTab: null, recentlyClosedTab: null });
});

describe("store del repeater", () => {
  it("abre una pestaña desde un request, en contexto de página, y la activa", () => {
    const id = store().openRepeaterTab({ name: "GET /items", request: request(), source: null });
    expect(id).not.toBeNull();
    expect(store().repeaterTabs).toEqual([
      expect.objectContaining({ id, name: "GET /items", mode: "page", sends: [], droppedCount: 0 }),
    ]);
    expect(store().activeRepeaterTab).toBe(id);
  });

  it("pestaña vacía: GET con URL en blanco", () => {
    const id = store().newRepeaterTab("Nueva");
    expect(store().repeaterTabs[0]).toMatchObject({
      id,
      name: "Nueva",
      draft: { method: "GET", url: "", headers: [], body: { kind: "none" } },
    });
  });

  it("hasta 20 pestañas: la 21.ª no se abre", () => {
    for (let i = 0; i < 20; i++) expect(store().newRepeaterTab(`t${i}`)).not.toBeNull();
    expect(store().newRepeaterTab("de más")).toBeNull();
    expect(store().repeaterTabs).toHaveLength(20);
  });

  it("renombrar: 1–60 caracteres, sin espacios a los lados; vacío no cambia", () => {
    const id = store().newRepeaterTab("a") ?? "";
    store().renameRepeaterTab(id, "  Login  ");
    expect(store().repeaterTabs[0]?.name).toBe("Login");
    store().renameRepeaterTab(id, "   ");
    expect(store().repeaterTabs[0]?.name).toBe("Login");
    store().renameRepeaterTab(id, "x".repeat(80));
    expect(store().repeaterTabs[0]?.name).toHaveLength(60);
  });

  it("duplicar copia nombre, modo y borrador; no el historial, el origen ni la pegada", () => {
    const id = store().openRepeaterTab({ name: "A", request: request(), source: null }) ?? "";
    store().setRepeaterMode(id, "clean");
    store().startRepeaterSend(id, send(uuid(1)));
    store().setRepeaterPasted(id, { text: "{}" });
    const copy = store().duplicateRepeaterTab(id, "A (copia)");
    const tab = store().repeaterTabs.find((t) => t.id === copy);
    expect(tab).toMatchObject({
      name: "A (copia)",
      mode: "clean",
      sends: [],
      source: null,
      pasted: null,
    });
    expect(store().repeaterTabs.map((t) => t.id)).toEqual([id, copy]);
  });

  it("cerrar guarda la pestaña para deshacer y la devuelve a su lugar con su historial", () => {
    const a = store().newRepeaterTab("a") ?? "";
    const b = store().newRepeaterTab("b") ?? "";
    store().startRepeaterSend(a, send(uuid(1)));
    store().closeRepeaterTab(a);
    expect(store().repeaterTabs.map((t) => t.id)).toEqual([b]);
    expect(store().activeRepeaterTab).toBe(b);
    store().restoreRepeaterTab();
    expect(store().repeaterTabs.map((t) => t.id)).toEqual([a, b]);
    expect(store().repeaterTabs[0]?.sends).toHaveLength(1);
    expect(store().activeRepeaterTab).toBe(a);
    store().restoreRepeaterTab();
    expect(store().repeaterTabs).toHaveLength(2);
  });

  it("historial: más reciente primero, hasta 50; el más antiguo se descarta y se cuenta", () => {
    const id = store().newRepeaterTab("a") ?? "";
    for (let i = 1; i <= 52; i++) store().startRepeaterSend(id, send(uuid(i)));
    const tab = store().repeaterTabs[0];
    expect(tab?.sends).toHaveLength(50);
    expect(tab?.sends[0]?.sendId).toBe(uuid(52));
    expect(tab?.sends.at(-1)?.sendId).toBe(uuid(3));
    expect(tab?.droppedCount).toBe(2);
  });

  it("repeaterResult completa el envío pendiente de cualquier pestaña", () => {
    const id = store().newRepeaterTab("a") ?? "";
    store().startRepeaterSend(id, send(uuid(1)));
    const result: SwPayload<"repeaterResult"> = {
      ...send(uuid(1)),
      state: "done",
      response: {
        status: 200,
        headers: [],
        body: { encoding: "text", text: "{}" },
        mimeType: null,
      },
      durationMs: 5,
      size: 2,
    };
    store().applyRepeaterResult(result);
    expect(store().repeaterTabs[0]?.sends[0]).toMatchObject({
      state: "done",
      durationMs: 5,
      size: 2,
    });
    // Un resultado de un envío desconocido (pestaña cerrada) se ignora.
    store().applyRepeaterResult({ ...result, sendId: uuid(9) });
    expect(store().repeaterTabs[0]?.sends).toHaveLength(1);
  });
});
