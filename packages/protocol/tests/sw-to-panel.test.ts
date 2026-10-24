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
  relaxationCount: 0,
};

describe("SwMessageSchema (eventos de 002)", () => {
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
      "relaxation_invalid",
      "ignores_invalid",
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
      corsDefaultDurationMinutes: 480,
      productionOrigins: ["https://*.empresa.com"],
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

describe("SwMessageSchema v3 (003)", () => {
  const view = {
    id: UUID,
    appOrigin: "http://localhost:3000",
    apiOrigin: "https://api.test",
    exposeHeaders: [],
    credentials: false,
    createdAt: 1,
    expiresAt: 2,
    state: "active",
  };

  it("relaxations con RelaxationView", () => {
    ok("relaxations", { items: [] });
    ok("relaxations", { items: [view] });
    bad("relaxations", { items: [{ ...view, tabId: 1 }] });
    bad("relaxations", { items: Array.from({ length: 11 }, () => view) });
  });

  it("state con relaxationCount", () => {
    bad("state", { ...state, relaxationCount: -1 });
  });

  it("error relaxation_invalid con issues", () => {
    ok("error", {
      code: "relaxation_invalid",
      messageKey: "cors_error_relaxation",
      issues: [{ path: "apiOrigin", messageKey: "cors_issue_production_origin" }],
    });
  });

  it("exchanges con kind cors", () => {
    ok("exchanges", {
      updates: [
        {
          id: "e1",
          kind: "cors",
          fields: {},
          cors: {
            relaxed: {
              relaxationId: UUID,
              added: [],
              removed: [],
              preflightReplaced: true,
              serverStatus: 401,
              alreadyValid: false,
            },
          },
        },
      ],
    });
  });
});

describe("SwMessageSchema v4 (005)", () => {
  const outcome = {
    response: {
      status: 200,
      headers: [{ name: "content-type", value: "application/json" }],
      body: { encoding: "text", text: "{}" },
      mimeType: "application/json",
    },
    error: null,
    durationMs: 12,
    size: 2,
    preflight: null,
    ruleEffects: [],
    relaxed: false,
    cors: null,
    notSentHeaders: [],
    exchangeId: "net-1",
  };

  it("repeaterResult con su estado", () => {
    ok("repeaterResult", { sendId: UUID, state: "done", ...outcome });
    ok("repeaterResult", {
      sendId: UUID,
      state: "failed",
      ...outcome,
      response: null,
      error: {
        code: "permission_required",
        messageKey: "repeater_error_permission_required",
        params: ["https://api.test"],
      },
    });
    bad("repeaterResult", { sendId: UUID, state: "pending", ...outcome });
    bad("repeaterResult", { sendId: UUID, state: "done" });
  });

  it("ignores por endpoint", () => {
    ok("ignores", {
      method: "GET",
      url: "https://api.test/x",
      paths: [[{ key: "a" }]],
      headers: [],
    });
    bad("ignores", {
      method: "GET",
      url: "https://api.test/x",
      paths: [],
      headers: [],
      values: [],
    });
  });

  it("exchanges admite la marca repeater", () => {
    ok("exchanges", {
      updates: [{ id: "net-1", kind: "headers", fields: { repeater: { sendId: UUID2 } } }],
    });
    bad("exchanges", {
      updates: [{ id: "net-1", kind: "headers", fields: { repeater: { sendId: "x" } } }],
    });
  });
});
