import { describe, expect, it } from "vitest";
import { MAX_PANEL_MESSAGE_CHARS, PanelMessageSchema } from "../src/panel-to-sw.ts";
import { UUID, UUID2, envelope } from "./helpers.ts";

const ok = (type: string, payload: unknown) =>
  expect(PanelMessageSchema.safeParse(envelope(type, payload)).success).toBe(true);
const bad = (type: string, payload: unknown) =>
  expect(PanelMessageSchema.safeParse(envelope(type, payload)).success).toBe(false);

describe("PanelMessageSchema v2", () => {
  it("hello { tabId: int ≥ 0 }", () => {
    ok("hello", { tabId: 0 });
    bad("hello", { tabId: -1 });
    bad("hello", { tabId: 1.5 });
  });

  it("attach con consentimiento opcional", () => {
    ok("attach", {});
    ok("attach", { consent: true });
    bad("attach", { consent: false });
    bad("attach", { force: true });
  });

  it.each(["detach", "reconnect", "continueAll"])("%s {}", (type) => {
    ok(type, {});
    bad(type, { tabId: 1 });
  });

  it("los comandos de 001 ya no existen", () => {
    bad("setPatterns", { patterns: [] });
    bad("setPauseTimeout", { seconds: 30 });
    bad("continue", { pausedId: "p" });
  });

  it("updateSettings: cambio parcial validado con Settings", () => {
    ok("updateSettings", { pauseTimeoutSeconds: 300 });
    ok("updateSettings", { globalPaused: true, autoAttach: false });
    bad("updateSettings", { pauseTimeoutSeconds: 301 });
    bad("updateSettings", { theme: "dark" });
  });

  it("saveRule: estructura libre (la valida el SW para devolver issues por campo)", () => {
    ok("saveRule", { rule: { name: "x", prefilter: { kind: "regex", pattern: "([a-z" } } });
    ok("saveRule", { rule: { id: UUID, name: "x" } });
    bad("saveRule", {});
    bad("saveRule", { rule: "x" });
  });

  it("deleteRule, restoreRule y setRuleEnabled exigen un uuid", () => {
    ok("deleteRule", { ruleId: UUID });
    ok("restoreRule", { ruleId: UUID });
    ok("setRuleEnabled", { ruleId: UUID, enabled: false });
    bad("deleteRule", { ruleId: "1" });
    bad("setRuleEnabled", { ruleId: UUID });
  });

  it("reorderRules: sitio válido e ids únicos", () => {
    ok("reorderRules", { site: "http://localhost:3000", ruleIds: [UUID, UUID2] });
    bad("reorderRules", { site: "http://localhost:3000", ruleIds: [UUID, UUID] });
    bad("reorderRules", { site: "file:///x", ruleIds: [UUID] });
  });

  it("resolvePaused: edit solo con continue, mock solo y obligatorio con mock", () => {
    ok("resolvePaused", { pausedId: "p", action: "continue" });
    ok("resolvePaused", { pausedId: "p", action: "continue", edit: { status: 200 } });
    ok("resolvePaused", { pausedId: "p", action: "continueUnchanged" });
    ok("resolvePaused", { pausedId: "p", action: "abort" });
    ok("resolvePaused", { pausedId: "p", action: "mock", mock: { status: 200 } });
    bad("resolvePaused", { pausedId: "p", action: "mock" });
    bad("resolvePaused", { pausedId: "p", action: "abort", edit: { status: 200 } });
    bad("resolvePaused", { pausedId: "p", action: "continueUnchanged", mock: { status: 200 } });
    bad("resolvePaused", { pausedId: "", action: "continue" });
    bad("resolvePaused", { pausedId: "p", action: "skip" });
  });

  it("getBody: lado request o response", () => {
    ok("getBody", { exchangeId: "net-1", side: "response" });
    bad("getBody", { exchangeId: "net-1", side: "both" });
  });

  it("límite de tamaño de un mensaje del panel: 6 MB", () => {
    expect(MAX_PANEL_MESSAGE_CHARS).toBe(6 * 1024 * 1024);
  });

  it("rechaza type desconocido", () => {
    bad("evalCode", {});
  });
});
