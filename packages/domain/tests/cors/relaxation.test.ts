import { describe, expect, it } from "vitest";
import {
  RELAXATION_MAX_MS,
  applyRelaxation,
  relaxationState,
  validateRelaxation,
  type RelaxationDraft,
} from "../../src/cors/relaxation.ts";

const APP = "http://localhost:3000";
const API = "https://api-dev.empresa.com";

const draft = (overrides: Partial<RelaxationDraft> = {}): RelaxationDraft => ({
  appOrigin: APP,
  apiOrigin: API,
  durationMinutes: 480,
  exposeHeaders: [],
  credentials: false,
  ...overrides,
});
const env = {
  productionOrigins: ["https://*.empresa.com"],
  productionListReadable: true,
  relaxedApiOrigins: [] as string[],
};
const keys = (d: RelaxationDraft, e = env) => validateRelaxation(d, e).map((i) => i.messageKey);

describe("validateRelaxation (contracts/panel-protocol.md)", () => {
  const free = { ...env, productionOrigins: [] };

  it("válida ⇒ sin issues", () => {
    expect(validateRelaxation(draft(), free)).toEqual([]);
  });

  it("orígenes inválidos, null o iguales", () => {
    expect(keys(draft({ appOrigin: "no" }), free)).toEqual(["cors_issue_app_origin_invalid"]);
    expect(keys(draft({ appOrigin: "null" }), free)).toEqual(["cors_issue_app_origin_null"]);
    expect(keys(draft({ apiOrigin: "https://a.test/x" }), free)).toEqual([
      "cors_issue_api_origin_invalid",
    ]);
    expect(keys(draft({ apiOrigin: APP }), free)).toEqual(["cors_issue_same_origin"]);
  });

  it("producción: por la API o por la app; lista ilegible bloquea todo", () => {
    expect(validateRelaxation(draft(), env)).toEqual([
      { path: "apiOrigin", messageKey: "cors_issue_production_origin" },
    ]);
    expect(keys(draft(), { ...free, productionOrigins: ["http://localhost:3000"] })).toEqual([
      "cors_issue_production_origin",
    ]);
    expect(keys(draft(), { ...free, productionListReadable: false })).toEqual([
      "cors_issue_production_list_invalid",
    ]);
  });

  it("duración solo 15/60/240/480", () => {
    expect(keys(draft({ durationMinutes: 600 as never }), free)).toEqual([
      "cors_issue_duration_invalid",
    ]);
  });

  it("límite de 10 orígenes de API relajados por pestaña y sin repetir", () => {
    const ten = Array.from({ length: 10 }, (_, i) => `https://a${i}.test`);
    expect(keys(draft(), { ...free, relaxedApiOrigins: ten })).toEqual([
      "cors_issue_limit_reached",
    ]);
    expect(keys(draft(), { ...free, relaxedApiOrigins: [API] })).toEqual([
      "cors_issue_already_relaxed",
    ]);
  });

  it("Expose-Headers válidos y sin *", () => {
    expect(keys(draft({ exposeHeaders: ["*"] }), free)).toEqual([
      "cors_issue_expose_header_invalid",
    ]);
    expect(keys(draft({ exposeHeaders: ["X-Total"] }), free)).toEqual([
      "cors_issue_expose_header_invalid",
    ]);
    expect(keys(draft({ exposeHeaders: ["x-total"] }), free)).toEqual([]);
  });

  it("los issues nunca llevan valores", () => {
    for (const issue of validateRelaxation(draft({ appOrigin: "secret-token" }), env))
      expect(JSON.stringify(issue)).not.toContain("secret-token");
  });

  it("8 h como máximo", () => {
    expect(RELAXATION_MAX_MS).toBe(8 * 60 * 60 * 1000);
  });
});

describe("applyRelaxation (research R9, FR-024)", () => {
  const relaxation = { appOrigin: APP, credentials: false, exposeHeaders: [] as string[] };

  it("respuesta sin CORS ⇒ continuar con headers relajados", () => {
    const r = applyRelaxation({
      kind: "response",
      status: 200,
      serverHeaders: [{ name: "content-type", value: "application/json" }],
      finalHeaders: [{ name: "content-type", value: "application/json" }],
      relaxation,
    });
    expect(r.action).toBe("continue");
    if (r.action !== "continue") return;
    expect(r.info.alreadyValid).toBe(false);
    expect(r.info.added).toContainEqual({ name: "Access-Control-Allow-Origin", value: APP });
    expect(r.info.serverStatus).toBe(200);
  });

  it("el servidor ya responde bien y no hay Expose-Headers ⇒ nada que cambiar", () => {
    const headers = [{ name: "Access-Control-Allow-Origin", value: APP }];
    const r = applyRelaxation({
      kind: "response",
      status: 200,
      serverHeaders: headers,
      finalHeaders: headers,
      relaxation,
    });
    expect(r).toEqual({
      action: "none",
      info: {
        added: [],
        removed: [],
        preflightReplaced: false,
        serverStatus: 200,
        alreadyValid: true,
      },
    });
  });

  it("respeta el Access-Control-* que el dev cambió respecto al servidor", () => {
    const r = applyRelaxation({
      kind: "response",
      status: 200,
      serverHeaders: [],
      finalHeaders: [{ name: "Access-Control-Allow-Origin", value: "http://dev.test" }],
      relaxation,
    });
    if (r.action !== "continue") throw new Error(r.action);
    expect(r.headers).toContainEqual({
      name: "Access-Control-Allow-Origin",
      value: "http://dev.test",
    });
    expect(
      r.headers.filter((h) => h.name.toLowerCase() === "access-control-allow-origin"),
    ).toHaveLength(1);
  });

  it("preflight que fallaría ⇒ 204 local; que ya pasa ⇒ nada; con 3xx ⇒ aprender la redirección", () => {
    const base = {
      kind: "preflight" as const,
      serverHeaders: [],
      finalHeaders: [],
      relaxation,
      request: { method: "PUT", requestHeaders: "x-custom" },
    };
    const failing = applyRelaxation({ ...base, status: 401 });
    expect(failing.action).toBe("fulfill204");
    if (failing.action === "fulfill204") {
      expect(failing.info.preflightReplaced).toBe(true);
      expect(failing.info.serverStatus).toBe(401);
    }
    const passing = applyRelaxation({
      ...base,
      status: 204,
      serverHeaders: [
        { name: "Access-Control-Allow-Origin", value: APP },
        { name: "Access-Control-Allow-Methods", value: "PUT" },
        { name: "Access-Control-Allow-Headers", value: "x-custom" },
      ],
    });
    expect(passing.action).toBe("none");
    expect(applyRelaxation({ ...base, status: 302 }).action).toBe("learn_redirect");
  });

  it("preflight con headers pedidos inválidos ⇒ not_relaxable", () => {
    const r = applyRelaxation({
      kind: "preflight",
      status: 401,
      serverHeaders: [],
      finalHeaders: [],
      relaxation,
      request: { method: "PUT", requestHeaders: "*" },
    });
    expect(r.action).toBe("not_relaxable");
  });
});

describe("relaxationState (data-model)", () => {
  it("suspended con pausar Nahual, idle sin frames del origen, active en el resto", () => {
    expect(relaxationState({ globalPaused: true, appOriginPresent: true })).toBe("suspended");
    expect(relaxationState({ globalPaused: false, appOriginPresent: false })).toBe("idle");
    expect(relaxationState({ globalPaused: false, appOriginPresent: true })).toBe("active");
  });
});
