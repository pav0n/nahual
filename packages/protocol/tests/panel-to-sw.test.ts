import { describe, expect, it } from "vitest";
import { MAX_PANEL_MESSAGE_CHARS, PanelMessageSchema } from "../src/panel-to-sw.ts";
import { UUID, UUID2, envelope } from "./helpers.ts";

const ok = (type: string, payload: unknown) =>
  expect(PanelMessageSchema.safeParse(envelope(type, payload)).success).toBe(true);
const bad = (type: string, payload: unknown) =>
  expect(PanelMessageSchema.safeParse(envelope(type, payload)).success).toBe(false);

describe("PanelMessageSchema (comandos de 002)", () => {
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

  it("límite de tamaño de un mensaje del panel: 8 MB (005: body original en base64)", () => {
    expect(MAX_PANEL_MESSAGE_CHARS).toBe(8 * 1024 * 1024);
  });

  it("rechaza type desconocido", () => {
    bad("evalCode", {});
  });
});

describe("PanelMessageSchema v3 (003, contracts/panel-protocol.md)", () => {
  const relax = {
    appOrigin: "http://localhost:3000",
    apiOrigin: "https://api-dev.empresa.com",
    durationMinutes: 480,
    exposeHeaders: ["x-total"],
    credentials: true,
  };

  it("relaxCors con duración 15/60/240/480 y ≤ 30 Expose-Headers", () => {
    ok("relaxCors", relax);
    for (const durationMinutes of [15, 60, 240]) ok("relaxCors", { ...relax, durationMinutes });
    bad("relaxCors", { ...relax, durationMinutes: 600 });
    bad("relaxCors", { ...relax, exposeHeaders: Array.from({ length: 31 }, (_, i) => `x-${i}`) });
    bad("relaxCors", { ...relax, exposeHeaders: ["*"] });
    bad("relaxCors", { ...relax, tabId: 3 });
    bad("relaxCors", { ...relax, credentials: undefined });
  });

  it("relaxCors deja al SW validar los orígenes (issues por campo)", () => {
    ok("relaxCors", { ...relax, appOrigin: "null" });
    bad("relaxCors", { ...relax, appOrigin: "x".repeat(300) });
  });

  it("endRelaxation con id opcional", () => {
    ok("endRelaxation", {});
    ok("endRelaxation", { relaxationId: UUID });
    bad("endRelaxation", { relaxationId: "x" });
  });

  it("updateSettings acepta los campos de CORS; la lista la valida el SW", () => {
    ok("updateSettings", { corsDefaultDurationMinutes: 60 });
    bad("updateSettings", { corsDefaultDurationMinutes: 30 });
    ok("updateSettings", { productionOrigins: ["https://*.empresa.com", "no es un origen"] });
    bad("updateSettings", {
      productionOrigins: Array.from({ length: 101 }, (_, i) => `https://a${i}.test`),
    });
    bad("updateSettings", { productionOrigins: ["x".repeat(300)] });
  });
});

describe("PanelMessageSchema (comandos de 005, contracts/panel-protocol.md)", () => {
  const request = {
    method: "GET",
    url: "https://api.test/items",
    headers: [{ name: "accept", value: "*/*", enabled: true }],
    body: { kind: "none" },
  };

  it("repeaterSend { sendId, mode, request }", () => {
    ok("repeaterSend", { sendId: UUID, mode: "page", request });
    ok("repeaterSend", { sendId: UUID, mode: "clean", request });
    bad("repeaterSend", { sendId: "x", mode: "page", request });
    bad("repeaterSend", { sendId: UUID, mode: "remote", request });
    bad("repeaterSend", { sendId: UUID, mode: "page", request, tabId: 3 });
    bad("repeaterSend", { sendId: UUID, mode: "page" });
  });

  it("repeaterSend llega sin validar campo por campo: el SW responde los issues", () => {
    ok("repeaterSend", { sendId: UUID, mode: "page", request: { ...request, url: "nope" } });
  });

  it("repeaterCancel { sendId }", () => {
    ok("repeaterCancel", { sendId: UUID2 });
    bad("repeaterCancel", {});
  });

  it("getIgnores y setIgnores por método y URL, sin valores", () => {
    ok("getIgnores", { method: "GET", url: "https://api.test/items?x=1" });
    ok("setIgnores", {
      method: "GET",
      url: "https://api.test/items",
      paths: [
        [{ key: "meta" }, { key: "timestamp" }],
        [{ key: "items" }, { any: true }],
      ],
      headers: ["date"],
    });
    bad("setIgnores", {
      method: "GET",
      url: "https://api.test/items",
      paths: [],
      headers: [],
      values: [],
    });
    bad("getIgnores", { method: "GET" });
  });

  it("el tamaño máximo admite un body original de 5 MB en base64", () => {
    expect(MAX_PANEL_MESSAGE_CHARS).toBeGreaterThanOrEqual(
      Math.ceil((5 * 1024 * 1024) / 3) * 4 + 64 * 1024,
    );
  });
});
