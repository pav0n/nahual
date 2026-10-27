import { describe, expect, it } from "vitest";
import { selectChain, type ExchangeView, type SelectContext } from "../src/evaluate.ts";
import type { Rule } from "../src/schemas/rule.ts";
import { SITE, rule } from "./fixtures.ts";

// 006 (research R8, FR-012): cadena de reglas con hook.

const view = (overrides: Partial<ExchangeView> = {}): ExchangeView => ({
  method: "GET",
  url: "https://api.test/api/items",
  resourceType: "Fetch",
  requestHeaders: [],
  requestBody: { kind: "none" },
  status: 200,
  responseHeaders: [],
  responseBody: { kind: "text", text: '{"items":[]}' },
  ...overrides,
});

const ctx = (overrides: Partial<SelectContext> = {}): SelectContext => ({
  site: SITE,
  stage: "response",
  globalPaused: false,
  ...overrides,
});

const hookAction = {
  kind: "hook" as const,
  source: "export default (ctx) => ctx;",
  imported: false,
  permissions: { changeDestination: false, readSensitive: false },
  check: { hash: "00", ok: true },
};

let n = 0;
const make = (order: number, overrides: Partial<Rule> = {}): Rule =>
  rule({ id: `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`, order, ...overrides });
const hook = (order: number, overrides: Partial<Rule> = {}) =>
  make(order, { action: hookAction, ...overrides });
const ids = (rules: Rule[]) => rules.map((r) => r.order);

describe("selectChain", () => {
  it("una regla de otra acción arriba gana sola, como selectRule (002)", () => {
    const mock = make(0, { action: { kind: "log" } });
    const result = selectChain([hook(1), mock], view(), ctx());
    expect(result).toEqual({ kind: "match", rule: mock });
  });

  it("un hook arriba arma la cadena con todos los hooks que cumplen, en orden, sin las de otras acciones", () => {
    const rules = [hook(2), make(1, { action: { kind: "pause" } }), hook(0), hook(3)];
    const result = selectChain(rules, view(), ctx());
    expect(result.kind).toBe("chain");
    expect(result.kind === "chain" && ids(result.rules)).toEqual([0, 2, 3]);
  });

  it("deja fuera los hooks que no cumplen, los desactivados y los de otra etapa o sitio", () => {
    const rules = [
      hook(0),
      hook(1, { prefilter: { kind: "glob", pattern: "*/otra/*" } }),
      hook(2, { enabled: false }),
      hook(3, { stage: "request" }),
      hook(4, { site: "http://otro.test" }),
      hook(5),
    ];
    const result = selectChain(rules, view(), ctx());
    expect(result.kind === "chain" && ids(result.rules)).toEqual([0, 5]);
  });

  it("pide el body si una regla de la cadena lo necesita para decidir", () => {
    const jsonPath = hook(1, {
      conditions: [{ kind: "jsonPath", path: "$.items", op: "exists" }],
    } as Partial<Rule>);
    const result = selectChain(
      [hook(0), jsonPath],
      view({ responseBody: { kind: "unknown" } }),
      ctx(),
    );
    expect(result).toEqual({ kind: "needsBody" });
  });

  it("con 'pausar Nahual' o sin sitio no hay nada", () => {
    expect(selectChain([hook(0)], view(), ctx({ globalPaused: true }))).toEqual({ kind: "none" });
    expect(selectChain([hook(0)], view(), ctx({ site: null }))).toEqual({ kind: "none" });
  });

  it("sin reglas que cumplan, none", () => {
    expect(selectChain([], view(), ctx())).toEqual({ kind: "none" });
  });
});

describe("perfil activo (007, FR-020)", () => {
  const P = "0b8f8a52-4a0c-4d0e-9f3a-6c1d2e3f4a5b";
  const Q = "1c9f8a52-4a0c-4d0e-9f3a-6c1d2e3f4a5b";

  it("sin perfil activo (null o ausente) se comporta como en 006", () => {
    const rules = [make(0, { profileIds: [Q] }), make(1)];
    expect(selectChain(rules, view(), ctx({ activeProfileId: null }))).toMatchObject({
      kind: "match",
      rule: { order: 0 },
    });
    expect(selectChain(rules, view(), ctx())).toMatchObject({ kind: "match", rule: { order: 0 } });
  });

  it("con un perfil activo solo participan las reglas de ese perfil", () => {
    const rules = [make(0, { profileIds: [Q] }), make(1), make(2, { profileIds: [P, Q] })];
    expect(selectChain(rules, view(), ctx({ activeProfileId: P }))).toMatchObject({
      kind: "match",
      rule: { order: 2 },
    });
  });

  it("la cadena de hooks también se filtra por perfil", () => {
    const rules = [hook(0, { profileIds: [P] }), hook(1), hook(2, { profileIds: [P] })];
    const selection = selectChain(rules, view(), ctx({ activeProfileId: P }));
    expect(selection.kind).toBe("chain");
    if (selection.kind === "chain") expect(ids(selection.rules)).toEqual([0, 2]);
  });

  it("un perfil sin reglas no aplica nada", () => {
    expect(selectChain([make(0)], view(), ctx({ activeProfileId: P }))).toEqual({ kind: "none" });
  });
});
