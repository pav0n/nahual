import { DEFAULT_SETTINGS, type CorsDiagnosis, type Settings } from "@nahual/domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCorsRelaxer, type CorsRelaxer } from "../../src/background/cors-relaxer.ts";

const APP = "http://localhost:3000";
const API = "https://api-dev.empresa.com";
const HOUR = 60 * 60 * 1000;

const setScale = (scale: number) => {
  const time = (globalThis as { __nahualCorsTimeScale?: { scale: number } }).__nahualCorsTimeScale;
  if (!time) throw new Error("sin escala de tiempo (build de pruebas)");
  time.scale = scale;
};
const lifetime = (view: { createdAt: number; expiresAt: number } | undefined) =>
  view ? view.expiresAt - view.createdAt : NaN;

let relaxer: CorsRelaxer;
let settings: Settings;
let readable: boolean;
let attached: Set<number>;
let frames: Map<number, Set<string>>;
let changes: number[];
let notices: { tabId: number; key: string }[];

const draft = (overrides = {}) => ({
  appOrigin: APP,
  apiOrigin: API,
  durationMinutes: 480 as const,
  exposeHeaders: [] as string[],
  credentials: false,
  ...overrides,
});

const diagnosis = (overrides: Partial<CorsDiagnosis> = {}): CorsDiagnosis => ({
  cause: "missing_allow_credentials",
  browserCode: "InvalidAllowCredentials",
  failedParameter: null,
  atPreflight: false,
  appOrigin: APP,
  apiOrigin: API,
  method: "GET",
  requestedHeaders: [],
  credentials: "yes",
  responseStatus: 200,
  preflightStatus: null,
  serverCorsHeaders: [],
  preflightExchangeId: null,
  relaxable: true,
  ...overrides,
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
  settings = { ...DEFAULT_SETTINGS };
  readable = true;
  attached = new Set([1, 2]);
  frames = new Map([
    [1, new Set([APP])],
    [2, new Set([APP])],
  ]);
  changes = [];
  notices = [];
  relaxer = createCorsRelaxer({
    settings: () => settings,
    productionListReadable: () => readable,
    isAttached: (tabId) => attached.has(tabId),
    hasFrameOrigin: (tabId, origin) => frames.get(tabId)?.has(origin) ?? false,
    onChange: (tabId) => void changes.push(tabId),
    onNotice: (tabId, key) => void notices.push({ tabId, key }),
  });
});

afterEach(() => {
  vi.useRealTimers();
  setScale(1);
});

describe("CorsRelaxer: crear (FR-008, FR-009, FR-022, FR-029)", () => {
  it("crea con la duración pedida y avisa del cambio de la pestaña", () => {
    const result = relaxer.create(1, draft({ durationMinutes: 60 }));
    expect(result.ok).toBe(true);
    const [view] = relaxer.views(1);
    expect(view).toMatchObject({ appOrigin: APP, apiOrigin: API, state: "active" });
    expect(lifetime(view)).toBe(HOUR);
    expect(relaxer.views(2)).toEqual([]);
    expect(changes).toEqual([1]);
    expect(relaxer.count(1)).toBe(1);
  });

  it("valida con los ajustes del SW: producción y lista ilegible", () => {
    settings = { ...settings, productionOrigins: ["https://*.empresa.com"] };
    expect(relaxer.create(1, draft())).toMatchObject({
      ok: false,
      code: "relaxation_invalid",
      issues: [{ messageKey: "cors_issue_production_origin" }],
    });
    settings = { ...settings, productionOrigins: [] };
    readable = false;
    expect(relaxer.create(1, draft())).toMatchObject({
      issues: [{ messageKey: "cors_issue_production_list_invalid" }],
    });
    expect(relaxer.count(1)).toBe(0);
    expect(changes).toEqual([]);
  });

  it("sin debugger adjunto ⇒ not_attached", () => {
    attached.delete(1);
    expect(relaxer.create(1, draft())).toEqual({ ok: false, code: "not_attached" });
  });

  it("11.º origen ⇒ limit_reached; repetido ⇒ already_relaxed", () => {
    for (let i = 0; i < 10; i++) relaxer.create(1, draft({ apiOrigin: `https://a${i}.test` }));
    expect(relaxer.create(1, draft())).toMatchObject({
      issues: [{ messageKey: "cors_issue_limit_reached" }],
    });
    expect(relaxer.create(1, draft({ apiOrigin: "https://a0.test" }))).toMatchObject({
      issues: [{ messageKey: "cors_issue_already_relaxed" }],
    });
  });
});

describe("CorsRelaxer: alcance (FR-009)", () => {
  it("match solo en la pestaña, con el origen de la app y de la API declarados", () => {
    relaxer.create(1, draft());
    expect(relaxer.match(1, API, APP)).not.toBeNull();
    expect(relaxer.match(2, API, APP)).toBeNull();
    expect(relaxer.match(1, "https://tercero.test", APP)).toBeNull();
    expect(relaxer.match(1, API, "https://otra-app.test")).toBeNull();
    expect(relaxer.match(1, API, null)).toBeNull();
  });

  it("patrones de Fetch: Response por origen relajado activo", () => {
    relaxer.create(1, draft());
    expect(relaxer.patterns(1)).toEqual([{ origin: API, requestStage: false }]);
    expect(relaxer.patterns(2)).toEqual([]);
  });
});

describe("CorsRelaxer: fin (FR-016, FR-021, research R10)", () => {
  it("vence por el temporizador con aviso", () => {
    relaxer.create(1, draft({ durationMinutes: 15 }));
    changes = [];
    vi.advanceTimersByTime(15 * 60 * 1000);
    expect(relaxer.count(1)).toBe(0);
    expect(notices).toEqual([{ tabId: 1, key: "cors_ended_expired" }]);
    expect(changes).toEqual([1]);
  });

  it("aunque el temporizador se retrase, match no relaja nada vencido", () => {
    relaxer.create(1, draft({ durationMinutes: 15 }));
    vi.setSystemTime(1_000_000 + 15 * 60 * 1000 + 1);
    expect(relaxer.match(1, API, APP)).toBeNull();
    expect(relaxer.count(1)).toBe(0);
    expect(notices).toEqual([{ tabId: 1, key: "cors_ended_expired" }]);
  });

  it("el dev la apaga: sin aviso; end sin id termina todas; id terminado no falla", () => {
    const a = relaxer.create(1, draft());
    relaxer.create(1, draft({ apiOrigin: "https://b.test" }));
    relaxer.end(1, a.ok ? a.id : null, "user");
    expect(relaxer.count(1)).toBe(1);
    relaxer.end(1, null, "user");
    expect(relaxer.count(1)).toBe(0);
    relaxer.end(1, a.ok ? a.id : null, "user");
    expect(notices).toEqual([]);
  });

  it("al soltar el debugger o cerrar la pestaña", () => {
    relaxer.create(1, draft());
    relaxer.sessionEnded(1);
    expect(relaxer.count(1)).toBe(0);
    expect(notices).toEqual([{ tabId: 1, key: "cors_ended_detached" }]);
    vi.advanceTimersByTime(9 * HOUR);
    expect(notices).toHaveLength(1);
  });

  it("al marcar su origen como producción", () => {
    relaxer.create(1, draft());
    relaxer.create(1, draft({ apiOrigin: "https://otra.test" }));
    settings = { ...settings, productionOrigins: ["https://*.empresa.com"] };
    relaxer.settingsChanged();
    expect(relaxer.views(1).map((v) => v.apiOrigin)).toEqual(["https://otra.test"]);
    expect(notices).toEqual([{ tabId: 1, key: "cors_ended_production" }]);
  });
});

describe("CorsRelaxer: estados (FR-019, FR-025)", () => {
  it("suspended con pausar Nahual: sin match ni patrones", () => {
    relaxer.create(1, draft());
    settings = { ...settings, globalPaused: true };
    changes = [];
    relaxer.settingsChanged();
    expect(relaxer.views(1)[0]?.state).toBe("suspended");
    expect(relaxer.match(1, API, APP)).toBeNull();
    expect(relaxer.patterns(1)).toEqual([]);
    expect(changes).toEqual([1]);
  });

  it("idle sin frames del origen de la app y de vuelta active", () => {
    relaxer.create(1, draft());
    frames.set(1, new Set(["https://otro.test"]));
    changes = [];
    relaxer.refresh(1);
    expect(relaxer.views(1)[0]?.state).toBe("idle");
    expect(changes).toEqual([1]);
    frames.set(1, new Set([APP]));
    relaxer.refresh(1);
    expect(relaxer.views(1)[0]?.state).toBe("active");
    relaxer.refresh(1);
    expect(changes).toEqual([1, 1]);
  });
});

describe("CorsRelaxer: aprendizaje (research R5, R1/X5)", () => {
  it("InvalidAllowCredentials con relajación activa ⇒ credentials y aviso", () => {
    relaxer.create(1, draft());
    relaxer.noteFailure(1, `${API}/items`, diagnosis());
    expect(relaxer.views(1)[0]?.credentials).toBe(true);
    expect(notices).toEqual([{ tabId: 1, key: "cors_credentials_learned" }]);
  });

  it("preflight con redirección visto antes de relajar ⇒ se siembra al crear", () => {
    relaxer.noteFailure(
      1,
      `${API}/cors/preflight-redirect?x=1`,
      diagnosis({ cause: "preflight_redirect", credentials: "unknown" }),
    );
    relaxer.create(1, draft());
    expect(relaxer.patterns(1)).toEqual([{ origin: API, requestStage: true }]);
    expect(relaxer.redirecting(1, `${API}/cors/preflight-redirect?y=2`, APP)).not.toBeNull();
    expect(relaxer.redirecting(1, `${API}/otra`, APP)).toBeNull();
  });

  it("learnRedirect añade la URL y avisa del cambio de patrones", () => {
    const created = relaxer.create(1, draft());
    changes = [];
    relaxer.learnRedirect(1, created.ok ? created.id : "", `${API}/r`);
    expect(relaxer.redirecting(1, `${API}/r`, APP)).not.toBeNull();
    expect(changes).toEqual([1]);
  });
});

describe("CorsRelaxer: escala de tiempo del build de pruebas (research R16)", () => {
  it("divide la duración", () => {
    setScale(60);
    relaxer.create(1, draft({ durationMinutes: 15 }));
    const [view] = relaxer.views(1);
    expect(lifetime(view)).toBe(15 * 1000);
  });
});
