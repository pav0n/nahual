import type { ComparableResponse, RepeaterSend } from "@nahual/domain";
import { describe, expect, it } from "vitest";
import {
  comparableOf,
  endpointRequest,
  sendNumber,
  sidesOf,
} from "../../src/panel/repeater/compare.ts";
import type { RepeaterTab } from "../../src/panel/repeater/types.ts";

const request = (url: string) => ({
  method: "GET",
  url,
  headers: [],
  body: { kind: "none" as const },
});
const send = (sendId: string, overrides: Partial<RepeaterSend> = {}): RepeaterSend => ({
  sendId,
  request: request(`https://api.test/${sendId}`),
  mode: "page",
  startedAt: 1,
  state: "done",
  response: {
    status: 200,
    headers: [{ name: "Content-Type", value: "application/json" }],
    body: { encoding: "text", text: "{}" },
    mimeType: "application/json",
  },
  error: null,
  durationMs: 1,
  size: 2,
  preflight: null,
  ruleEffects: [],
  relaxed: false,
  cors: null,
  notSentHeaders: [],
  exchangeId: null,
  ...overrides,
});
const original: ComparableResponse = {
  origin: { kind: "original" },
  status: 200,
  headers: [],
  body: { kind: "text", text: "{}", contentType: null },
};
const tab = (overrides: Partial<RepeaterTab> = {}): RepeaterTab => ({
  id: "t",
  name: "t",
  mode: "page",
  site: null,
  draft: request("https://api.test/draft"),
  source: { exchangeId: "x", request: request("https://api.test/source"), response: original },
  sends: [send("b"), send("a")],
  droppedCount: 0,
  pasted: { text: '{"a":1}' },
  ...overrides,
});

describe("lados del diff de una pestaña (005, FR-022, FR-022a)", () => {
  it("ofrece original, envíos terminados y pegada; no los pendientes", () => {
    const t = tab({
      sends: [send("c", { state: "pending", response: null }), send("b"), send("a")],
    });
    expect(sidesOf(t)).toEqual([
      { kind: "original" },
      { kind: "send", sendId: "b" },
      { kind: "send", sendId: "a" },
      { kind: "pasted" },
    ]);
  });

  it("un envío como respuesta comparable, con su content-type", () => {
    expect(comparableOf(tab(), { kind: "send", sendId: "a" })).toMatchObject({
      origin: { kind: "send", sendId: "a" },
      status: 200,
      body: { kind: "text", text: "{}", contentType: "application/json" },
    });
  });

  it("binario ⇒ no disponible con su motivo; sin respuesta ⇒ none", () => {
    const binary = send("x", {
      response: {
        status: 200,
        headers: [],
        body: { encoding: "none", info: { available: false, size: 4, reason: "binary" } },
        mimeType: "image/png",
      },
    });
    expect(comparableOf(tab({ sends: [binary] }), { kind: "send", sendId: "x" })?.body).toEqual({
      kind: "unavailable",
      reason: "binary",
      size: 4,
    });
    const failed = send("y", { state: "failed", response: null });
    expect(
      comparableOf(tab({ sends: [failed] }), { kind: "send", sendId: "y" })?.body,
    ).toMatchObject({
      kind: "unavailable",
      reason: "none",
    });
  });

  it("pegada: solo body; sin pegada ⇒ null", () => {
    expect(comparableOf(tab(), { kind: "pasted" })).toEqual({
      origin: { kind: "pasted" },
      status: null,
      headers: null,
      body: { kind: "text", text: '{"a":1}', contentType: null },
    });
    expect(comparableOf(tab({ pasted: null }), { kind: "pasted" })).toBeNull();
  });

  it("endpoint de los ignorados: el del envío de después, si no el de antes, si no el de origen", () => {
    expect(endpointRequest(tab(), { kind: "send", sendId: "b" }, { kind: "original" }).url).toBe(
      "https://api.test/b",
    );
    expect(endpointRequest(tab(), { kind: "pasted" }, { kind: "send", sendId: "a" }).url).toBe(
      "https://api.test/a",
    );
    expect(endpointRequest(tab(), { kind: "pasted" }, { kind: "original" }).url).toBe(
      "https://api.test/source",
    );
  });

  it("número de envío contando los descartados", () => {
    expect(sendNumber(tab(), "a")).toBe(1);
    expect(sendNumber(tab({ droppedCount: 3 }), "b")).toBe(5);
  });
});
