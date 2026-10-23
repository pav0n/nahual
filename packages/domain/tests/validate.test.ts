import { describe, expect, it } from "vitest";
import { validatePausedEdit, validateRuleDraft } from "../src/validate.ts";

const draft = (overrides: Record<string, unknown> = {}) => ({
  name: "Errores",
  enabled: true,
  prefilter: { kind: "glob", pattern: "*" },
  methods: [],
  resourceTypes: [],
  stage: "response",
  conditions: [],
  action: { kind: "pause" },
  ...overrides,
});

const issues = (input: unknown) => {
  const result = validateRuleDraft(input);
  return result.ok ? [] : result.issues;
};

describe("validateRuleDraft (FR-013, SC-005)", () => {
  it("acepta un borrador válido", () => {
    expect(validateRuleDraft(draft())).toMatchObject({ ok: true });
  });

  it.each([
    [
      { prefilter: { kind: "regex", pattern: "([a-z" } },
      "prefilter.pattern",
      "rule_error_regex_invalid",
    ],
    [
      { prefilter: { kind: "regex", pattern: "a".repeat(513) } },
      "prefilter.pattern",
      "rule_error_regex_too_long",
    ],
    [{ prefilter: { kind: "glob", pattern: "" } }, "prefilter.pattern", "rule_error_required"],
    [
      { conditions: [{ kind: "jsonPath", path: "$.[", op: "exists" }] },
      "conditions.0.path",
      "rule_error_jsonpath",
    ],
    [
      { conditions: [{ kind: "status", op: "eq", value: 700 }] },
      "conditions.0.value",
      "rule_error_status",
    ],
    [
      { conditions: [{ kind: "status", op: "between", range: [500, 400] }] },
      "conditions.0.range",
      "rule_error_range",
    ],
    [
      { conditions: [{ kind: "header", name: "x", op: "equals" }] },
      "conditions.0.value",
      "rule_error_required",
    ],
    [
      { conditions: [{ kind: "method", values: ["GET"] }] },
      "conditions.0.kind",
      "rule_error_condition_stage",
    ],
    [{ name: "" }, "name", "rule_error_required"],
    [
      {
        action: {
          kind: "mock",
          status: 200,
          headers: [],
          body: "x".repeat(1024 * 1024 + 1),
          bodyEncoding: "text",
        },
      },
      "action.body",
      "rule_error_body_too_large",
    ],
  ])("rechaza %j en %s con %s", (overrides, path, messageKey) => {
    expect(issues(draft(overrides))).toContainEqual({ path, messageKey });
  });

  it("una entrada que no es objeto se rechaza sin lanzar", () => {
    expect(issues("x")).toEqual([{ path: "", messageKey: "rule_error_invalid" }]);
  });
});

describe("validatePausedEdit (edge case de valores editados inválidos)", () => {
  it("acepta ediciones válidas por etapa", () => {
    expect(
      validatePausedEdit({ method: "PATCH", url: "https://api.test/v2", body: "{}" }, "request").ok,
    ).toBe(true);
    expect(
      validatePausedEdit({ status: 200, headers: [{ name: "x-a", value: "1" }] }, "response").ok,
    ).toBe(true);
  });

  it("rechaza status fuera de rango, URL no absoluta y nombres de header inválidos", () => {
    const bad = validatePausedEdit(
      { status: 600, headers: [{ name: "x a", value: "1" }] },
      "response",
    );
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.issues).toContainEqual({ path: "status", messageKey: "rule_error_status" });
      expect(bad.issues).toContainEqual({
        path: "headers.0.name",
        messageKey: "rule_error_header_name",
      });
    }
    const url = validatePausedEdit({ url: "/relativa" }, "request");
    expect(url.ok ? [] : url.issues).toContainEqual({ path: "url", messageKey: "rule_error_url" });
  });

  it("los campos de otra etapa se rechazan", () => {
    const result = validatePausedEdit({ status: 200 }, "request");
    expect(result.ok ? [] : result.issues).toContainEqual({
      path: "status",
      messageKey: "rule_error_stage_field",
    });
    const other = validatePausedEdit({ method: "GET" }, "response");
    expect(other.ok ? [] : other.issues).toContainEqual({
      path: "method",
      messageKey: "rule_error_stage_field",
    });
  });
});
