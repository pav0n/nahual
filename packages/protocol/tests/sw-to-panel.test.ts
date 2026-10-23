import { describe, expect, it } from "vitest";
import { ERROR_CODES, MAX_EXCHANGE_UPDATES, SwMessageSchema } from "../src/sw-to-panel.ts";
import { UUID, UUID2, envelope } from "./helpers.ts";

const ok = (type: string, payload: unknown, extra = {}) =>
  expect(SwMessageSchema.safeParse(envelope(type, payload, extra)).success).toBe(true);
const bad = (type: string, payload: unknown) =>
  expect(SwMessageSchema.safeParse(envelope(type, payload)).success).toBe(false);

const bodyInfo = { available: true, size: 2 };
const paused = {
  pausedId: "interception-1",
  exchangeId: "net-1",
  stage: "response",
  ruleId: UUID,
  ruleName: "Errores",
  pausedAt: 1_000,
  expiresAt: 61_000,
  request: { method: "GET", url: "https://api.test/x", headers: [], body: null, bodyInfo },
  response: { status: 500, headers: [], body: "{}", bodyInfo },
};

const rule = {
  id: UUID,
  site: "http://localhost:3000",
  name: "Errores",
  enabled: true,
  order: 0,
  prefilter: { kind: "glob", pattern: "*" },
  methods: [],
  resourceTypes: [],
  stage: "response",
  conditions: [{ kind: "status", op: "gte", value: 400 }],
  action: { kind: "pause" },
  createdAt: 1,
  updatedAt: 1,
};

const state = {
  status: "attached",
  cause: null,
  attachedAt: 1_000,
  site: "http://localhost:3000",
  activeRuleCount: 1,
  queueSize: 0,
  globalPaused: false,
};

describe("SwMessageSchema v2", () => {
  it("ack {} con correlationId", () => {
    ok("ack", {}, { correlationId: UUID2 });
  });

  it("error con los ErrorCode de v2 e issues opcionales", () => {
    expect(ERROR_CODES).toEqual([
      "invalid_message",
      "not_attached",
      "already_attached",
      "restricted_page",
      "unknown_paused_id",
      "cdp_error",
      "rule_invalid",
      "unknown_rule",
      "settings_invalid",
      "storage_quota",
      "edit_invalid",
      "body_unavailable",
      "no_site",
    ]);
    for (const code of ERROR_CODES) ok("error", { code, messageKey: `error_${code}` });
    ok("error", {
      code: "rule_invalid",
      messageKey: "error_rule_invalid",
      issues: [{ path: "prefilter.pattern", messageKey: "rule_error_regex_invalid" }],
    });
    bad("error", { code: "pattern_invalid", messageKey: "x" });
  });

  it("state con sitio, reglas activas, cola e interruptor global", () => {
    ok("state", state);
    ok("state", { ...state, site: null, status: "detached", cause: "user", attachedAt: null });
    bad("state", { ...state, patterns: [] });
    bad("state", { ...state, queueSize: -1 });
  });

  it("settings", () => {
    ok("settings", {
      pauseTimeoutSeconds: 60,
      globalPaused: false,
      onboardingSeen: true,
      attachConsent: true,
      autoAttach: true,
    });
    bad("settings", { pauseTimeoutSeconds: 60 });
  });

  it("rules con descartadas", () => {
    ok("rules", { rules: [rule], discarded: [] });
    ok("rules", { rules: [], discarded: [{ count: 2, reasonKey: "notice_rules_invalid" }] });
    bad("rules", { rules: [{ ...rule, site: "file:///x" }], discarded: [] });
  });

  it(`exchanges: ≤ ${200} updates por lote`, () => {
    expect(MAX_EXCHANGE_UPDATES).toBe(200);
    const update = { id: "net-1", kind: "start", fields: { seq: 0, method: "GET" } };
    ok("exchanges", { updates: [update] });
    bad("exchanges", { updates: Array.from({ length: 201 }, () => update) });
  });

  it("navigated", () => {
    ok("navigated", { site: "http://localhost:3000", url: "http://localhost:3000/next" });
    ok("navigated", { site: null, url: "about:blank" });
  });

  it("paused y resolved", () => {
    ok("paused", paused);
    bad("paused", { ...paused, stage: "both" });
    ok("resolved", { pausedId: "p", outcome: "timed_out" });
    ok("resolved", { pausedId: "p", outcome: "apply_failed", errorKey: "error_cdp_error" });
    bad("resolved", { pausedId: "p", outcome: "abandoned" });
  });

  it("body", () => {
    ok("body", { exchangeId: "net-1", side: "response", encoding: "text", content: "{}", size: 2 });
    bad("body", { exchangeId: "net-1", side: "response", encoding: "hex", content: "", size: 0 });
  });

  it("notice", () => {
    ok("notice", { messageKey: "notice_queue_full" });
    ok("notice", { messageKey: "notice_rules_invalid", params: ["2"] });
    bad("notice", { messageKey: "" });
  });

  it("rechaza type desconocido", () => {
    bad("hello", { tabId: 1 });
  });
});
