import { describe, expect, it } from "vitest";
import { FORMATS, exportAs, fileNameFor, formatAvailability } from "../../src/export/index.ts";
import {
  failed,
  getBinary,
  getItems,
  itemPages,
  postItem,
  postUpload,
} from "../fixtures-export.ts";
import { leaked, nth, sourceOf } from "./helpers.ts";

const opts = { appVersion: "1.0.0", includeSensitive: false };
const EXPORTS = ["curl", "fetch", "vitest", "msw", "zod", "postman"] as const;

describe("exportAs (007, contracts/exporters.md, data-model)", () => {
  it("FORMATS: extensión, respuesta necesaria y lote", () => {
    expect(FORMATS).toEqual({
      curl: { extension: ".sh", needsResponse: "no", batch: false },
      fetch: { extension: ".ts", needsResponse: "no", batch: false },
      vitest: { extension: ".contract.test.ts", needsResponse: "yes", batch: false },
      msw: { extension: ".ts", needsResponse: "yes", batch: true },
      zod: { extension: ".schema.ts", needsResponse: "json", batch: true },
      postman: { extension: ".postman_collection.json", needsResponse: "optional", batch: true },
    });
  });

  it("las seis salidas de un request con Authorization, Cookie y ?token= no filtran nada (SC-004)", () => {
    for (const format of EXPORTS) {
      const sources = format === "zod" ? [sourceOf(getItems)] : [sourceOf(postItem)];
      const result = exportAs(format, sources, opts);
      expect(leaked(result.code), format).toEqual([]);
    }
    expect(exportAs("curl", [sourceOf(postItem)], opts).redacted).toHaveLength(4);
  });

  it("includeSensitive incluye los valores y no cuenta redactados", () => {
    const result = exportAs("curl", [sourceOf(getItems)], { ...opts, includeSensitive: true });
    expect(result.code).toContain("Bearer secret-export-token");
    expect(result.redacted).toEqual([]);
  });

  it("marcadores por formato: env en Vitest, variables en Postman", () => {
    expect(exportAs("vitest", [sourceOf(getItems)], opts).code).toContain(
      'env("NAHUAL_AUTHORIZATION")',
    );
    expect(exportAs("postman", [sourceOf(getItems)], opts).code).toContain(
      "{{nahual_authorization}}",
    );
  });

  it("disponibilidad: respuesta, JSON, mismo endpoint y lote", () => {
    expect(formatAvailability("curl", [sourceOf(failed)])).toEqual({ ok: true });
    expect(formatAvailability("vitest", [sourceOf(failed)])).toEqual({
      ok: false,
      reasonKey: "export_format_needs_response",
    });
    expect(formatAvailability("zod", [sourceOf(getBinary)])).toEqual({
      ok: false,
      reasonKey: "export_format_needs_json",
    });
    expect(formatAvailability("zod", itemPages.map(sourceOf))).toEqual({ ok: true });
    expect(formatAvailability("zod", [sourceOf(getItems), sourceOf(postItem)])).toEqual({
      ok: false,
      reasonKey: "batch_export_zod_same_endpoint",
    });
    expect(formatAvailability("curl", itemPages.map(sourceOf))).toEqual({
      ok: false,
      reasonKey: "export_format_single",
    });
    expect(formatAvailability("msw", [sourceOf(failed), sourceOf(getItems)])).toEqual({ ok: true });
    expect(() => exportAs("vitest", [sourceOf(failed)], opts)).toThrow(
      "export_format_needs_response",
    );
  });

  it("fileNameFor por formato", () => {
    const one = [sourceOf(postItem)];
    expect(fileNameFor("curl", one)).toBe("post-export-items.sh");
    expect(fileNameFor("fetch", one)).toBe("post-export-items.ts");
    expect(fileNameFor("vitest", one)).toBe("post-export-items.contract.test.ts");
    expect(fileNameFor("msw", one)).toBe("handlers.ts");
    expect(fileNameFor("zod", one)).toBe("export-items.schema.ts");
    expect(fileNameFor("postman", one)).toBe("nahual-127.0.0.1-4311.postman_collection.json");
    expect(
      fileNameFor("curl", [
        { ...nth(one, 0), request: { ...nth(one, 0).request, url: "http://a.test/" } },
      ]),
    ).toBe("post-root.sh");
    expect(exportAs("msw", [sourceOf(postUpload)], opts).fileName).toBe("handlers.ts");
  });

  it("MSW por lote devuelve omitidos y fusionados", () => {
    const result = exportAs("msw", [sourceOf(failed), ...itemPages.map(sourceOf)], opts);
    expect(result.omitted).toEqual([{ index: 0, reasonKey: "export_reason_no_response" }]);
    expect(result.merged).toEqual([{ endpoint: "GET /export/items", count: 3 }]);
  });
});
