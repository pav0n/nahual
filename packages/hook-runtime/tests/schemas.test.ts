import { LIMITS } from "@nahual/domain";
import { describe, expect, it } from "vitest";
import {
  HookContextDataSchema,
  HookOutcomeSchema,
  PanelToSandboxSchema,
  SandboxToPanelSchema,
} from "../src/schemas.ts";
import { requestContext } from "./fixtures.ts";

describe("HookContextDataSchema", () => {
  it("acepta un contexto de etapa Request y otro de Response", () => {
    expect(HookContextDataSchema.safeParse(requestContext()).success).toBe(true);
    const response = {
      ...requestContext(),
      stage: "response",
      response: {
        status: 200,
        headers: { "content-type": "application/json" },
        body: { kind: "binary", contentType: "image/png", size: 10 },
      },
    };
    expect(HookContextDataSchema.safeParse(response).success).toBe(true);
  });

  it("rechaza un body de texto de más de 5 MB y status fuera de 0–999", () => {
    const big = requestContext();
    big.request.body = {
      kind: "text",
      text: "x".repeat(LIMITS.bodyBytes + 1),
      contentType: null,
      size: 0,
    };
    expect(HookContextDataSchema.safeParse(big).success).toBe(false);
    const bad = {
      ...requestContext(),
      response: {
        status: 1000,
        headers: {},
        body: { kind: "none", contentType: null, size: null },
      },
    };
    expect(HookContextDataSchema.safeParse(bad).success).toBe(false);
  });
});

describe("HookOutcomeSchema", () => {
  const ok = {
    kind: "ok",
    context: requestContext(),
    respond: null,
    state: null,
    stateChanged: false,
    logs: [],
    durationMs: 1,
  };

  it("acepta ok y error con sus campos", () => {
    expect(HookOutcomeSchema.safeParse(ok).success).toBe(true);
    for (const type of [
      "exception",
      "invalid_result",
      "timeout",
      "state_conflict",
      "state_too_large",
      "access_denied",
    ]) {
      const error = { kind: "error", type, message: "m", line: 3, logs: ["a"], durationMs: 2 };
      expect(HookOutcomeSchema.safeParse(error).success, type).toBe(true);
    }
  });

  it("limita los registros a 1,000 entradas de 10,240 caracteres", () => {
    expect(
      HookOutcomeSchema.safeParse({
        ...ok,
        logs: Array(LIMITS.hookConsoleEntriesMax + 1).fill("x"),
      }).success,
    ).toBe(false);
    expect(
      HookOutcomeSchema.safeParse({ ...ok, logs: ["x".repeat(LIMITS.hookLogEntryChars + 1)] })
        .success,
    ).toBe(false);
  });

  it("rechaza tipos de error desconocidos y campos extra", () => {
    expect(
      HookOutcomeSchema.safeParse({
        kind: "error",
        type: "boom",
        message: "",
        logs: [],
        durationMs: 0,
        line: null,
      }).success,
    ).toBe(false);
    expect(HookOutcomeSchema.safeParse({ ...ok, extra: 1 }).success).toBe(false);
  });
});

describe("mensajes panel ⇔ sandbox (contracts/sandbox-messaging.md)", () => {
  it("run y dispose del panel", () => {
    const run = {
      type: "run",
      execId: "e1",
      ruleId: "r1",
      codeHash: "ab",
      source: "x",
      context: requestContext(),
      state: {},
      timeoutMs: 2000,
    };
    expect(PanelToSandboxSchema.safeParse(run).success).toBe(true);
    expect(PanelToSandboxSchema.safeParse({ ...run, source: null }).success).toBe(true);
    expect(PanelToSandboxSchema.safeParse({ type: "dispose", ruleId: "r1" }).success).toBe(true);
    expect(PanelToSandboxSchema.safeParse({ type: "eval", code: "x" }).success).toBe(false);
  });

  it("hello, ready y result del sandbox", () => {
    expect(SandboxToPanelSchema.safeParse({ type: "hello", v: 1 }).success).toBe(true);
    expect(SandboxToPanelSchema.safeParse({ type: "ready", sucraseMs: 3 }).success).toBe(true);
    const outcome = {
      kind: "error",
      type: "timeout",
      message: "",
      line: null,
      logs: [],
      durationMs: 2000,
    };
    expect(SandboxToPanelSchema.safeParse({ type: "result", execId: "e1", outcome }).success).toBe(
      true,
    );
    expect(SandboxToPanelSchema.safeParse({ type: "result", execId: 1, outcome }).success).toBe(
      false,
    );
  });
});
