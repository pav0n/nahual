import { describe, expect, it } from "vitest";
import { DOMAIN_VERSION } from "../src/index.ts";

describe("@nahual/domain", () => {
  it("se puede importar sin APIs del navegador", () => {
    expect(DOMAIN_VERSION).toBe(0);
  });
});
