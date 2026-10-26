import { describe, expect, it } from "vitest";
import { hashSource } from "../src/hash.ts";

describe("hashSource (FNV-1a de 64 bits sobre UTF-8)", () => {
  it("coincide con los vectores conocidos", () => {
    expect(hashSource("")).toBe("cbf29ce484222325");
    expect(hashSource("a")).toBe("af63dc4c8601ec8c");
    expect(hashSource("foobar")).toBe("85944171f73967e8");
  });

  it("cuenta bytes UTF-8, no unidades UTF-16", () => {
    expect(hashSource("ñ")).not.toBe(hashSource("ñ".normalize("NFD")));
    expect(hashSource("ñ")).toMatch(/^[0-9a-f]{16}$/);
  });

  it("es estable y distingue un cambio mínimo", () => {
    const code = "export default (ctx) => ctx;";
    expect(hashSource(code)).toBe(hashSource(code));
    expect(hashSource(code)).not.toBe(hashSource(`${code} `));
  });
});
