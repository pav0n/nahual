import { describe, expect, it } from "vitest";
import { EnvelopeSchema, PROTOCOL_VERSION } from "../src/envelope.ts";
import { UUID, UUID2, envelope } from "./helpers.ts";

describe("EnvelopeSchema", () => {
  it("acepta un sobre válido", () => {
    expect(EnvelopeSchema.safeParse(envelope("hello", { tabId: 1 })).success).toBe(true);
  });

  it("acepta correlationId cuando es UUID v4", () => {
    const msg = envelope("ack", {}, { correlationId: UUID2 });
    expect(EnvelopeSchema.safeParse(msg).success).toBe(true);
  });

  it("expone la versión 1", () => {
    expect(PROTOCOL_VERSION).toBe(1);
  });

  it.each([
    ["v distinta de 1", { ...envelope("hello", {}), v: 2 }],
    ["id que no es UUID", { ...envelope("hello", {}), id: "abc" }],
    ["id UUID v1", { ...envelope("hello", {}), id: "6ba7b810-9dad-11d1-80b4-00c04fd430c8" }],
    ["correlationId inválido", envelope("ack", {}, { correlationId: "x" })],
    ["campos extra", envelope("hello", {}, { extra: true })],
    ["payload ausente", { v: 1, id: UUID, type: "hello" }],
    ["type vacío", envelope("", {})],
    ["no es objeto", "hola"],
  ])("rechaza %s", (_name, msg) => {
    expect(EnvelopeSchema.safeParse(msg).success).toBe(false);
  });
});
