import { describe, expect, it } from "vitest";
import { ActionSchema, QueueMockActionSchema } from "../src/schemas/action.ts";
import { ConditionSchema } from "../src/schemas/condition.ts";
import { ExchangeUpdateSchema, RULE_RESULTS } from "../src/schemas/exchange.ts";
import { LIMITS } from "../src/schemas/limits.ts";
import { PausedEditSchema, PausedItemViewSchema } from "../src/schemas/paused.ts";
import { RuleSchema } from "../src/schemas/rule.ts";
import { DEFAULT_SETTINGS, SettingsSchema, parseSettings } from "../src/schemas/settings.ts";
import {
  CorsDiagnosisSchema,
  CorsRelaxedInfoSchema,
  RelaxationViewSchema,
} from "../src/cors/schemas.ts";
import { rule } from "./fixtures.ts";

const valid = (value: unknown) => expect(RuleSchema.safeParse(value).success).toBe(true);
const invalid = (value: unknown) => expect(RuleSchema.safeParse(value).success).toBe(false);
const cond = (value: unknown) => ConditionSchema.safeParse(value).success;

describe("RuleSchema", () => {
  it("acepta una regla mínima", () => valid(rule()));

  it("exige un sitio con origen no opaco y exacto", () => {
    valid(rule({ site: "https://app.example.test:8443" }));
    invalid(rule({ site: "" }));
    invalid(rule({ site: "file:///tmp/a.html" }));
    invalid(rule({ site: "data:text/html,hola" }));
    invalid(rule({ site: "https://app.example.test/ruta" }));
  });

  it("nombre de 1–80 caracteres", () => {
    invalid(rule({ name: "" }));
    valid(rule({ name: "x".repeat(80) }));
    invalid(rule({ name: "x".repeat(81) }));
  });

  it("prefiltro glob de 1–2,048 y regex de 1–512 compilable", () => {
    valid(rule({ prefilter: { kind: "glob", pattern: "*" } }));
    valid(rule({ prefilter: { kind: "glob", pattern: "x".repeat(LIMITS.globMax) } }));
    invalid(rule({ prefilter: { kind: "glob", pattern: "x".repeat(LIMITS.globMax + 1) } }));
    invalid(rule({ prefilter: { kind: "glob", pattern: "" } }));
    valid(rule({ prefilter: { kind: "regex", pattern: "^https://api\\.test/" } }));
    invalid(rule({ prefilter: { kind: "regex", pattern: "([a-z" } }));
    invalid(rule({ prefilter: { kind: "regex", pattern: "a".repeat(LIMITS.regexMax + 1) } }));
  });

  it("métodos y tipos sin duplicados; vacío = todos", () => {
    valid(rule({ methods: ["GET", "POST"], resourceTypes: ["Fetch", "XHR"] }));
    invalid(rule({ methods: ["GET", "GET"] }));
    invalid(rule({ resourceTypes: ["Fetch", "Fetch"] }));
    invalid(rule({ methods: ["FETCH" as never] }));
  });

  it("0–20 condiciones", () => {
    const c = { kind: "status", op: "gte", value: 400 } as const;
    valid(rule({ conditions: Array.from({ length: 20 }, () => c) }));
    invalid(rule({ conditions: Array.from({ length: 21 }, () => c) }));
  });

  it("cada condición debe ser válida para la etapa", () => {
    valid(rule({ stage: "response", conditions: [{ kind: "status", op: "gte", value: 500 }] }));
    invalid(rule({ stage: "request", conditions: [{ kind: "status", op: "gte", value: 500 }] }));
    invalid(rule({ stage: "request", conditions: [{ kind: "graphqlErrors", present: true }] }));
    invalid(rule({ stage: "response", conditions: [{ kind: "method", values: ["GET"] }] }));
    invalid(rule({ stage: "response", conditions: [{ kind: "query", name: "q", op: "exists" }] }));
    valid(rule({ stage: "request", conditions: [{ kind: "query", name: "q", op: "exists" }] }));
  });
});

describe("ConditionSchema", () => {
  it("status en 100–599", () => {
    expect(cond({ kind: "status", op: "eq", value: 100 })).toBe(true);
    expect(cond({ kind: "status", op: "eq", value: 99 })).toBe(false);
    expect(cond({ kind: "status", op: "eq", value: 600 })).toBe(false);
    expect(cond({ kind: "status", op: "eq" })).toBe(false);
  });

  it("rango con min ≤ max", () => {
    expect(cond({ kind: "status", op: "between", range: [400, 499] })).toBe(true);
    expect(cond({ kind: "status", op: "between", range: [500, 400] })).toBe(false);
    expect(cond({ kind: "status", op: "between" })).toBe(false);
  });

  it("lista de 1–50 códigos", () => {
    expect(cond({ kind: "status", op: "in", list: [500, 502] })).toBe(true);
    expect(cond({ kind: "status", op: "in", list: [] })).toBe(false);
    expect(cond({ kind: "status", op: "in", list: Array.from({ length: 51 }, () => 500) })).toBe(
      false,
    );
  });

  it("value obligatorio salvo exists/notExists/empty/notEmpty", () => {
    expect(cond({ kind: "header", name: "x-a", op: "exists" })).toBe(true);
    expect(cond({ kind: "header", name: "x-a", op: "equals" })).toBe(false);
    expect(cond({ kind: "header", name: "x-a", op: "equals", value: "1" })).toBe(true);
    expect(cond({ kind: "jsonPath", path: "$.items", op: "empty" })).toBe(true);
    expect(cond({ kind: "jsonPath", path: "$.items", op: "notEmpty" })).toBe(true);
    expect(cond({ kind: "jsonPath", path: "$.items", op: "contains" })).toBe(false);
  });

  it("matches exige una regex compilable ≤ 512", () => {
    expect(cond({ kind: "header", name: "x-a", op: "matches", value: "^a+$" })).toBe(true);
    expect(cond({ kind: "header", name: "x-a", op: "matches", value: "(" })).toBe(false);
    expect(
      cond({ kind: "graphqlOperation", op: "matches", value: "a".repeat(LIMITS.regexMax + 1) }),
    ).toBe(false);
  });

  it("los operadores numéricos de jsonPath exigen un número", () => {
    expect(cond({ kind: "jsonPath", path: "$.n", op: "gt", value: "3" })).toBe(true);
    expect(cond({ kind: "jsonPath", path: "$.n", op: "gt", value: "tres" })).toBe(false);
  });

  it("nombre de header como token HTTP", () => {
    expect(cond({ kind: "header", name: "x a", op: "exists" })).toBe(false);
  });
});

describe("ActionSchema", () => {
  const act = (value: unknown) => ActionSchema.safeParse(value).success;

  it("mock: status 100–599, headers ≤ 100, body ≤ 1 MB en reglas guardadas", () => {
    const mock = { kind: "mock", status: 503, headers: [], body: "{}", bodyEncoding: "text" };
    expect(act(mock)).toBe(true);
    expect(act({ ...mock, status: 99 })).toBe(false);
    const headers = Array.from({ length: 101 }, (_, i) => ({ name: `x-${i}`, value: "1" }));
    expect(act({ ...mock, headers })).toBe(false);
    expect(act({ ...mock, body: "x".repeat(LIMITS.savedMockBodyBytes + 1) })).toBe(false);
    expect(
      QueueMockActionSchema.safeParse({ ...mock, body: "x".repeat(LIMITS.savedMockBodyBytes + 1) })
        .success,
    ).toBe(true);
  });

  it("delay: entero 1–60,000", () => {
    expect(act({ kind: "delay", ms: 1 })).toBe(true);
    expect(act({ kind: "delay", ms: 60_000 })).toBe(true);
    expect(act({ kind: "delay", ms: 0 })).toBe(false);
    expect(act({ kind: "delay", ms: 60_001 })).toBe(false);
    expect(act({ kind: "delay", ms: 1.5 })).toBe(false);
  });

  it("fail: los siete errores de red", () => {
    for (const errorReason of [
      "failed",
      "aborted",
      "timedOut",
      "connectionRefused",
      "nameNotResolved",
      "accessDenied",
      "internetDisconnected",
    ]) {
      expect(act({ kind: "fail", errorReason })).toBe(true);
    }
    expect(act({ kind: "fail", errorReason: "blockedByClient" })).toBe(false);
  });

  it("pause y log sin campos", () => {
    expect(act({ kind: "pause" })).toBe(true);
    expect(act({ kind: "log" })).toBe(true);
  });
});

describe("Settings", () => {
  it("valores por defecto", () => {
    expect(DEFAULT_SETTINGS).toEqual({
      pauseTimeoutSeconds: 60,
      globalPaused: false,
      onboardingSeen: false,
      attachConsent: false,
      autoAttach: true,
      corsDefaultDurationMinutes: 480,
      productionOrigins: [],
    });
    expect(SettingsSchema.safeParse(DEFAULT_SETTINGS).success).toBe(true);
  });

  it("timeout de 5–300 s", () => {
    expect(SettingsSchema.safeParse({ ...DEFAULT_SETTINGS, pauseTimeoutSeconds: 4 }).success).toBe(
      false,
    );
    expect(
      SettingsSchema.safeParse({ ...DEFAULT_SETTINGS, pauseTimeoutSeconds: 301 }).success,
    ).toBe(false);
  });

  it("parseSettings aplica valores por defecto campo a campo", () => {
    const result = parseSettings({ pauseTimeoutSeconds: 999, globalPaused: true, extra: 1 });
    expect(result.settings).toEqual({ ...DEFAULT_SETTINGS, globalPaused: true });
    expect(result.invalidFields).toEqual(["pauseTimeoutSeconds"]);
    expect(parseSettings("basura")).toEqual({
      settings: DEFAULT_SETTINGS,
      invalidFields: ["*"],
      productionOriginsInvalid: false,
    });
    expect(parseSettings(undefined)).toEqual({
      settings: DEFAULT_SETTINGS,
      invalidFields: [],
      productionOriginsInvalid: false,
    });
  });
});

describe("Exchange y PausedItem", () => {
  const body = { available: true, size: 2 };
  const view = {
    pausedId: "interception-1",
    exchangeId: "net-1",
    stage: "response",
    ruleId: "3f1c2b4a-8d9e-4f60-a1b2-c3d4e5f60718",
    ruleName: "Errores",
    pausedAt: 1,
    expiresAt: 61_001,
    request: { method: "GET", url: "https://api.test/x", headers: [], body: null, bodyInfo: body },
    response: { status: 500, headers: [], body: "{}", bodyInfo: body },
  };

  it("PausedItemView válido; response null en etapa Request", () => {
    expect(PausedItemViewSchema.safeParse(view).success).toBe(true);
    expect(
      PausedItemViewSchema.safeParse({ ...view, stage: "request", response: null }).success,
    ).toBe(true);
  });

  it("ExchangeUpdate parcial y RuleEffect con los resultados de data-model", () => {
    expect(RULE_RESULTS).toContain("discarded_navigation");
    expect(
      ExchangeUpdateSchema.safeParse({
        id: "net-1",
        kind: "effect",
        fields: {},
        effect: {
          stage: "response",
          ruleId: view.ruleId,
          ruleName: "Errores",
          result: "unevaluable",
          reason: "binary",
        },
      }).success,
    ).toBe(true);
    expect(
      ExchangeUpdateSchema.safeParse({ id: "net-1", kind: "start", fields: { seq: -1 } }).success,
    ).toBe(false);
  });

  it("PausedEdit: headers ≤ 100 que reemplazan la lista, sin CR/LF", () => {
    const ok = (edit: unknown) => PausedEditSchema.safeParse(edit).success;
    expect(ok({ headers: [{ name: "x-a", value: "1" }] })).toBe(true);
    expect(ok({ headers: [{ name: "x-a", value: "1\r\nx: 2" }] })).toBe(false);
    expect(ok({ headers: [{ name: "x a", value: "1" }] })).toBe(false);
    const many = Array.from({ length: 101 }, (_, i) => ({ name: `x-${i}`, value: "1" }));
    expect(ok({ headers: many })).toBe(false);
  });

  it("PausedEdit: status 100–599, URL absoluta http(s), método token y body ≤ 5 MB", () => {
    const ok = (edit: unknown) => PausedEditSchema.safeParse(edit).success;
    expect(ok({ status: 200, url: "https://api.test/v2", method: "PATCH", body: "{}" })).toBe(true);
    expect(ok({ status: 600 })).toBe(false);
    expect(ok({ url: "/relativa" })).toBe(false);
    expect(ok({ url: ["javascript", "alert(1)"].join(":") })).toBe(false);
    expect(ok({ method: "GE T" })).toBe(false);
    expect(ok({ body: "x".repeat(LIMITS.bodyBytes + 1) })).toBe(false);
  });
});

describe("Settings de 003 (data-model, contracts/storage.md)", () => {
  it("defaults: 480 min y lista de producción vacía", () => {
    expect(DEFAULT_SETTINGS.corsDefaultDurationMinutes).toBe(480);
    expect(DEFAULT_SETTINGS.productionOrigins).toEqual([]);
  });

  it("duración solo 15/60/240/480", () => {
    for (const minutes of [15, 60, 240, 480])
      expect(
        SettingsSchema.safeParse({ ...DEFAULT_SETTINGS, corsDefaultDurationMinutes: minutes })
          .success,
      ).toBe(true);
    for (const minutes of [0, 30, 481, 1440])
      expect(
        SettingsSchema.safeParse({ ...DEFAULT_SETTINGS, corsDefaultDurationMinutes: minutes })
          .success,
      ).toBe(false);
  });

  it("productionOrigins: ≤ 100 entradas válidas y normalizadas, sin duplicados", () => {
    const ok = (productionOrigins: unknown) =>
      SettingsSchema.safeParse({ ...DEFAULT_SETTINGS, productionOrigins }).success;
    expect(ok(["https://*.empresa.com", "http://localhost:8080"])).toBe(true);
    expect(ok(["https://*.empresa.com", "https://*.empresa.com"])).toBe(false);
    expect(ok(["no es un origen"])).toBe(false);
    expect(ok(["https://App.Empresa.com"])).toBe(false);
    expect(ok(Array.from({ length: 101 }, (_, i) => `https://a${i}.test`))).toBe(false);
  });

  it("ajustes de 002 sin los campos nuevos ⇒ defaults sin invalidFields", () => {
    const { settings, invalidFields, productionOriginsInvalid } = parseSettings({
      pauseTimeoutSeconds: 60,
      globalPaused: false,
      onboardingSeen: true,
      attachConsent: true,
      autoAttach: true,
    });
    expect(invalidFields).toEqual([]);
    expect(productionOriginsInvalid).toBe(false);
    expect(settings.corsDefaultDurationMinutes).toBe(480);
    expect(settings.productionOrigins).toEqual([]);
  });

  it("una entrada inválida ⇒ conserva las válidas y marca productionOriginsInvalid", () => {
    const { settings, productionOriginsInvalid } = parseSettings({
      ...DEFAULT_SETTINGS,
      productionOrigins: ["https://*.empresa.com", "basura", 42, "https://*.empresa.com"],
    });
    expect(settings.productionOrigins).toEqual(["https://*.empresa.com"]);
    expect(productionOriginsInvalid).toBe(true);
  });

  it("productionOrigins que no es un arreglo ⇒ vacío e inválido", () => {
    const { settings, productionOriginsInvalid } = parseSettings({
      ...DEFAULT_SETTINGS,
      productionOrigins: "https://*.empresa.com",
    });
    expect(settings.productionOrigins).toEqual([]);
    expect(productionOriginsInvalid).toBe(true);
  });
});

const diagnosis = {
  cause: "missing_allow_origin",
  browserCode: "MissingAllowOriginHeader",
  failedParameter: null,
  atPreflight: false,
  appOrigin: "http://localhost:3000",
  apiOrigin: "https://api.test",
  method: "GET",
  requestedHeaders: [],
  credentials: "unknown",
  responseStatus: 200,
  preflightStatus: null,
  serverCorsHeaders: [],
  preflightExchangeId: null,
  relaxable: true,
};

describe("schemas CORS (data-model)", () => {
  it("CorsDiagnosis válido y sus límites", () => {
    expect(CorsDiagnosisSchema.safeParse(diagnosis).success).toBe(true);
    expect(CorsDiagnosisSchema.safeParse({ ...diagnosis, cause: "otra" }).success).toBe(false);
    expect(
      CorsDiagnosisSchema.safeParse({
        ...diagnosis,
        requestedHeaders: Array.from({ length: 51 }, (_, i) => `x-h${i}`),
      }).success,
    ).toBe(false);
    expect(
      CorsDiagnosisSchema.safeParse({
        ...diagnosis,
        serverCorsHeaders: Array.from({ length: 21 }, () => ({
          name: "access-control-allow-origin",
          value: "*",
        })),
      }).success,
    ).toBe(false);
    expect(
      CorsDiagnosisSchema.safeParse({ ...diagnosis, browserCode: "x".repeat(65) }).success,
    ).toBe(false);
    expect(
      CorsDiagnosisSchema.safeParse({ ...diagnosis, failedParameter: "x".repeat(257) }).success,
    ).toBe(false);
    expect(
      CorsDiagnosisSchema.safeParse({
        ...diagnosis,
        relaxable: false,
        notRelaxableReason: "null_origin",
        appOrigin: null,
      }).success,
    ).toBe(true);
  });

  it("CorsRelaxedInfo con límites de added, removed y errorKey", () => {
    const info = {
      relaxationId: "3f1c2b4a-8d9e-4f60-a1b2-c3d4e5f60718",
      added: [{ name: "access-control-allow-origin", value: "http://localhost:3000" }],
      removed: [],
      preflightReplaced: false,
      serverStatus: 200,
      alreadyValid: false,
    };
    expect(CorsRelaxedInfoSchema.safeParse(info).success).toBe(true);
    expect(
      CorsRelaxedInfoSchema.safeParse({ ...info, errorKey: "cors_apply_failed", added: [] })
        .success,
    ).toBe(true);
    expect(CorsRelaxedInfoSchema.safeParse({ ...info, errorKey: "x".repeat(129) }).success).toBe(
      false,
    );
    expect(
      CorsRelaxedInfoSchema.safeParse({
        ...info,
        added: Array.from({ length: 11 }, () => info.added[0]),
      }).success,
    ).toBe(false);
  });

  it("RelaxationView: ≤ 30 Expose-Headers, estados conocidos", () => {
    const view = {
      id: "3f1c2b4a-8d9e-4f60-a1b2-c3d4e5f60718",
      appOrigin: "http://localhost:3000",
      apiOrigin: "https://api.test",
      exposeHeaders: ["x-total"],
      credentials: false,
      createdAt: 1,
      expiresAt: 2,
      state: "active",
    };
    expect(RelaxationViewSchema.safeParse(view).success).toBe(true);
    expect(RelaxationViewSchema.safeParse({ ...view, state: "otro" }).success).toBe(false);
    expect(
      RelaxationViewSchema.safeParse({
        ...view,
        exposeHeaders: Array.from({ length: 31 }, (_, i) => `x-${i}`),
      }).success,
    ).toBe(false);
    expect(RelaxationViewSchema.safeParse({ ...view, exposeHeaders: ["*"] }).success).toBe(false);
  });

  it("ExchangeUpdate admite kind cors con diagnóstico", () => {
    expect(
      ExchangeUpdateSchema.safeParse({
        id: "e1",
        kind: "cors",
        fields: {},
        cors: { diagnosis },
      }).success,
    ).toBe(true);
    expect(
      ExchangeUpdateSchema.safeParse({
        id: "e1",
        kind: "start",
        fields: { appOrigin: "http://localhost:3000" },
      }).success,
    ).toBe(true);
  });
});
