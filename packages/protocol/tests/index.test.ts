import { describe, expect, it } from "vitest";
import { makeCommand, makeEvent, parsePanelMessage, parseSwMessage } from "../src/index.ts";
import { UUID2, envelope } from "./helpers.ts";

describe("parsePanelMessage / parseSwMessage", () => {
  it("devuelven ok con el mensaje tipado", () => {
    const result = parsePanelMessage(envelope("hello", { tabId: 7 }));
    expect(result).toEqual({ ok: true, message: envelope("hello", { tabId: 7 }) });
  });

  it.each([undefined, null, 42, "x", [], {}, { v: 1 }, envelope("hello", { tabId: "7" })])(
    "nunca lanzan con entrada inválida (%j)",
    (raw) => {
      expect(() => parsePanelMessage(raw)).not.toThrow();
      expect(() => parseSwMessage(raw)).not.toThrow();
      expect(parsePanelMessage(raw).ok).toBe(false);
      expect(parseSwMessage(raw).ok).toBe(false);
    },
  );

  it("el error describe la ruta del problema sin incluir el valor recibido", () => {
    const secret = "Bearer super-secret-token";
    const result = parsePanelMessage(
      envelope("continue", {
        pausedId: "p",
        headers: [{ name: "Authorization", value: `${secret}\n` }],
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("payload.headers.0.value");
      expect(result.error).not.toContain(secret);
    }
  });
});

describe("makeCommand / makeEvent", () => {
  it("makeCommand produce un comando válido con id UUID v4", () => {
    const cmd = makeCommand("setPauseTimeout", { seconds: 30 });
    expect(parsePanelMessage(cmd).ok).toBe(true);
    expect(cmd.id).not.toBe(makeCommand("attach", {}).id);
  });

  it("makeEvent produce un evento válido y propaga correlationId", () => {
    const ev = makeEvent("ack", {}, UUID2);
    expect(ev.correlationId).toBe(UUID2);
    expect(parseSwMessage(ev).ok).toBe(true);
    expect("correlationId" in makeEvent("ack", {})).toBe(false);
  });
});
