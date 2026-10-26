import { describe, expect, it, vi } from "vitest";
import { BATCH_ACTIONS, batchEnabled } from "../../src/panel/actions/batch-actions.ts";
import { usePanelStore } from "../../src/panel/store/index.ts";
import { exchange } from "../fakes/exchanges.ts";

describe("acciones por lote (007, FR-016c, contracts/panel-ui.md)", () => {
  it("exactamente tres, desde 2 filas, y la selección múltiple existe", () => {
    expect(BATCH_ACTIONS.map((a) => [a.id, a.minSelected])).toEqual([
      ["exportMsw", 2],
      ["exportZod", 2],
      ["exportPostman", 2],
    ]);
    expect(batchEnabled()).toBe(true);
  });

  it("Zod solo con filas del mismo método y ruta (sin query)", () => {
    const zod = BATCH_ACTIONS.find((a) => a.id === "exportZod");
    const a = exchange({ id: "a", url: "https://api.test/items?page=1" });
    const b = exchange({ id: "b", url: "https://api.test/items?page=2" });
    const c = exchange({ id: "c", url: "https://api.test/users" });
    expect(zod?.enabled?.([a, b])).toBe(true);
    expect(zod?.enabled?.([a, c])).toBe(false);
    expect(zod?.enabled?.([a, exchange({ id: "d", method: "POST", url: a.url })])).toBe(false);
    expect(zod?.disabledReasonKey).toBe("batch_export_zod_same_endpoint");
  });

  it("cada acción abre la exportación con su formato", () => {
    const open = vi.spyOn(usePanelStore.getState(), "openExport");
    usePanelStore.setState({ openExport: open });
    for (const [id, format] of [
      ["exportMsw", "msw"],
      ["exportZod", "zod"],
      ["exportPostman", "postman"],
    ] as const) {
      BATCH_ACTIONS.find((a) => a.id === id)?.run(["a", "b"]);
      expect(open).toHaveBeenLastCalledWith({ kind: "traffic", exchangeIds: ["a", "b"], format });
    }
  });
});
