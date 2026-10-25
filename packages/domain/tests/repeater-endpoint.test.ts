import { describe, expect, it } from "vitest";
import { endpointKeyInput } from "../src/repeater/endpoint.ts";

describe("endpointKeyInput (005, research R10)", () => {
  it("método en mayúsculas, origen y ruta, sin query ni fragmento", () => {
    expect(endpointKeyInput("get", "https://api.test:8443/items/42?x=1#f")).toBe(
      "GET https://api.test:8443/items/42",
    );
  });
  it("misma clave con query distinta", () => {
    expect(endpointKeyInput("GET", "https://a.test/x?p=1")).toBe(
      endpointKeyInput("GET", "https://a.test/x?p=2"),
    );
  });
  it("URL inválida ⇒ el texto sin query", () => {
    expect(endpointKeyInput("GET", "nope?x")).toBe("GET nope");
  });
});
