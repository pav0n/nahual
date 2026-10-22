import { describe, expect, it } from "vitest";
import { ERROR_CODES, SwMessageSchema } from "../src/sw-to-panel.ts";
import { UUID2, envelope } from "./helpers.ts";

const ok = (type: string, payload: unknown, extra = {}) =>
  expect(SwMessageSchema.safeParse(envelope(type, payload, extra)).success).toBe(true);
const bad = (type: string, payload: unknown) =>
  expect(SwMessageSchema.safeParse(envelope(type, payload)).success).toBe(false);

const paused = {
  pausedId: "interception-1",
  tabId: 3,
  stage: "response",
  method: "GET",
  url: "https://api.example.test/data",
  headers: [{ name: "content-type", value: "application/json" }],
  statusCode: 200,
  bodyAvailable: true,
  bodySize: 12,
  pausedAt: 1_000,
  expiresAt: 31_000,
};

describe("SwMessageSchema", () => {
  it("ack {} con correlationId", () => {
    ok("ack", {}, { correlationId: UUID2 });
  });

  it("error con los 8 ErrorCode", () => {
    expect(ERROR_CODES).toEqual([
      "invalid_message",
      "not_attached",
      "already_attached",
      "restricted_page",
      "pattern_invalid",
      "timeout_out_of_range",
      "unknown_paused_id",
      "cdp_error",
    ]);
    for (const code of ERROR_CODES) ok("error", { code, messageKey: "error_" + code });
    bad("error", { code: "boom", messageKey: "x" });
    bad("error", { code: "cdp_error" });
  });

  it("state", () => {
    const state = {
      status: "attached",
      cause: null,
      attachedAt: 1_000,
      patterns: [{ urlPattern: "*api*", stage: "request" }],
      pauseTimeoutSeconds: 30,
    };
    ok("state", state);
    for (const status of ["detached", "attaching", "attached", "conflict"]) {
      ok("state", { ...state, status });
    }
    ok("state", { ...state, status: "detached", cause: "canceled_by_user", attachedAt: null });
    bad("state", { ...state, status: "paused" });
    bad("state", { ...state, cause: "kaboom" });
    bad("state", { ...state, pauseTimeoutSeconds: 200 });
  });

  it("paused (PausedRequest sin state)", () => {
    ok("paused", paused);
    ok("paused", { ...paused, stage: "request", statusCode: null, bodySize: null });
    bad("paused", { ...paused, state: "paused" });
    bad("paused", { ...paused, stage: "both" });
  });

  it("resolved", () => {
    for (const outcome of ["continued", "modified", "timed_out", "failed", "abandoned"]) {
      ok("resolved", { pausedId: "p", outcome });
    }
    ok("resolved", { pausedId: "p", outcome: "failed", errorKey: "error_cdp_error" });
    bad("resolved", { pausedId: "p", outcome: "done" });
  });

  it("rechaza type desconocido", () => {
    bad("hello", { tabId: 1 });
  });
});
