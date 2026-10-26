import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { RelaxationView } from "@nahual/domain";
import { describe, expect, it, vi } from "vitest";
import {
  REQUEST_ACTIONS,
  applicableActions,
  type ActionEffects,
} from "../../src/panel/actions/request-actions.ts";
import { SHORTCUTS } from "../../src/panel/shortcuts.ts";
import { blocked, diagnosis, exchange, pausedItem } from "../fakes/exchanges.ts";

const locales = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../public/_locales");
const messages = (lang: string) =>
  JSON.parse(readFileSync(path.join(locales, lang, "messages.json"), "utf8")) as Record<
    string,
    unknown
  >;

const relaxation = (overrides: Partial<RelaxationView> = {}): RelaxationView => ({
  id: "6f0c2a52-6a1e-4c55-9d0a-2f6a1c1f9a10",
  appOrigin: "http://localhost:3000",
  apiOrigin: "https://api.test",
  exposeHeaders: [],
  credentials: false,
  createdAt: 1,
  expiresAt: 2,
  state: "active",
  ...overrides,
});

const none = { relaxations: [] };
const ids = (list: readonly { id: string }[]) => list.map((a) => a.id);

describe("catálogo de acciones del request (004, research R6, FR-020/022)", () => {
  it("orden: crear regla, enviar al repeater (005), exportar (007), permitir CORS", () => {
    expect(ids(REQUEST_ACTIONS)).toEqual(["createRule", "sendToRepeater", "export", "relaxCors"]);
  });

  it("exportar (007, FR-008): cualquier request salvo preflight, con su atajo", () => {
    expect(ids(applicableActions(exchange(), none))).toContain("export");
    expect(
      ids(applicableActions(exchange({ isPreflight: true, method: "OPTIONS" }), none)),
    ).not.toContain("export");
    const action = REQUEST_ACTIONS.find((a) => a.id === "export");
    expect(action?.shortcut).toBe("exportRequest");
    const effects = { openExport: vi.fn() } as unknown as ActionEffects;
    action?.run(exchange({ id: "ex-9" }), effects);
    expect(effects.openExport).toHaveBeenCalledWith(["ex-9"]);
  });

  it("ids únicos; atajos y textos existen", () => {
    expect(new Set(ids(REQUEST_ACTIONS)).size).toBe(REQUEST_ACTIONS.length);
    const shortcutIds = new Set(SHORTCUTS.map((s) => s.id));
    for (const action of REQUEST_ACTIONS) {
      if (action.shortcut) expect(shortcutIds.has(action.shortcut)).toBe(true);
      for (const lang of ["es", "en"]) expect(messages(lang)).toHaveProperty(action.labelKey);
    }
  });

  it("enviar al repeater aplica a cualquier request (FR-001), también preflight y pausado", () => {
    expect(ids(applicableActions(exchange(), none))).toContain("sendToRepeater");
    expect(
      ids(applicableActions(exchange({ isPreflight: true, method: "OPTIONS" }), none)),
    ).toContain("sendToRepeater");
    expect(ids(applicableActions(exchange(), { ...none, paused: pausedItem() }))).toContain(
      "sendToRepeater",
    );
  });

  it("crear regla aplica a cualquier request, también preflight y pausado", () => {
    expect(ids(applicableActions(exchange(), none))).toContain("createRule");
    expect(
      ids(applicableActions(exchange({ isPreflight: true, method: "OPTIONS" }), none)),
    ).toContain("createRule");
    expect(ids(applicableActions(exchange(), { ...none, paused: pausedItem() }))).toContain(
      "createRule",
    );
  });

  it("permitir CORS solo para bloqueados sin relajación activa que los cubra", () => {
    expect(ids(applicableActions(exchange(), none))).toEqual([
      "createRule",
      "sendToRepeater",
      "export",
    ]);
    expect(ids(applicableActions(blocked(), none))).toEqual([
      "createRule",
      "sendToRepeater",
      "export",
      "relaxCors",
    ]);
    expect(ids(applicableActions(blocked(), { relaxations: [relaxation()] }))).toEqual([
      "createRule",
      "sendToRepeater",
      "export",
    ]);
    // Una relajación de otro par de orígenes no la cubre.
    expect(
      ids(
        applicableActions(blocked(), {
          relaxations: [relaxation({ apiOrigin: "https://otra.test" })],
        }),
      ),
    ).toEqual(["createRule", "sendToRepeater", "export", "relaxCors"]);
  });

  it("permitir CORS nunca para un preflight", () => {
    const preflight = blocked({ isPreflight: true, method: "OPTIONS" });
    expect(ids(applicableActions(preflight, none))).toEqual(["createRule", "sendToRepeater"]);
  });

  it("permitir CORS no aplica si el diagnóstico no es relajable (003 FR-007)", () => {
    const fixed = blocked({ cors: { diagnosis: diagnosis({ relaxable: false }) } });
    expect(ids(applicableActions(fixed, none))).toEqual(["createRule", "sendToRepeater", "export"]);
  });

  it("crear regla abre Reglas con el borrador; permitir CORS abre la confirmación en el detalle", () => {
    const effects: ActionEffects = {
      openRuleDraft: vi.fn(),
      openDetail: vi.fn(),
      requestRelax: vi.fn(),
      sendToRepeater: vi.fn(),
      openExport: vi.fn(),
    };
    const [createRule, sendToRepeater, , relaxCors] = REQUEST_ACTIONS;
    sendToRepeater?.run(exchange(), effects);
    expect(effects.sendToRepeater).toHaveBeenCalledWith(exchange());
    createRule?.run(exchange(), effects);
    expect(effects.openRuleDraft).toHaveBeenCalledWith(
      expect.objectContaining({ name: "GET /items", stage: "response" }),
    );
    relaxCors?.run(blocked(), effects);
    expect(effects.openDetail).toHaveBeenCalledWith("ex-1", "cors");
    expect(effects.requestRelax).toHaveBeenCalledWith("ex-1");
  });
});
