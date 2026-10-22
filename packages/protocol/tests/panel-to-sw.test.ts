import { describe, expect, it } from "vitest";
import { PanelMessageSchema } from "../src/panel-to-sw.ts";
import { envelope } from "./helpers.ts";

const ok = (type: string, payload: unknown) =>
  expect(PanelMessageSchema.safeParse(envelope(type, payload)).success).toBe(true);
const bad = (type: string, payload: unknown) =>
  expect(PanelMessageSchema.safeParse(envelope(type, payload)).success).toBe(false);

const pattern = (urlPattern: string, stage = "request") => ({ urlPattern, stage });

describe("PanelMessageSchema", () => {
  it("hello { tabId: int ≥ 0 }", () => {
    ok("hello", { tabId: 0 });
    ok("hello", { tabId: 42 });
    bad("hello", { tabId: -1 });
    bad("hello", { tabId: 1.5 });
    bad("hello", {});
  });

  it.each(["attach", "detach", "reconnect"])("%s {}", (type) => {
    ok(type, {});
    bad(type, { tabId: 1 });
  });

  it("setPatterns: 0–10 elementos", () => {
    ok("setPatterns", { patterns: [] });
    ok("setPatterns", { patterns: Array.from({ length: 10 }, (_, i) => pattern(`*api${i}*`)) });
    bad("setPatterns", { patterns: Array.from({ length: 11 }, (_, i) => pattern(`*${i}*`)) });
  });

  it("setPatterns: urlPattern 1–2 048 caracteres, sin espacios", () => {
    ok("setPatterns", { patterns: [pattern("*")] });
    ok("setPatterns", { patterns: [pattern("a".repeat(2048))] });
    bad("setPatterns", { patterns: [pattern("")] });
    bad("setPatterns", { patterns: [pattern("a".repeat(2049))] });
    bad("setPatterns", { patterns: [pattern("*api *")] });
    bad("setPatterns", { patterns: [pattern("*api\t*")] });
  });

  it('setPatterns: stage "request" | "response"', () => {
    ok("setPatterns", { patterns: [pattern("*", "response")] });
    bad("setPatterns", { patterns: [pattern("*", "Request")] });
  });

  it("setPauseTimeout { seconds: int 5–120 }", () => {
    ok("setPauseTimeout", { seconds: 5 });
    ok("setPauseTimeout", { seconds: 120 });
    bad("setPauseTimeout", { seconds: 4 });
    bad("setPauseTimeout", { seconds: 121 });
    bad("setPauseTimeout", { seconds: 30.5 });
  });

  it("continue sin headers", () => {
    ok("continue", { pausedId: "interception-1" });
    bad("continue", { pausedId: "" });
    bad("continue", {});
  });

  it("continue: HeaderEdit name 1–256, token HTTP válido (RFC 9110)", () => {
    ok("continue", { pausedId: "p", headers: [{ name: "X-Nahual", value: "1" }] });
    ok("continue", { pausedId: "p", headers: [{ name: "a".repeat(256), value: "1" }] });
    bad("continue", { pausedId: "p", headers: [{ name: "", value: "1" }] });
    bad("continue", { pausedId: "p", headers: [{ name: "a".repeat(257), value: "1" }] });
    bad("continue", { pausedId: "p", headers: [{ name: "X Nahual", value: "1" }] });
    bad("continue", { pausedId: "p", headers: [{ name: "X:Nahual", value: "1" }] });
  });

  it("continue: HeaderEdit value string | null, 0–8 192 caracteres, sin \\r ni \\n", () => {
    ok("continue", { pausedId: "p", headers: [{ name: "x", value: null }] });
    ok("continue", { pausedId: "p", headers: [{ name: "x", value: "" }] });
    ok("continue", { pausedId: "p", headers: [{ name: "x", value: "v".repeat(8192) }] });
    bad("continue", { pausedId: "p", headers: [{ name: "x", value: "v".repeat(8193) }] });
    bad("continue", { pausedId: "p", headers: [{ name: "x", value: "a\r\nSet-Cookie: y" }] });
    bad("continue", { pausedId: "p", headers: [{ name: "x", value: "a\nb" }] });
  });

  it("continue: como máximo 50 headers", () => {
    const headers = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ name: `h${i}`, value: "" }));
    ok("continue", { pausedId: "p", headers: headers(50) });
    bad("continue", { pausedId: "p", headers: headers(51) });
  });

  it("rechaza type desconocido y payload con campos extra", () => {
    bad("evalCode", {});
    bad("attach", { force: true });
  });
});
