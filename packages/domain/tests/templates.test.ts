import { describe, expect, it } from "vitest";
import { TEMPLATES, templateById } from "../src/templates.ts";
import { validateRuleDraft } from "../src/validate.ts";

const complete = (id: string, pattern = "*api/items*") => {
  const template = templateById(id);
  if (!template) throw new Error(id);
  return {
    ...template.draft,
    name: "Nombre",
    prefilter: template.requiresPrefilter
      ? { ...template.draft.prefilter, pattern }
      : template.draft.prefilter,
  };
};

describe("plantillas (FR-018)", () => {
  it("son cuatro, en este orden, todas con tipos Fetch/XHR", () => {
    expect(TEMPLATES.map((t) => t.id)).toEqual(["errors", "empty", "mock503", "slow3s"]);
    for (const template of TEMPLATES) {
      expect(template.draft.resourceTypes).toEqual(["Fetch", "XHR"]);
      expect(template.nameKey).toBe(`template_${template.id}`);
    }
  });

  it("Pausar respuestas con error: Response, status ≥ 400, prefiltro *", () => {
    expect(templateById("errors")?.draft).toMatchObject({
      stage: "response",
      prefilter: { kind: "glob", pattern: "*" },
      conditions: [{ kind: "status", op: "gte", value: 400 }],
      action: { kind: "pause" },
    });
  });

  it("Pausar respuestas vacías: Response, JSONPath $ está vacío, prefiltro *", () => {
    expect(templateById("empty")?.draft).toMatchObject({
      stage: "response",
      prefilter: { kind: "glob", pattern: "*" },
      conditions: [{ kind: "jsonPath", path: "$", op: "empty" }],
    });
  });

  it("Simular API caída: Request, Mock 503 con body JSON de error y prefiltro vacío", () => {
    const template = templateById("mock503");
    expect(template?.requiresPrefilter).toBe(true);
    expect(template?.draft).toMatchObject({
      stage: "request",
      prefilter: { kind: "glob", pattern: "" },
      action: { kind: "mock", status: 503, bodyEncoding: "text" },
    });
    const action = template?.draft.action;
    expect(action?.kind === "mock" && JSON.parse(action.body)).toBeTruthy();
  });

  it("Simular red lenta: Request, Retrasar 3,000 ms y prefiltro vacío", () => {
    expect(templateById("slow3s")).toMatchObject({
      requiresPrefilter: true,
      draft: { stage: "request", prefilter: { pattern: "" }, action: { kind: "delay", ms: 3000 } },
    });
  });

  it("completadas, todas pasan la validación; sin prefiltro, las que lo exigen no", () => {
    for (const template of TEMPLATES)
      expect(validateRuleDraft(complete(template.id)).ok).toBe(true);
    expect(validateRuleDraft(complete("mock503", "")).ok).toBe(false);
    expect(validateRuleDraft(complete("slow3s", "")).ok).toBe(false);
  });
});
