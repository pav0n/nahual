import { LIMITS } from "@nahual/domain";
import { describe, expect, it, vi } from "vitest";
import {
  repeaterExportSource,
  trafficExportSources,
  type BodyLoader,
} from "../../src/panel/export/build-source.ts";
import { exchange } from "../fakes/exchanges.ts";

const json = { encoding: "text" as const, content: '{"ok":true}', size: 11 };

describe("fuentes de exportación desde Tráfico (007, T024, research R2)", () => {
  it("pide solo los bodies disponibles, en orden, e informa del progreso", async () => {
    const load = vi.fn<BodyLoader>(() => Promise.resolve(json));
    const progress: [number, number][] = [];
    const a = exchange({ id: "a", responseBody: { available: true, size: 11 } });
    const b = exchange({
      id: "b",
      method: "POST",
      requestBody: { available: true, size: 3 },
      responseBody: { available: true, size: 11 },
    });
    const { sources, exchangeIds, omitted } = await trafficExportSources(
      [a, b],
      load,
      (done, total) => progress.push([done, total]),
    );
    expect(load.mock.calls).toEqual([
      ["a", "response"],
      ["b", "request"],
      ["b", "response"],
    ]);
    expect(progress.at(-1)).toEqual([2, 2]);
    expect(exchangeIds).toEqual(["a", "b"]);
    expect(omitted).toEqual([]);
    expect(sources[0]?.response?.body).toEqual({
      kind: "text",
      text: '{"ok":true}',
      contentType: "application/json",
    });
  });

  it("omite preflights y lo que pasa de 50, con motivo", async () => {
    const many = Array.from({ length: LIMITS.exportBatchMax + 2 }, (_, i) =>
      exchange({ id: `e${i}` }),
    );
    const pre = exchange({ id: "pre", isPreflight: true });
    const { sources, omitted } = await trafficExportSources([pre, ...many], () =>
      Promise.resolve(null),
    );
    expect(sources).toHaveLength(LIMITS.exportBatchMax);
    expect(omitted).toEqual([
      { exchangeId: "pre", reasonKey: "export_reason_preflight" },
      { exchangeId: "e50", reasonKey: "export_reason_batch_limit" },
      { exchangeId: "e51", reasonKey: "export_reason_batch_limit" },
    ]);
  });

  it("un body que ya no está se marca como no disponible", async () => {
    const { sources } = await trafficExportSources(
      [exchange({ responseBody: { available: true, size: 9 } })],
      () => Promise.resolve(null),
    );
    expect(sources[0]?.response?.body).toEqual({
      kind: "omitted",
      reason: "unavailable",
      size: null,
    });
  });
});

describe("fuente de exportación desde el repeater (US1-6)", () => {
  it("usa el request en edición y la respuesta del envío mostrado", () => {
    const source = repeaterExportSource(
      { method: "GET", url: "https://api.test/x", headers: [], body: { kind: "none" } },
      {
        status: 200,
        headers: [{ name: "content-type", value: "application/json" }],
        body: { encoding: "text", text: "{}" },
        mimeType: "application/json",
      },
      7,
    );
    expect(source.request.url).toBe("https://api.test/x");
    expect(source.response?.status).toBe(200);
    expect(source.capturedAt).toBe(7);
  });
});
