import { describe, expect, it } from "vitest";
import {
  DETAIL_TABS,
  detailTabsFor,
  initialDetailTab,
} from "../../src/panel/components/traffic/detail-tabs.ts";
import { blocked, exchange, pausedItem } from "../fakes/exchanges.ts";

const relaxed = exchange({
  cors: {
    relaxed: {
      relaxationId: "6f0c2a52-6a1e-4c55-9d0a-2f6a1c1f9a10",
      added: [],
      removed: [],
      preflightReplaced: false,
      serverStatus: 200,
      alreadyValid: false,
    },
  },
});

describe("pestañas del detalle (004, FR-018, research R10)", () => {
  it("el catálogo es CORS, Editar, Headers, Request, Response", () => {
    expect(DETAIL_TABS.map((tab) => tab.id)).toEqual([
      "cors",
      "edit",
      "headers",
      "request",
      "response",
    ]);
  });

  it("CORS primero si fue bloqueado por CORS", () => {
    expect(initialDetailTab(blocked(), null)).toBe("cors");
  });

  it("Editar primero si tiene un pausado activo", () => {
    expect(initialDetailTab(exchange(), pausedItem())).toBe("edit");
  });

  it("Headers primero en cualquier otro caso, también si fue relajado", () => {
    expect(initialDetailTab(exchange(), null)).toBe("headers");
    expect(initialDetailTab(relaxed, null)).toBe("headers");
  });

  it("CORS solo con información CORS (bloqueo, relajación o preflight relacionado)", () => {
    expect(detailTabsFor(exchange(), null, false)).toEqual(["headers", "request", "response"]);
    expect(detailTabsFor(blocked(), null, false)).toEqual([
      "cors",
      "headers",
      "request",
      "response",
    ]);
    expect(detailTabsFor(relaxed, null, false)[0]).toBe("cors");
    expect(detailTabsFor(exchange(), null, true)[0]).toBe("cors");
  });

  it("Editar solo para pausados", () => {
    expect(detailTabsFor(exchange(), pausedItem(), false)).toEqual([
      "edit",
      "headers",
      "request",
      "response",
    ]);
  });
});
