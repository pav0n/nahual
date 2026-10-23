import { describe, expect, it } from "vitest";
import { globToRegExp, matchesGlob } from "../src/match/glob.ts";

describe("glob (research R3)", () => {
  it("`*` coincide con cualquier secuencia, incluida `/`", () => {
    expect(matchesGlob("*/api/*", "https://x.test/api/items/1")).toBe(true);
    expect(matchesGlob("*/api/*", "https://x.test/other")).toBe(false);
    expect(matchesGlob("*", "https://x.test/")).toBe(true);
    expect(matchesGlob("*", "")).toBe(true);
  });

  it("`?` coincide con un carácter", () => {
    expect(matchesGlob("https://x.test/v?", "https://x.test/v1")).toBe(true);
    expect(matchesGlob("https://x.test/v?", "https://x.test/v12")).toBe(false);
  });

  it("el resto es literal, incluidos los metacaracteres de regex", () => {
    expect(matchesGlob("https://x.test/a.b", "https://x.test/a.b")).toBe(true);
    expect(matchesGlob("https://x.test/a.b", "https://x.test/aXb")).toBe(false);
    expect(matchesGlob("*(+)[x]{1}^$|*", "https://t/(+)[x]{1}^$|z")).toBe(true);
  });

  it("se compara con la URL completa", () => {
    expect(matchesGlob("x.test", "https://x.test/")).toBe(false);
    expect(matchesGlob("*x.test*", "https://x.test/")).toBe(true);
  });

  it("`\\` escapa el siguiente carácter", () => {
    expect(matchesGlob("https://x.test/\\*", "https://x.test/*")).toBe(true);
    expect(matchesGlob("https://x.test/\\*", "https://x.test/a")).toBe(false);
    expect(matchesGlob("a\\?", "a?")).toBe(true);
    expect(matchesGlob("a\\", "a\\")).toBe(true);
  });

  it("globToRegExp está anclada", () => {
    expect(globToRegExp("a*").source.startsWith("^")).toBe(true);
    expect(globToRegExp("a*").source.endsWith("$")).toBe(true);
  });
});
